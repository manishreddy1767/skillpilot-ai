import { createServer, type Server } from 'node:http'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { APP, Harness, OVERVIEW, WIDGET, dataFolder, databaseFile } from './app-harness'

const KEY = 'sk-ant-integration-test-key'

let h: Harness
let server: Server
let base: string
let requests: { headers: Record<string, unknown>; body: { system: string; messages: { content: string }[] } }[]
let replies: unknown[]

/** Speaks the real streaming format, so the real SDK runs from end to end. */
function respond(res: import('node:http').ServerResponse, reply: unknown): void {
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  send('message_start', {
    type: 'message_start',
    message: {
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      model: 'claude-opus-5-5',
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 100, output_tokens: 1 }
    }
  })
  send('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })
  send('content_block_delta', {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text: JSON.stringify(reply) }
  })
  send('content_block_stop', { type: 'content_block_stop', index: 0 })
  send('message_delta', {
    type: 'message_delta',
    delta: { stop_reason: 'end_turn', stop_sequence: null },
    usage: { output_tokens: 20 }
  })
  send('message_stop', { type: 'message_stop' })
  res.end()
}

test.beforeEach(async () => {
  requests = []
  replies = []
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      requests.push({ headers: req.headers, body: JSON.parse(body) })
      respond(res, replies.shift())
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

async function enableClaude(page: Page): Promise<void> {
  await go(page, 'Settings')
  await page.getByLabel('AI provider').selectOption('claude')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  await page.getByLabel('API key').fill(KEY)
  await page.getByRole('button', { name: 'Save key' }).click()
  await expect(page.getByText('A key is saved')).toBeVisible()
}

const seed = (page: Page, work: (api: Window['skillpilot']) => Promise<unknown>) =>
  page.evaluate(`(${work.toString()})(window.skillpilot)`)

test('everything except AI works with no key, and sends nothing', async () => {
  h = await Harness.launch({ aiBase: base })
  const page = await openApp()
  await go(page, 'Assistant')
  await expect(page.getByText('AI is off. Choose a provider in Settings.')).toBeVisible()
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
  h = await Harness.launch({ aiBase: base })
  const page = await openApp()
  await enableClaude(page)
  replies.push({
    reply: 'Learn Docker next.',
    proposals: [{ kind: 'addSkill', title: 'Docker', note: 'Needed for deployment', minutes: 0 }]
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
  h = await Harness.launch({ aiBase: base })
  const page = await openApp()
  await enableClaude(page)
  replies.push({ reply: 'Ok', proposals: [{ kind: 'addGoal', title: 'Unwanted', note: '', minutes: 0 }] })
  await go(page, 'Assistant')
  await page.getByLabel('Your message').fill('Hi')
  await page.getByRole('button', { name: 'Send' }).click()
  await page.getByRole('button', { name: 'Reject Add goal: Unwanted' }).click()
  await expect(page.getByText('Add goal: Unwanted')).toHaveCount(0)
  await go(page, 'Goals')
  await expect(page.getByText('Unwanted')).toHaveCount(0)
})

test('private details are not sent, and the log shows exactly what was', async () => {
  h = await Harness.launch({ aiBase: base })
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
  await enableClaude(page)
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

test('the key is encrypted on disk and reaches only the provider', async () => {
  h = await Harness.launch({ aiBase: base })
  const page = await openApp()
  await enableClaude(page)
  replies.push({ reply: 'Ok', proposals: [] })
  await go(page, 'Assistant')
  await page.getByLabel('Your message').fill('Hi')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Ok', { exact: true })).toBeVisible()

  expect(String(requests[0]!.headers['authorization'])).toContain(KEY)
  await h.close()

  const keyFile = join(dataFolder, 'api-key.enc')
  expect(existsSync(keyFile)).toBe(true)
  expect(readFileSync(keyFile).includes(KEY)).toBe(false)
  for (const name of ['', '-wal']) {
    const path = databaseFile + name
    if (existsSync(path)) expect(readFileSync(path).includes(KEY)).toBe(false)
  }
  for (const name of readdirSync(join(dataFolder, 'backups'))) {
    expect(readFileSync(join(dataFolder, 'backups', name)).includes(KEY)).toBe(false)
  }

  // Still works after a restart, so it really was decrypted from disk.
  h = await Harness.launch({ aiBase: base, keepData: true })
  const reopened = await openApp()
  replies.push({ reply: 'Back again', proposals: [] })
  await go(reopened, 'Assistant')
  await reopened.getByLabel('Your message').fill('Hi')
  await reopened.getByRole('button', { name: 'Send' }).click()
  await expect(reopened.getByText('Back again')).toBeVisible()
  expect(String(requests.at(-1)!.headers['authorization'])).toContain(KEY)
})

test('a rejected key gives a clear message', async () => {
  const rejecting = createServer((_req, res) => {
    res.writeHead(401, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'bad' } }))
  })
  await new Promise<void>((done) => rejecting.listen(0, '127.0.0.1', done))
  h = await Harness.launch({ aiBase: `http://127.0.0.1:${(rejecting.address() as AddressInfo).port}` })
  const page = await openApp()
  await enableClaude(page)
  await go(page, 'Assistant')
  await page.getByLabel('Your message').fill('Hi')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByRole('alert')).toContainText('rejected the API key')
  await new Promise((done) => rejecting.close(done))
})

test('a target role goes from AI requirements to report to roadmap', async () => {
  h = await Harness.launch({ aiBase: base })
  const page = await openApp()
  await seed(page, (api) => api.saveRecord('targetRole', null, { title: 'Frontend Dev' }))
  await enableClaude(page)
  await go(page, 'Target roles')
  await page.getByRole('button', { name: 'Details for Frontend Dev' }).click()

  replies.push({ requirements: [{ skillName: 'CSS', requiredLevel: 3, importance: 3 }] })
  await page.getByRole('button', { name: 'Draft requirements' }).click()
  await page.getByRole('button', { name: 'Accept Add requirement: CSS' }).click()
  await expect(page.getByRole('cell', { name: 'CSS' })).toBeVisible()

  replies.push({ summary: 'CSS is your main gap.', priorities: ['Learn CSS layout'] })
  await page.getByRole('button', { name: 'Write gap report' }).click()
  await expect(page.getByText('CSS is your main gap.')).toBeVisible()
  expect(requests.at(-1)!.body.messages[0]!.content).toContain('CSS: needs level 3')

  replies.push({
    title: 'Frontend path',
    items: [{ title: 'CSS layout', week: 1, effortHours: 6, details: 'Grid', exercise: 'Build a page', resources: 'MDN' }]
  })
  await page.getByRole('button', { name: 'Create roadmap' }).click()
  await page.getByRole('button', { name: 'Accept Add roadmap: Frontend path' }).click()
  await go(page, 'Roadmaps')
  await page.getByRole('button', { name: 'Details for Frontend path' }).click()
  await expect(page.getByText('CSS layout')).toBeVisible()
})

test('roadmaps can be created and edited without AI', async () => {
  h = await Harness.launch({ aiBase: base })
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
  await expect(page.getByText('Read a book')).toBeVisible()
  expect(requests).toHaveLength(0)
})

test('other windows cannot use AI, settings, or the key', async () => {
  h = await Harness.launch({ aiBase: base })
  for (const title of [WIDGET, OVERVIEW]) {
    const results = await (await h.page(title)).evaluate(async () => {
      const api = window.skillpilot
      return [
        await api.getSettings(),
        await api.saveSettings({}),
        await api.saveApiKey('sk-hacked'),
        await api.removeApiKey(),
        await api.getAiStatus(),
        await api.sendChat('Hi'),
        await api.getChat(),
        await api.acceptProposal(1),
        await api.getAiLog()
      ]
    })
    for (const result of results) expect(result).toEqual({ ok: false, message: 'Not allowed.' })
  }
  expect(existsSync(join(dataFolder, 'api-key.enc'))).toBe(false)
})
