import { expect, test, type Page } from '@playwright/test'
import { APP, Harness } from './app-harness'

/**
 * The real app against the real local model in Ollama, on this laptop. Opt in with
 * SKILLPILOT_REAL_MODEL=qwen3:4b (or another installed model). It prints what the model said, so a
 * person can judge the quality, and checks that every reply was usable and nothing left the laptop.
 */
const MODEL = process.env['SKILLPILOT_REAL_MODEL'] ?? ''
let h: Harness

test.skip(!MODEL, 'Set SKILLPILOT_REAL_MODEL to run against a real local model')
test.setTimeout(15 * 60_000)

test.afterEach(async () => {
  await h.close()
})

const go = (page: Page, section: string) => page.getByRole('button', { name: section, exact: true }).click()

async function openWithCareer(): Promise<Page> {
  h = await Harness.launch()
  await h.clickWidget()
  await expect.poll(() => h.visible(APP)).toBe(true)
  const page = await h.page(APP)
  await page.evaluate(async (model) => {
    const api = window.skillpilot
    const settings = await api.getSettings()
    if (settings.ok) await api.saveSettings({ ...settings.value, aiProvider: 'ollama', ollamaUrl: 'http://localhost:11434', ollamaModel: model })
    await api.saveProfile({ fullName: 'Asha Rao', headline: 'Aspiring Frontend Developer', email: 'asha@example.com', location: 'Pune', summary: 'Final-year computer engineering student who builds web apps.' })
    await api.saveRecord('skill', null, { name: 'HTML', claimedLevel: '4', status: 'using' })
    await api.saveRecord('skill', null, { name: 'JavaScript', claimedLevel: '3', status: 'using' })
    await api.saveRecord('skill', null, { name: 'React', claimedLevel: '2', status: 'learning' })
    await api.saveRecord('work', null, {
      company: 'Initech',
      role: 'Web Development Intern',
      startDate: '2025-06',
      endDate: '2025-12',
      description: '- Made a dashboard for the sales team\n- Fixed bugs in the company website\n- Wrote documentation'
    })
    await api.saveRecord('project', null, { name: 'Weather app', technologies: 'JavaScript, HTML, CSS', status: 'complete', description: 'Shows the weather for any city.' })
    await api.saveRecord('job', null, {
      title: 'Junior React Developer',
      company: 'Acme',
      description: 'Must have:\n- React and JavaScript\n- HTML and CSS\n- Git\n- REST APIs\nNice to have:\n- TypeScript\nFreshers welcome.'
    })
    await api.saveRecord('targetRole', null, { title: 'Frontend Developer' })
  }, MODEL)
  return page
}

const timed = async <T>(label: string, work: () => Promise<T>): Promise<T> => {
  const start = Date.now()
  const result = await work()
  console.log(`\n[${label}] took ${((Date.now() - start) / 1000).toFixed(1)} s`)
  return result
}

test('chat, the agent, resume wording, and role requirements all work with the real model', async () => {
  const page = await openWithCareer()
  await go(page, 'Settings')
  await expect(page.getByText(`Ready, using ${MODEL}.`)).toBeVisible({ timeout: 10_000 })

  const chat = await timed('chat', () => page.evaluate(() => window.skillpilot.sendChat('What should I learn next for a junior React job? Keep it short.')))
  expect(chat.ok, chat.ok ? '' : chat.message).toBe(true)
  if (chat.ok) console.log('Assistant said:', chat.value.at(-1)?.content)

  const agent = await timed('agent', () => page.evaluate(() => window.skillpilot.runAgent('Get me ready for the Junior React Developer job at Acme. Suggest at most two things.')))
  expect(agent.ok, agent.ok ? '' : agent.message).toBe(true)
  if (agent.ok) {
    console.log('Agent steps:', agent.value.steps.map((step) => `${step.action}(${step.input})`).join(' → '))
    console.log('Agent answer:', agent.value.answer)
    console.log('Agent suggested:', agent.value.suggested)
  }

  const jobs = await page.evaluate(() => window.skillpilot.listRecords('job'))
  const jobId = jobs.ok ? jobs.value[0]!.id : 0
  const resume = await page.evaluate((id) => window.skillpilot.buildResume(id), jobId)
  expect(resume.ok).toBe(true)
  if (!resume.ok) return
  console.log('Keyword coverage:', resume.value.keywords)
  const wording = await timed('resume wording', () => page.evaluate(([id, data]) => window.skillpilot.polishResume(id as number, data as never), [jobId, resume.value] as const))
  expect(wording.ok, wording.ok ? '' : wording.message).toBe(true)
  if (wording.ok) for (const s of wording.value) console.log(`Wording: "${s.original}" → "${s.reworded}"`)

  const roles = await page.evaluate(() => window.skillpilot.listRecords('targetRole'))
  const roleId = roles.ok ? roles.value[0]!.id : 0
  const drafted = await timed('role requirements', () => page.evaluate((id) => window.skillpilot.draftRequirements(id), roleId))
  expect(drafted.ok, drafted.ok ? '' : drafted.message).toBe(true)
  const proposals = await page.evaluate(() => window.skillpilot.listProposals())
  if (proposals.ok) console.log('Suggestions waiting:', proposals.value.map((p) => p.summary).join('; '))

  const blocked = await h.app.evaluate(() => (globalThis as { __skillpilotBlocked?: string[] }).__skillpilotBlocked ?? [])
  expect(blocked).toEqual([])
})

test('requests in everyday words, with typos, are understood and carried out by the real model', async () => {
  const page = await openWithCareer()
  await h.app.evaluate(() => {
    ;(globalThis as { __skillpilotDesktopLog?: string[] }).__skillpilotDesktopLog = []
  })
  const cases: [string, RegExp][] = [
    ['opne naukari', /openUrl \["https:\/\/www\.naukri\.com"/],
    ['can you pull up naukri for me', /openUrl \["https:\/\/www\.naukri\.com"/],
    ['i want to see react jobs near pune', /openUrl \["https:\/\/(www\.linkedin\.com\/jobs|www\.naukri\.com|in\.indeed\.com|www\.foundit\.in).*[Pp]une/],
    ['whats the weather in hyderabad today', /openUrl \["https:\/\/www\.google\.com\/search\?q=.*hyderabad/i],
    ['show me some lofi songs', /openUrl \["https:\/\/www\.youtube\.com\/results/],
    ['what is the latest version of react', /openUrl \["https:\/\/www\.google\.com\/search\?q=.*react/i]
  ]
  for (const [text, expected] of cases) {
    const before = (await h.app.evaluate(() => (globalThis as { __skillpilotDesktopLog?: string[] }).__skillpilotDesktopLog ?? [])).length
    const result = await timed(text, () => page.evaluate((t) => window.skillpilot.runCommand(t), text))
    expect(result.ok, result.ok ? '' : result.message).toBe(true)
    const log = await h.app.evaluate(() => (globalThis as { __skillpilotDesktopLog?: string[] }).__skillpilotDesktopLog ?? [])
    const done = log.slice(before)
    console.log(`"${text}" → ${result.ok ? result.value.reply : ''} | ${done.join(' ; ')}`)
    expect(done.some((line) => expected.test(line)), `"${text}" did ${done.join(' ; ') || 'nothing'}`).toBe(true)
  }
  const answer = await timed('question', () => page.evaluate(() => window.skillpilot.runCommand('am i ready for a frontend job?')))
  console.log('Question:', answer.ok ? answer.value : answer)
  expect(answer.ok && answer.value.ask).toBe('am i ready for a frontend job?')
  const blocked = await h.app.evaluate(() => (globalThis as { __skillpilotBlocked?: string[] }).__skillpilotBlocked ?? [])
  expect(blocked).toEqual([])
})
