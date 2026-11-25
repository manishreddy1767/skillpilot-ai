import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { APP, Harness, dataFolder } from './app-harness'

let h: Harness

test.afterEach(async () => {
  await h.close()
})

const go = (page: Page, section: string) => page.getByRole('button', { name: section, exact: true }).click()

/** Starts the app with browser and desktop actions recorded instead of done. */
async function launch(): Promise<Page> {
  h = await Harness.launch()
  await h.app.evaluate(() => {
    ;(globalThis as { __skillpilotDesktopLog?: string[] }).__skillpilotDesktopLog = []
  })
  await h.clickWidget()
  await expect.poll(() => h.visible(APP)).toBe(true)
  return h.page(APP)
}

const desktopLog = () => h.app.evaluate(() => (globalThis as { __skillpilotDesktopLog?: string[] }).__skillpilotDesktopLog ?? [])

const answerOpenDialog = (path: string) =>
  h.app.evaluate(({ dialog }, chosen) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [chosen] })) as never
  }, path)

const savedPage = `<!DOCTYPE html><html><head>
<title>Junior React Developer - Acme Tech | LinkedIn</title>
<script type="application/ld+json">${JSON.stringify({
  '@type': 'JobPosting',
  title: 'Junior React Developer',
  hiringOrganization: { name: 'Acme Tech' },
  jobLocation: { address: { addressLocality: 'Pune' } },
  url: 'https://www.linkedin.com/jobs/view/99',
  description: '<p>Must have:</p><ul><li>React and JavaScript</li><li>CSS</li></ul><p>Nice to have:</p><ul><li>TypeScript</li></ul><p>Freshers welcome.</p>'
}).replace(/<\//g, '<\\/')}</script>
</head><body></body></html>`

test('a saved LinkedIn page becomes a matched job, and its missing skills can be learned', async () => {
  const page = await launch()
  await page.evaluate(() => window.skillpilot.saveRecord('skill', null, { name: 'ReactJS', claimedLevel: '3', status: 'using' }))
  mkdirSync(dataFolder, { recursive: true })
  const file = join(dataFolder, 'job.html')
  writeFileSync(file, savedPage)
  await answerOpenDialog(file)

  await go(page, 'Jobs')
  await page.getByRole('button', { name: 'Import a saved job page' }).click()
  await expect(page.getByText('Job imported. Check the details below.')).toBeVisible()
  await expect(page.getByText(/Missing: JavaScript, CSS, TypeScript · Open to freshers|Missing: .* · Open to freshers/)).toBeVisible()

  await page.getByRole('button', { name: 'Details for Junior React Developer' }).click()
  await expect(page.getByText('You have it, not yet proven, level 3')).toBeVisible()
  await page.getByRole('button', { name: 'Suggest the missing skills to learn' }).click()
  await page.getByRole('button', { name: 'Accept Add skill: CSS' }).click()
  await go(page, 'Skills')
  await expect(page.getByRole('button', { name: 'Edit CSS' })).toBeVisible()

  await go(page, 'Jobs')
  await page.getByRole('button', { name: 'Details for Junior React Developer' }).click()
  await page.getByRole('button', { name: 'Open job in Chrome' }).click()
  await expect.poll(desktopLog).toContain('openUrl ["https://www.linkedin.com/jobs/view/99","chrome"]')
})

test('job site searches open in Chrome and fetch nothing themselves', async () => {
  const page = await launch()
  await go(page, 'Jobs')
  await page.getByLabel('Job title or skills').fill('Data Analyst')
  await page.getByLabel('Location').fill('Hyderabad')
  await page.getByRole('button', { name: 'Search Naukri' }).click()
  await expect(page.getByText('Opened Naukri in your browser.')).toBeVisible()
  expect(await desktopLog()).toContain(
    'openUrl ["https://www.naukri.com/data-analyst-jobs-in-hyderabad?k=Data%20Analyst&l=Hyderabad","chrome"]'
  )
  const blocked = await h.app.evaluate(() => (globalThis as { __skillpilotBlocked?: string[] }).__skillpilotBlocked ?? [])
  expect(blocked).toEqual([])
})

test('other windows cannot use jobs', async () => {
  h = await Harness.launch()
  for (const title of ['SkillPilot Widget', 'SkillPilot Overview']) {
    const results = await (await h.page(title)).evaluate(async () => {
      const api = window.skillpilot
      return [await api.rankJobs(), await api.matchJob(1), await api.importJobPage(), await api.searchJobs('linkedin', 'x', ''), await api.suggestJobSkills(1)]
    })
    for (const result of results) expect(result).toEqual({ ok: false, message: 'Not allowed.' })
  }
})
