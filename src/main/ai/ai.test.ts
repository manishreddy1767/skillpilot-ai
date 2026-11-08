import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CareerStore } from '../db/career-store'
import { migrate } from '../db/migrations'
import { AiService, applyProposal } from './ai-service'
import { AiStore } from './ai-store'
import { buildCareerContext } from './context'
import { integer, list, matchesSchema, object, oneOf, text } from './json-schema'
import { KeyStore } from './key-store'
import { AiError, createClaudeProvider, createOllamaProvider, type AiProvider } from './providers'

const open: DatabaseSync[] = []
const servers: Server[] = []
const today = () => '2026-11-06'

function stores() {
  const db = new DatabaseSync(':memory:')
  open.push(db)
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db, () => undefined)
  return { db, store: new CareerStore(db), aiStore: new AiStore(db) }
}

function fakeProvider(reply: unknown) {
  const complete = vi.fn(async () => ({ json: reply, inputTokens: 10, outputTokens: 5 }))
  const provider: AiProvider = { name: 'fake', model: 'fake-1', complete }
  return { provider, complete }
}

function service(reply: unknown) {
  const s = stores()
  const { provider, complete } = fakeProvider(reply)
  return { ...s, complete, ai: new AiService({ ...s, provider: async () => provider, today }) }
}

async function serve(handler: (req: IncomingMessage, body: string, res: ServerResponse) => void): Promise<string> {
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => handler(req, body, res))
  })
  servers.push(server)
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

/** The server-sent events a real streamed Messages response is made of. */
function claudeStream(res: ServerResponse, textOut: string, stopReason = 'end_turn'): void {
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
      usage: { input_tokens: 120, output_tokens: 1 }
    }
  })
  send('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })
  send('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: textOut } })
  send('content_block_stop', { type: 'content_block_stop', index: 0 })
  send('message_delta', {
    type: 'message_delta',
    delta: { stop_reason: stopReason, stop_sequence: null },
    usage: { output_tokens: 40 }
  })
  send('message_stop', { type: 'message_stop' })
  res.end()
}

const request = { system: 'sys', messages: [{ role: 'user' as const, content: 'hi' }], schema: object({ a: text }), effort: 'low' as const }

beforeEach(() => {
  vi.stubEnv('ANTHROPIC_BASE_URL', '')
})

afterEach(async () => {
  vi.unstubAllEnvs()
  for (const db of open.splice(0)) if (db.isOpen) db.close()
  await Promise.all(servers.splice(0).map((s) => new Promise((done) => s.close(done))))
})

describe('matchesSchema', () => {
  const schema = object({ a: text, b: integer, c: oneOf('x', 'y'), d: list(object({ e: text })) })
  const good = { a: 's', b: 1, c: 'x', d: [{ e: 't' }] }

  it('accepts a matching value', () => {
    expect(matchesSchema(schema, good)).toBe(true)
  })

  it.each([
    ['a wrong type', { ...good, a: 1 }],
    ['a decimal', { ...good, b: 1.5 }],
    ['an unknown choice', { ...good, c: 'z' }],
    ['a missing key', { a: 's', b: 1, c: 'x' }],
    ['a bad nested item', { ...good, d: [{ e: 1 }] }],
    ['null', null],
    ['an array', []]
  ])('rejects %s', (_name, value) => {
    expect(matchesSchema(schema, value)).toBe(false)
  })

  it('marks every property required with no extras, as structured output needs', () => {
    expect(schema).toMatchObject({ required: ['a', 'b', 'c', 'd'], additionalProperties: false })
  })
})

describe('buildCareerContext', () => {
  it('leaves out name, email, phone and location', () => {
    const { store } = stores()
    store.saveProfile({
      fullName: 'Secret Person',
      email: 'secret@mail.example',
      phone: '555-0100',
      location: 'Hiddenville',
      headline: 'Aspiring developer',
      summary: '',
      currentGoal: 'Ship',
      targetRoles: '',
      shortTermGoals: '',
      longTermGoals: '',
      interests: '',
      preferences: ''
    })
    const context = buildCareerContext(store, today())
    expect(context).toContain('Aspiring developer')
    expect(context).not.toMatch(/Secret Person|secret@mail|555-0100|Hiddenville/)
  })

  it('leaves out the employer and institution names', () => {
    const { store } = stores()
    store.saveRecord('work', null, { company: 'Secret Corp', role: 'Developer', startDate: '', endDate: '', description: '' })
    store.saveRecord('education', null, { institution: 'Secret Uni', qualification: 'BSc', fieldOfStudy: '', startDate: '', endDate: '', notes: '' })
    const context = buildCareerContext(store, today())
    expect(context).toContain('Developer')
    expect(context).toContain('BSc')
    expect(context).not.toMatch(/Secret Corp|Secret Uni/)
  })

  it('includes skills with both levels, goals, projects and role gaps', () => {
    const { store } = stores()
    const skill = store.saveRecord('skill', null, { name: 'React', category: 'technical', claimedLevel: '4', status: 'using', notes: '' })!
    store.saveRecord('evidence', null, { description: 'x', kind: 'work', strength: '3', observedOn: '' }, skill.id)
    store.saveRecord('goal', null, { title: 'Get a job', targetDate: '', priority: '2', status: 'active', description: '' })
    store.saveRecord('project', null, { name: 'App', technologies: '', status: 'active', completedOn: '', repoUrl: '', description: '' })
    const role = store.saveRecord('targetRole', null, { title: 'Frontend Dev', notes: '' })!
    store.saveRecord('roleRequirement', null, { skillName: 'CSS', requiredLevel: '3', importance: '3' }, role.id)
    const context = buildCareerContext(store, today())
    expect(context).toContain('React | technical | using | claimed 4 | demonstrated 2')
    expect(context).toContain('Get a job')
    expect(context).toContain('App')
    expect(context).toContain('Frontend Dev | readiness 0% | gaps: CSS')
  })
})

describe('buildCareerContext learning', () => {
  it('includes roadmaps, tasks and pace', () => {
    const { store } = stores()
    const roadmap = store.saveRecord('roadmap', null, { title: 'Path', startDate: '' })!
    store.saveRecord('roadmapItem', null, { title: 'CSS', week: '1', effortHours: '1', status: 'open', details: '', exercise: '', resources: '' }, roadmap.id)
    store.saveRecord('task', null, { title: 'Read', kind: 'learning', dueDate: today(), minutes: '20', status: 'open' })
    const context = buildCareerContext(store, today())
    expect(context).toContain('Path | 0 of 1 done | next: CSS')
    expect(context).toContain('Read | 20 minutes')
    expect(context).toContain('Streak: 0 days')
    expect(context).toContain('This month (2026-11)')
    expect(context).toContain('Learning minutes: 0, against 0 last month')
  })
})

describe('Claude provider, over the real SDK', () => {
  it('sends a structured request with the key and returns the parsed reply', async () => {
    let seen: { headers: IncomingMessage['headers']; body: Record<string, unknown>; url?: string | undefined } | null = null
    const url = await serve((req, body, res) => {
      seen = { headers: req.headers, body: JSON.parse(body) as Record<string, unknown>, url: req.url }
      claudeStream(res, '{"a":"answer"}')
    })
    vi.stubEnv('ANTHROPIC_BASE_URL', url)

    const result = await createClaudeProvider('sk-test', 'claude-opus-5-5').complete(request)

    expect(result).toEqual({ json: { a: 'answer' }, inputTokens: 120, outputTokens: 40 })
    expect(seen!.url).toContain('/v1/messages')
    expect(seen!.headers['authorization']).toBe('Bearer sk-test')
    expect(seen!.headers['anthropic-beta']).toContain('server-side-fallback-2026-07-01')
    expect(seen!.body).toMatchObject({
      model: 'claude-opus-5-5',
      stream: true,
      system: 'sys',
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema' } }
    })
    expect(seen!.body).not.toHaveProperty('temperature')
    expect(seen!.body).not.toHaveProperty('thinking')
  })

  it('does not ask for fallbacks on Haiku, which has none', async () => {
    let body: Record<string, unknown> = {}
    const url = await serve((_req, raw, res) => {
      body = JSON.parse(raw) as Record<string, unknown>
      claudeStream(res, '{"a":"x"}')
    })
    vi.stubEnv('ANTHROPIC_BASE_URL', url)
    await createClaudeProvider('sk-test', 'claude-haiku-5-5').complete(request)
    expect(body).not.toHaveProperty('fallbacks')
  })

  it.each([
    [401, 'rejected the API key'],
    [403, 'does not have access'],
    [404, 'not available'],
    [429, 'Too many requests'],
    [400, 'could not process']
  ])('explains a %i response', async (status, message) => {
    const url = await serve((_req, _body, res) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ type: 'error', error: { type: 'x', message: 'nope' } }))
    })
    vi.stubEnv('ANTHROPIC_BASE_URL', url)
    await expect(createClaudeProvider('sk-test', 'claude-opus-5-5').complete(request)).rejects.toThrow(message)
  })

  it('explains a refusal and a cut-off reply', async () => {
    let stop = 'refusal'
    const url = await serve((_req, _body, res) => claudeStream(res, '', stop))
    vi.stubEnv('ANTHROPIC_BASE_URL', url)
    const provider = createClaudeProvider('sk-test', 'claude-opus-5-5')
    await expect(provider.complete(request)).rejects.toThrow('declined')
    stop = 'max_tokens'
    await expect(provider.complete(request)).rejects.toThrow('cut off')
  })

  it('explains an unreadable reply', async () => {
    const url = await serve((_req, _body, res) => claudeStream(res, 'not json'))
    vi.stubEnv('ANTHROPIC_BASE_URL', url)
    await expect(createClaudeProvider('sk-test', 'claude-opus-5-5').complete(request)).rejects.toThrow('could not be read')
  })
})

describe('Ollama provider', () => {
  it('sends the schema locally and reads the reply', async () => {
    let body: Record<string, unknown> = {}
    const url = await serve((_req, raw, res) => {
      body = JSON.parse(raw) as Record<string, unknown>
      res.end(JSON.stringify({ message: { content: '{"a":"local"}' }, prompt_eval_count: 7, eval_count: 3 }))
    })
    const result = await createOllamaProvider(url, 'llama3.2').complete(request)
    expect(result).toEqual({ json: { a: 'local' }, inputTokens: 7, outputTokens: 3 })
    expect(body).toMatchObject({ model: 'llama3.2', stream: false, format: { type: 'object' } })
    expect((body['messages'] as { role: string }[])[0]?.role).toBe('system')
  })

  it.each(['https://example.com', 'http://192.168.1.5:11434', 'nonsense'])('refuses the address %s', async (address) => {
    await expect(createOllamaProvider(address, 'x').complete(request)).rejects.toThrow('must be on this laptop')
  })

  it('explains when it is not running', async () => {
    await expect(createOllamaProvider('http://127.0.0.1:9', 'x').complete(request)).rejects.toThrow('Could not reach Ollama')
  })

  it('explains an error response', async () => {
    const url = await serve((_req, _body, res) => {
      res.writeHead(404)
      res.end('{}')
    })
    await expect(createOllamaProvider(url, 'x').complete(request)).rejects.toThrow('Check the model name')
  })
})

describe('KeyStore', () => {
  let folder: string
  const encryptor = {
    isAvailable: async () => true,
    encrypt: async (value: string) => Buffer.from(value.split('').reverse().join('')),
    decrypt: async (data: Buffer) => data.toString().split('').reverse().join('')
  }

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'skillpilot-key-'))
  })
  afterEach(() => rmSync(folder, { recursive: true, force: true }))

  it('saves, reads and removes a key, never in plain text', async () => {
    const path = join(folder, 'nested', 'key.enc')
    const keys = new KeyStore(path, encryptor)
    expect(keys.hasKey()).toBe(false)
    await keys.save('sk-secret')
    expect(readFileSync(path, 'utf8')).not.toContain('sk-secret')
    await expect(keys.read()).resolves.toBe('sk-secret')
    keys.remove()
    expect(existsSync(path)).toBe(false)
    await expect(keys.read()).resolves.toBeNull()
  })

  it('refuses to save if encryption is unavailable', async () => {
    const path = join(folder, 'key.enc')
    const keys = new KeyStore(path, { ...encryptor, isAvailable: async () => false })
    await expect(keys.save('sk-secret')).rejects.toThrow('not saved')
    expect(existsSync(path)).toBe(false)
  })

  it('treats a key that cannot be decrypted as no key', async () => {
    const path = join(folder, 'key.enc')
    writeFileSync(path, 'x')
    const keys = new KeyStore(path, { ...encryptor, decrypt: () => Promise.reject(new Error('no')) })
    await expect(keys.read()).resolves.toBeNull()
  })
})

describe('AiService', () => {
  it('sends career context, and logs exactly what was sent', async () => {
    const { ai, complete, store, aiStore } = service({ reply: 'Hello', proposals: [] })
    store.saveRecord('skill', null, { name: 'React', category: 'technical', claimedLevel: '2', status: 'using', notes: '' })
    await ai.chat('What next?')
    const sent = (complete.mock.calls[0] as unknown as [{ system: string }])[0]
    expect(sent.system).toContain('React')
    const [entry] = aiStore.listLog()
    expect(entry).toMatchObject({ feature: 'Assistant', provider: 'fake', model: 'fake-1', ok: true, inputTokens: 10 })
    expect(entry?.sent).toContain('React')
    expect(entry?.sent).toContain('What next?')
  })

  it('keeps the conversation and sends recent history', async () => {
    const { ai, complete, aiStore } = service({ reply: 'Answer', proposals: [] })
    await ai.chat('First')
    await ai.chat('Second')
    expect(aiStore.listChat().map((m) => m.content)).toEqual(['First', 'Answer', 'Second', 'Answer'])
    const second = (complete.mock.calls[1] as unknown as [{ messages: { content: string }[] }])[0]
    expect(second.messages.map((m) => m.content).slice(0, 2)).toEqual(['First', 'Answer'])
  })

  it('changes nothing until a proposal is accepted', async () => {
    const { ai, store, aiStore } = service({
      reply: 'Try this',
      proposals: [
        { kind: 'addSkill', title: 'Docker', note: 'Useful', minutes: 0 },
        { kind: 'addGoal', title: 'Deploy', note: 'Soon', minutes: 0 },
        { kind: 'addTask', title: 'Read docs', note: '', minutes: 20 }
      ]
    })
    await ai.chat('Help')
    expect(store.listRecords('skill')).toEqual([])
    expect(store.listRecords('goal')).toEqual([])
    expect(store.listRecords('task')).toEqual([])
    expect(aiStore.listProposals().map((p) => p.summary)).toEqual([
      'Add skill: Docker',
      'Add goal: Deploy',
      'Add task: Read docs'
    ])
    expect(aiStore.listProposals()[2]?.details).toContainEqual({ label: 'Time', value: '20 minutes' })
  })

  it('rejects a reply of the wrong shape, logs the failure, and saves no chat', async () => {
    const { ai, aiStore } = service({ reply: 42 })
    await expect(ai.chat('Hi')).rejects.toThrow(AiError)
    expect(aiStore.listChat()).toEqual([])
    expect(aiStore.listLog()[0]?.ok).toBe(false)
  })

  it('passes on why AI cannot run', async () => {
    const s = stores()
    const ai = new AiService({ ...s, today, provider: () => Promise.reject(new AiError('Add your key')) })
    await expect(ai.chat('Hi')).rejects.toThrow('Add your key')
    expect(s.aiStore.listLog()).toEqual([])
  })

  it('drafts role requirements as proposals, keeping values in range', async () => {
    const { ai, store, aiStore } = service({
      requirements: [{ skillName: 'CSS', requiredLevel: 9, importance: 0 }]
    })
    const role = store.saveRecord('targetRole', null, { title: 'Frontend Dev', notes: '' })!
    await expect(ai.draftRequirements(role.id)).resolves.toBe(1)
    expect(store.listRecords('roleRequirement', role.id)).toEqual([])
    const [proposal] = aiStore.listProposals()
    expect(aiStore.pendingProposal(proposal!.id)?.payload).toMatchObject({ requiredLevel: '5', importance: '1' })
  })

  it('refuses a role that no longer exists', async () => {
    await expect(service({}).ai.gapReport(99)).rejects.toThrow('no longer exists')
  })

  it('stores a gap report, sends the computed scores, and keeps five priorities', async () => {
    const { ai, complete, store, aiStore } = service({ summary: 'Close', priorities: ['1', '2', '3', '4', '5', '6'] })
    const role = store.saveRecord('targetRole', null, { title: 'Dev', notes: '' })!
    store.saveRecord('roleRequirement', null, { skillName: 'CSS', requiredLevel: '3', importance: '3' }, role.id)
    const report = await ai.gapReport(role.id)
    expect(report.priorities).toHaveLength(5)
    expect(aiStore.gapReport(role.id)?.summary).toBe('Close')
    expect(aiStore.latestPriority()).toBe('1')
    const sent = (complete.mock.calls[0] as unknown as [{ messages: { content: string }[] }])[0]
    expect(sent.messages[0]?.content).toContain('CSS: needs level 3, importance 3 of 3, demonstrated 0')
  })

  it('proposes a roadmap as one reviewable change', async () => {
    const { ai, store, aiStore } = service({
      title: 'Frontend path',
      items: [{ title: 'CSS', week: 1, effortHours: 6, details: 'd', exercise: 'e', resources: 'r' }]
    })
    const role = store.saveRecord('targetRole', null, { title: 'Dev', notes: '' })!
    await ai.generateRoadmap(role.id)
    expect(store.listRecords('roadmap')).toEqual([])
    expect(aiStore.listProposals()[0]?.details).toContainEqual({ label: 'Estimated effort', value: '6 hours' })
  })

  it('suggests tasks within the time available, as proposals dated today', async () => {
    const { ai, complete, aiStore } = service({ tasks: [{ title: 'Practice', kind: 'practice', minutes: 2 }] })
    await expect(ai.suggestTasks(45)).resolves.toBe(1)
    const sent = (complete.mock.calls[0] as unknown as [{ messages: { content: string }[] }])[0]
    expect(sent.messages[0]?.content).toContain('45 minutes')
    const [proposal] = aiStore.listProposals()
    expect(aiStore.pendingProposal(proposal!.id)?.payload).toMatchObject({ minutes: '5', dueDate: '2026-11-06' })
  })
})

describe('project ideas', () => {
  it('targets missing skills, proposes up to three, and notes skills not yet listed', async () => {
    const { ai, complete, store, aiStore } = service({
      projects: [
        { name: 'Shop', description: 'An online shop', technologies: 'React', skills: ['react', 'Docker'] },
        { name: 'B', description: '', technologies: '', skills: [] },
        { name: 'C', description: '', technologies: '', skills: [] },
        { name: 'D', description: '', technologies: '', skills: [] }
      ]
    })
    const skill = store.saveRecord('skill', null, { name: 'React', category: 'technical', claimedLevel: '0', status: 'learning', notes: '' })!
    const goal = store.saveRecord('goal', null, { title: 'Job', targetDate: '', priority: '2', status: 'active', description: '' })!
    store.setLink('goalSkill', goal.id, skill.id, true, 3)
    await expect(ai.suggestProjects()).resolves.toBe(3)
    const sent = (complete.mock.calls[0] as unknown as [{ messages: { content: string }[] }])[0]
    expect(sent.messages[0]?.content).toContain('missing: React')
    const [first] = aiStore.listProposals()
    expect(first?.details).toContainEqual({ label: 'Builds your skills', value: 'react' })
    expect(first?.details).toContainEqual({ label: 'Not in your skills yet', value: 'Docker' })
    expect(store.listRecords('project')).toEqual([])
  })

  it('links an accepted project to existing skills only', () => {
    const { store } = stores()
    const skill = store.saveRecord('skill', null, { name: 'React', category: 'technical', claimedLevel: '0', status: 'learning', notes: '' })!
    expect(applyProposal(store, 'addProject', { name: 'Shop', skills: ['REACT', 'Docker'], status: 'planned' }).ok).toBe(true)
    const [project] = store.listRecords('project')
    expect(project?.values).toMatchObject({ name: 'Shop', status: 'planned' })
    expect(store.listLinks('projectSkill', project!.id)).toEqual([{ id: skill.id, level: null }])
    expect(store.listRecords('skill')).toHaveLength(1)
  })

  it('refuses an invalid project', () => {
    const { store } = stores()
    expect(applyProposal(store, 'addProject', { name: '' }).ok).toBe(false)
  })
})

describe('applyProposal', () => {
  it('saves each kind', () => {
    const { store } = stores()
    const role = store.saveRecord('targetRole', null, { title: 'Dev', notes: '' })!
    expect(applyProposal(store, 'addSkill', { name: 'Go' }).ok).toBe(true)
    expect(applyProposal(store, 'addGoal', { title: 'Ship' }).ok).toBe(true)
    expect(applyProposal(store, 'addTask', { title: 'Read', minutes: '20' }).ok).toBe(true)
    expect(applyProposal(store, 'addRoleRequirement', { roleId: role.id, skillName: 'CSS' }).ok).toBe(true)
    expect(
      applyProposal(store, 'addRoadmap', {
        title: 'Path',
        items: [{ title: 'CSS', week: 2, effortHours: 4, details: '', exercise: '', resources: '' }]
      }).ok
    ).toBe(true)
    expect(store.listRecords('skill')).toHaveLength(1)
    expect(store.listRecords('goal')).toHaveLength(1)
    expect(store.listRecords('task')).toHaveLength(1)
    expect(store.listRecords('roleRequirement', role.id)).toHaveLength(1)
    const roadmap = store.listRecords('roadmap')[0]!
    expect(store.listRecords('roadmapItem', roadmap.id)[0]?.values).toMatchObject({ title: 'CSS', week: '2' })
  })

  it('validates content like user input', () => {
    const { store } = stores()
    expect(applyProposal(store, 'addSkill', { name: '' }).ok).toBe(false)
    expect(applyProposal(store, 'addTask', { title: 'x', minutes: '9999' }).ok).toBe(false)
    expect(applyProposal(store, 'addGoal', null).ok).toBe(false)
    expect(applyProposal(store, 'addRoadmap', { title: '' }).ok).toBe(false)
    expect(store.listRecords('skill')).toEqual([])
  })
})

describe('AiStore', () => {
  it('returns defaults, saves known settings, and ignores unknown ones', () => {
    const { aiStore, db } = stores()
    expect(aiStore.getSettings()['aiProvider']).toBe('off')
    aiStore.saveSettings({ aiProvider: 'claude', hacked: 'yes' })
    expect(aiStore.getSettings()['aiProvider']).toBe('claude')
    expect(db.prepare("SELECT count(*) AS n FROM setting WHERE key = 'hacked'").get()).toEqual({ n: 0 })
  })

  it('resolves a proposal only once', () => {
    const { aiStore } = stores()
    aiStore.addProposal('addSkill', 'Add', { name: 'Go' }, [])
    const [proposal] = aiStore.listProposals()
    expect(aiStore.resolveProposal(proposal!.id, 'accepted')).toBe(true)
    expect(aiStore.resolveProposal(proposal!.id, 'rejected')).toBe(false)
    expect(aiStore.pendingProposal(proposal!.id)).toBeNull()
    expect(aiStore.listProposals()).toEqual([])
  })

  it('keeps only recent log entries', () => {
    const { aiStore } = stores()
    for (let i = 0; i < 35; i++) {
      aiStore.logRequest({ feature: `f${i}`, provider: 'p', model: 'm', sent: 's', ok: true, inputTokens: 1, outputTokens: 1 })
    }
    const log = aiStore.listLog()
    expect(log).toHaveLength(30)
    expect(log[0]?.feature).toBe('f34')
  })

  it('clears the conversation', () => {
    const { aiStore } = stores()
    aiStore.addChatMessage('user', 'hi')
    aiStore.clearChat()
    expect(aiStore.listChat()).toEqual([])
  })

  it('tolerates a damaged priorities value', () => {
    const { aiStore, store, db } = stores()
    const role = store.saveRecord('targetRole', null, { title: 'Dev', notes: '' })!
    db.prepare("INSERT INTO gap_report (role_id, summary, priorities) VALUES (?, 's', 'not json')").run(role.id)
    expect(aiStore.gapReport(role.id)?.priorities).toEqual([])
    expect(aiStore.latestPriority()).toBeNull()
  })
})
