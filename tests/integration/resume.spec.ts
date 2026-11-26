import { existsSync, readFileSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { APP, Harness, dataFolder } from './app-harness'

let h: Harness
let server: Server | null = null

test.afterEach(async () => {
  await h.close()
  if (server) await new Promise((done) => server!.close(done))
  server = null
})

const go = (page: Page, section: string) => page.getByRole('button', { name: section, exact: true }).click()

async function openWithData(): Promise<Page> {
  h = await Harness.launch()
  await h.clickWidget()
  await expect.poll(() => h.visible(APP)).toBe(true)
  const page = await h.page(APP)
  await page.evaluate(async () => {
    const api = window.skillpilot
    await api.saveProfile({ fullName: 'Asha Rao', headline: 'Frontend Developer', email: 'asha@example.com', location: 'Pune' })
    await api.saveRecord('skill', null, { name: 'ReactJS', claimedLevel: '3', status: 'using' })
    await api.saveRecord('skill', null, { name: 'Python', claimedLevel: '3', status: 'using' })
    await api.saveRecord('work', null, {
      company: 'Initech',
      role: 'Intern',
      startDate: '2025-06',
      endDate: '2025-12',
      description: '- Wrote Python scripts for reports\n- Built a React dashboard'
    })
    await api.saveRecord('job', null, {
      title: 'React Developer',
      company: 'Acme',
      description: 'Must have: React, JavaScript, CSS. Nice to have: TypeScript.'
    })
  })
  return page
}

test('a tailored resume is built from your data and printed to a real PDF, offline', async () => {
  const page = await openWithData()
  const pdf = join(dataFolder, 'Asha Rao resume.pdf')
  rmSync(pdf, { force: true })
  await h.app.evaluate(({ dialog }, chosen) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: chosen })) as never
  }, pdf)

  await go(page, 'Jobs')
  await page.getByRole('button', { name: 'Details for React Developer' }).click()
  await page.getByRole('button', { name: 'Build a tailored resume' }).click()

  const preview = page.getByLabel('Preview')
  await expect(preview).toContainText('Asha Rao')
  await expect(preview).toContainText('Built a React dashboard')
  // The job's skill comes first, and the relevant point leads.
  await expect(page.getByLabel('Points for Intern at Initech')).toHaveValue('Built a React dashboard\nWrote Python scripts for reports')
  await expect(page.getByText(/Missing: .*JavaScript.*Only add these/)).toBeVisible()
  await expect(preview).not.toContainText('JavaScript')

  await page.getByRole('button', { name: 'Export PDF' }).click()
  await expect(page.getByText(`Saved to ${pdf}`)).toBeVisible()
  expect(readFileSync(pdf).subarray(0, 5).toString()).toBe('%PDF-')
  const blocked = await h.app.evaluate(() => (globalThis as { __skillpilotBlocked?: string[] }).__skillpilotBlocked ?? [])
  expect(blocked).toEqual([])

  await page.getByRole('button', { name: 'Save version' }).click()
  await expect(page.getByRole('button', { name: /Open React Developer at Acme from/ })).toBeVisible()
})

test('the local AI suggests wording, and a suggestion claiming a skill you lack never appears', async () => {
  server = createServer((req, res) => {
    req.resume()
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' })
      if (req.url === '/api/tags') return void res.end(JSON.stringify({ models: [{ name: 'qwen3:4b' }] }))
      const reply = {
        summary: '',
        experience: [{ entry: 0, bullets: ['Built an interactive React dashboard for managers', 'Wrote Python scripts on Kubernetes'] }],
        projects: []
      }
      res.end(JSON.stringify({ message: { content: JSON.stringify(reply) } }))
    })
  })
  await new Promise<void>((done) => server!.listen(0, '127.0.0.1', done))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  const page = await openWithData()
  await page.evaluate(async (address) => {
    const settings = await window.skillpilot.getSettings()
    if (settings.ok) await window.skillpilot.saveSettings({ ...settings.value, ollamaUrl: address })
  }, base)
  await go(page, 'Resume')
  await page.getByRole('button', { name: 'Build resume' }).click()
  await page.getByRole('button', { name: 'Suggest clearer wording' }).click()
  await page.getByRole('button', { name: 'Accept: Built an interactive React dashboard for managers' }).click()
  await expect(page.getByLabel('Points for Intern at Initech')).toHaveValue(/Built an interactive React dashboard for managers/)
  await expect(page.getByText(/Kubernetes/)).toHaveCount(0)
})

test('nothing is exported when the save is cancelled', async () => {
  rmSync(join(dataFolder, 'Asha Rao resume.pdf'), { force: true })
  const page = await openWithData()
  await h.app.evaluate(({ dialog }) => {
    dialog.showSaveDialog = (async () => ({ canceled: true, filePath: '' })) as never
  })
  await go(page, 'Resume')
  await page.getByRole('button', { name: 'Build resume' }).click()
  await page.getByRole('button', { name: 'Export PDF' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(existsSync(join(dataFolder, 'Asha Rao resume.pdf'))).toBe(false)
})

test('other windows cannot build or export resumes', async () => {
  h = await Harness.launch()
  for (const title of ['SkillPilot Widget', 'SkillPilot Overview']) {
    const results = await (await h.page(title)).evaluate(async () => {
      const api = window.skillpilot
      return [await api.buildResume(null), await api.listResumes(), await api.exportResume({} as never, 'classic', 'pdf')]
    })
    for (const result of results) expect(result).toEqual({ ok: false, message: 'Not allowed.' })
  }
})
