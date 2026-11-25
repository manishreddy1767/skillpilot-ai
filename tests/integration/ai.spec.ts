import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, test, type Page } from '@playwright/test'
import { APP, Harness, OVERVIEW, WIDGET } from './app-harness'

let h: Harness
let server: Server
let base: string
let requests: { url: string; headers: Record<string, unknown>; body: { system?: string; messages: { role: string; content: string }[] } }[]
let replies: unknown[]

/** A stand-in for Ollama on this laptop, speaking its API, so the real local provider runs end to end. */
function respond(res: import('node:http').ServerResponse, url: string, reply: unknown): void {
  res.writeHead(200, { 'content-type': 'application/json' })
  if (url === '/api/tags') return void res.end(JSON.stringify({ models: [{ name: 'qwen3:4b' }] }))
  res.end(JSON.stringify({ message: { role: 'assistant', content: JSON.stringify(reply) }, prompt_eval_count: 100, eval_count: 20 }))
}

test.beforeEach(async () => {
  requests = []
  replies = []
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      if (req.url === '/api/chat') requests.push({ url: req.url, headers: req.headers, body: JSON.parse(body) })
      respond(res, req.url ?? '', req.url === '/api/chat' ? replies.shift() : null)
    })
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

test.afterEach(async () => {
  await h.close()
  await new Promise((done) => server.close(done))
})

async function openApp(): Promise<Page> {
  await h.clickWidget()
  await expect.poll(() => h.visible(APP)).toBe(true)
  return h.page(APP)
}

const go = (page: Page, section: string) => page.getByRole('button', { name: section, exact: true }).click()

/** Points the app at the stand-in Ollama, through Settings as a person would. */
async function useLocalAi(page: Page): Promise<void> {
  await go(page, 'Settings')
  await page.getByLabel('Local AI').selectOption('ollama')
  await page.getByLabel('Ollama address').fill(base)
  await page.getByLabel('Model').fill('qwen3:4b')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  await expect(page.getByText('Ready, using qwen3:4b.')).toBeVisible()
}

async function turnAiOff(page: Page): Promise<void> {
  await go(page, 'Settings')
  await page.getByLabel('Local AI').selectOption('off')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
}

const seed = (page: Page, work: (api: Window['skillpilot']) => Promise<unknown>) =>
  page.evaluate(`(${work.toString()})(window.skillpilot)`)

test('everything except AI works with the local AI off, and asks nothing', async () => {
  h = await Harness.launch()
  const page = await openApp()
  await turnAiOff(page)
  await go(page, 'Assistant')
  await expect(page.getByText('The local AI is off. Turn it on in Settings.')).toBeVisible()
  await go(page, 'Target roles')
  await page.getByRole('button', { name: 'Add target role' }).click()
  await page.getByLabel('Target role', { exact: false }).first().fill('Frontend Dev')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('button', { name: 'Details for Frontend Dev' }).click()
  await page.getByRole('button', { name: 'Add requirement' }).click()
  await page.getByLabel('Required skill').fill('CSS')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('cell', { name: 'CSS' })).toBeVisible()
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  await expect(page.getByRole('button', { name: 'Create roadmap' })).toBeDisabled()
  expect(requests).toHaveLength(0)
})

test('chat works end to end, and a suggestion is saved only once accepted', async () => {
  h = await Harness.launch()
  const page = await openApp()
  await useLocalAi(page)
  replies.push({
    reply: 'Learn Docker next.',
    proposals: [{ kind: 'addSkill', title: 'Docker', note: 'Needed for deployment', minutes: 0, level: 0 }]
  })
  await go(page, 'Assistant')
  await page.getByLabel('Your message').fill('What next?')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Learn Docker next.')).toBeVisible()
  await expect(page.getByText('Add skill: Docker')).toBeVisible()

  await go(page, 'Skills')
  await expect(page.getByRole('button', { name: 'Edit Docker' })).toHaveCount(0)

  await go(page, 'Assistant')
  await page.getByRole('button', { name: 'Accept Add skill: Docker' }).click()
  await expect(page.getByText('Add skill: Docker')).toHaveCount(0)
  await go(page, 'Skills')
  await expect(page.getByRole('button', { name: 'Edit Docker' })).toBeVisible()
})

test('a rejected suggestion is not saved', async () => {
  h = await Harness.launch()
  const page = await openApp()
  await useLocalAi(page)
  replies.push({ reply: 'Ok', proposals: [{ kind: 'addGoal', title: 'Unwanted', note: '', minutes: 0, level: 0 }] })
  await go(page, 'Assistant')
  await page.getByLabel('Your message').fill('Hi')
  await page.getByRole('button', { name: 'Send' }).click()
  await page.getByRole('button', { name: 'Reject Add goal: Unwanted' }).click()
  await expect(page.getByText('Add goal: Unwanted')).toHaveCount(0)
  await go(page, 'Goals')
  await expect(page.getByText('Unwanted')).toHaveCount(0)
})

test('the local model gets only career details, and the log shows exactly what it got', async () => {
  h = await Harness.launch()
  const page = await openApp()
  await seed(page, async (api) => {
    await api.saveProfile({
      fullName: 'Private Person',
      email: 'private@mail.example',
      phone: '555-0100',
      location: 'Hiddenville',
      headline: 'Aspiring developer'
    })
    await api.saveRecord('work', null, { company: 'Private Corp', role: 'Analyst' })
  })
  await useLocalAi(page)
  replies.push({ reply: 'Noted', proposals: [] })
  await go(page, 'Assistant')
  await page.getByLabel('Your message').fill('Hello')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Noted')).toBeVisible()

  const wire = JSON.stringify(requests[0]!.body)
  expect(wire).toContain('Aspiring developer')
  expect(wire).toContain('Analyst')
  expect(wire).not.toMatch(/Private Person|private@mail|555-0100|Hiddenville|Private Corp/)

  await go(page, 'Settings')
  await page.locator('details.sent summary').first().click()
  await expect(page.locator('pre').first()).toContainText('Aspiring developer')
  await expect(page.locator('pre').first()).toContainText('Hello')
})

test('requests go only to the local model, with no credentials of any kind', async () => {
  h = await Harness.launch()
  const page = await openApp()
  await useLocalAi(page)
  replies.push({ reply: 'Ok', proposals: [] })
  await go(page, 'Assistant')
  await page.getByLabel('Your message').fill('Hi')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Ok', { exact: true })).toBeVisible()
  expect(requests).toHaveLength(1)
  expect(requests[0]!.url).toBe('/api/chat')
  expect(requests[0]!.headers['authorization']).toBeUndefined()
  expect(requests[0]!.headers['x-api-key']).toBeUndefined()
  expect(requests[0]!.body).toMatchObject({ model: 'qwen3:4b', stream: false, think: false })
})

test('a model that is not installed gives a clear message', async () => {
  const missing = createServer((req, res) => {
    if (req.url === '/api/tags') return void res.end(JSON.stringify({ models: [{ name: 'qwen3:4b' }] }))
    res.writeHead(404)
    res.end('{}')
  })
  await new Promise<void>((done) => missing.listen(0, '127.0.0.1', done))
  h = await Harness.launch()
  const page = await openApp()
  await go(page, 'Settings')
  await page.getByLabel('Ollama address').fill(`http://127.0.0.1:${(missing.address() as AddressInfo).port}`)
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  await go(page, 'Assistant')
  await page.getByLabel('Your message').fill('Hi')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByRole('alert')).toContainText('"qwen3:4b" is not installed')
  await new Promise((done) => missing.close(done))
})

test('a target role goes from AI requirements to report to roadmap', async () => {
  h = await Harness.launch()
  const page = await openApp()
  await seed(page, (api) => api.saveRecord('targetRole', null, { title: 'Frontend Dev' }))
  await useLocalAi(page)
  await go(page, 'Target roles')
  await page.getByRole('button', { name: 'Details for Frontend Dev' }).click()

  replies.push({ requirements: [{ skillName: 'CSS', requiredLevel: 3, importance: 3 }] })
  await page.getByRole('button', { name: 'Draft requirements' }).click()
  await page.getByRole('button', { name: 'Accept Add requirement: CSS' }).click()
  await expect(page.getByRole('cell', { name: 'CSS' })).toBeVisible()

  replies.push({ summary: 'CSS is your main gap.', priorities: ['Learn CSS layout'] })
  await page.getByRole('button', { name: 'Write gap report' }).click()
  await expect(page.getByText('CSS is your main gap.')).toBeVisible()
  expect(requests.at(-1)!.body.messages.at(-1)!.content).toContain('CSS: needs level 3')

  replies.push({
    title: 'Frontend path',
    items: [{ title: 'CSS layout', week: 1, effortHours: 6, details: 'Grid', exercise: 'Build a page', resources: 'MDN' }]
  })
  await page.getByRole('button', { name: 'Create roadmap' }).click()
  await page.getByRole('button', { name: 'Accept Add roadmap: Frontend path' }).click()
  await go(page, 'Roadmaps')
  await page.getByRole('button', { name: 'Details for Frontend path' }).click()
  await expect(page.getByText('CSS layout', { exact: true })).toBeVisible()
})

test('project ideas link to existing skills when accepted', async () => {
  h = await Harness.launch()
  const page = await openApp()
  await seed(page, (api) => api.saveRecord('skill', null, { name: 'React' }))
  await useLocalAi(page)
  replies.push({
    projects: [{ name: 'Portfolio shop', description: 'A shop', technologies: 'React', skills: ['React', 'Docker'] }]
  })
  await go(page, 'Projects')
  await page.getByRole('button', { name: 'Suggest projects for my gaps' }).click()
  await expect(page.getByText('Not in your skills yet: Docker')).toBeVisible()
  await page.getByRole('button', { name: 'Accept Add project: Portfolio shop' }).click()
  await page.getByRole('button', { name: 'Details for Portfolio shop' }).click()
  await expect(page.getByRole('checkbox', { name: 'React' })).toBeChecked()
})

test('the assistant can change an existing skill level, shown before and after', async () => {
  h = await Harness.launch()
  const page = await openApp()
  await seed(page, (api) => api.saveRecord('skill', null, { name: 'React', claimedLevel: '2' }))
  await useLocalAi(page)
  replies.push({ reply: 'Nice work.', proposals: [{ kind: 'setSkillLevel', title: 'React', note: 'You built two apps', minutes: 0, level: 4 }] })
  await go(page, 'Assistant')
  await page.getByLabel('Your message').fill('I built two React apps')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Level: 2 → 4')).toBeVisible()
  await page.getByRole('button', { name: 'Accept Change level: React' }).click()
  await go(page, 'Skills')
  await expect(page.getByLabel('React: claimed level 4 of 5')).toHaveText('4')
})

test('roadmaps can be created and edited without AI', async () => {
  h = await Harness.launch()
  const page = await openApp()
  await go(page, 'Roadmaps')
  await page.getByRole('button', { name: 'Add roadmap' }).click()
  await page.getByLabel('Roadmap', { exact: false }).first().fill('My own plan')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('button', { name: 'Details for My own plan' }).click()
  await page.getByRole('button', { name: 'Add topic' }).click()
  await page.getByLabel('Topic').fill('Read a book')
  await page.getByLabel('Week').fill('3')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Read a book', { exact: true })).toBeVisible()
  expect(requests).toHaveLength(0)
})

test('other windows cannot use AI or settings', async () => {
  h = await Harness.launch()
  for (const title of [WIDGET, OVERVIEW]) {
    const results = await (await h.page(title)).evaluate(async () => {
      const api = window.skillpilot
      return [
        await api.getSettings(),
        await api.saveSettings({}),
        await api.getAiStatus(),
        await api.sendChat('Hi'),
        await api.getChat(),
        await api.acceptProposal(1),
        await api.getAiLog()
      ]
    })
    for (const result of results) expect(result).toEqual({ ok: false, message: 'Not allowed.' })
  }
})
