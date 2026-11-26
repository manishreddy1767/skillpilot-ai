import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, test, type Page } from '@playwright/test'
import { APP, Harness } from './app-harness'

let h: Harness
let server: Server

test.afterEach(async () => {
  await h.close()
  await new Promise((done) => server.close(done))
})

const go = (page: Page, section: string) => page.getByRole('button', { name: section, exact: true }).click()

/** A stand-in for Ollama that plays the agent's steps in turn, and records what it was shown. */
async function scriptedOllama(steps: object[]): Promise<{ base: string; seen: string[] }> {
  const seen: string[] = []
  let call = 0
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' })
      if (req.url === '/api/tags') return void res.end(JSON.stringify({ models: [{ name: 'qwen3:4b' }] }))
      seen.push(body)
      const reply = steps[Math.min(call++, steps.length - 1)]
      res.end(JSON.stringify({ message: { content: JSON.stringify(reply) } }))
    })
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen }
}

test('the agent looks things up, suggests, and nothing changes until you accept', async () => {
  const { base, seen } = await scriptedOllama([
    { thought: '', action: 'list_jobs', input: '', answer: '' },
    { thought: '', action: 'suggest_skill', input: 'Power BI', answer: '' },
    { thought: '', action: 'finish', input: '', answer: 'Power BI is what the Data Analyst job needs most, so I suggested it.' }
  ])
  h = await Harness.launch()
  await h.clickWidget()
  await expect.poll(() => h.visible(APP)).toBe(true)
  const page = await h.page(APP)
  await page.evaluate(async (address) => {
    const api = window.skillpilot
    const settings = await api.getSettings()
    if (settings.ok) await api.saveSettings({ ...settings.value, ollamaUrl: address })
    await api.saveRecord('job', null, { title: 'Data Analyst', company: 'Globex', description: 'Must have SQL and Power BI' })
  }, base)

  await go(page, 'Assistant')
  await page.getByLabel('Your message').fill('Get me ready for the Data Analyst job')
  await page.getByRole('button', { name: 'Let the agent do it' }).click()
  await expect(page.getByText('Power BI is what the Data Analyst job needs most, so I suggested it.')).toBeVisible()
  await expect(page.getByText('What the agent did (2 steps)')).toBeVisible()
  // The model was shown the job before it suggested anything.
  expect(seen[1]).toContain('Result of list_jobs: Data Analyst at Globex')

  await go(page, 'Skills')
  await expect(page.getByRole('button', { name: 'Edit Power BI' })).toHaveCount(0)
  await go(page, 'Assistant')
  await page.getByRole('button', { name: 'Accept Add skill: Power BI' }).click()
  await go(page, 'Skills')
  await expect(page.getByRole('button', { name: 'Edit Power BI' })).toBeVisible()
})

test('other windows cannot start the agent', async () => {
  await scriptedOllama([])
  h = await Harness.launch()
  for (const title of ['SkillPilot Widget', 'SkillPilot Overview']) {
    expect(await (await h.page(title)).evaluate(() => window.skillpilot.runAgent('Do things'))).toEqual({ ok: false, message: 'Not allowed.' })
  }
})
