import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CareerStore } from '../db/career-store'
import { migrate } from '../db/migrations'
import { AiService, applyProposal } from './ai-service'
import { AiStore } from './ai-store'
import { buildCareerContext } from './context'
import { integer, list, matchesSchema, object, oneOf, text } from './json-schema'
import { AiError, createOllamaProvider, listLocalModels, type AiProvider } from './providers'

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

const request = { system: 'sys', messages: [{ role: 'user' as const, content: 'hi' }], schema: object({ a: text }), effort: 'low' as const }

afterEach(async () => {
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

describe('Ollama provider', () => {
  it('sends the schema locally and reads the reply', async () => {
    let body: Record<string, unknown> = {}
    const url = await serve((_req, raw, res) => {
      body = JSON.parse(raw) as Record<string, unknown>
      res.end(JSON.stringify({ message: { content: '{"a":"local"}' }, prompt_eval_count: 7, eval_count: 3 }))
    })
    const result = await createOllamaProvider(url, 'llama3.2').complete(request)
    expect(result).toEqual({ json: { a: 'local' }, inputTokens: 7, outputTokens: 3 })
    expect(body).toMatchObject({ model: 'llama3.2', stream: false, think: false, format: { type: 'object' } })
    expect((body['messages'] as { role: string }[])[0]?.role).toBe('system')
  })

  it.each(['https://example.com', 'http://192.168.1.5:11434', 'nonsense'])('refuses the address %s', async (address) => {
    await expect(createOllamaProvider(address, 'x').complete(request)).rejects.toThrow('must be on this laptop')
  })

  it('explains when it is not running', async () => {
    await expect(createOllamaProvider('http://127.0.0.1:9', 'x').complete(request)).rejects.toThrow('Could not reach Ollama')
  })

  it('explains a model that is not installed, and other errors', async () => {
    let status = 404
    const url = await serve((_req, _body, res) => {
      res.writeHead(status)
      res.end('{}')
    })
    await expect(createOllamaProvider(url, 'mistral').complete(request)).rejects.toThrow('"mistral" is not installed')
    status = 500
    await expect(createOllamaProvider(url, 'x').complete(request)).rejects.toThrow('Check the model name')
  })

  it('explains a reply that is too slow', async () => {
    const url = await serve(() => undefined)
    await expect(createOllamaProvider(url, 'x', 50).complete(request)).rejects.toThrow('took too long')
  })

  it('explains an unreadable reply', async () => {
    const url = await serve((_req, _body, res) => res.end(JSON.stringify({ message: { content: 'not json' } })))
    await expect(createOllamaProvider(url, 'x').complete(request)).rejects.toThrow('could not be read')
  })
})

describe('listLocalModels', () => {
  it('lists the installed models, sorted', async () => {
    const url = await serve((_req, _body, res) =>
      res.end(JSON.stringify({ models: [{ name: 'qwen3:4b' }, { name: 'gemma3:4b' }, { other: 1 }] }))
    )
    await expect(listLocalModels(url)).resolves.toEqual(['gemma3:4b', 'qwen3:4b'])
  })

  it('is null when Ollama is not running, or the address is not local', async () => {
    await expect(listLocalModels('http://127.0.0.1:9')).resolves.toBeNull()
    await expect(listLocalModels('https://example.com')).resolves.toBeNull()
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
        { kind: 'addSkill', title: 'Docker', note: 'Useful', minutes: 0, level: 0 },
        { kind: 'addGoal', title: 'Deploy', note: 'Soon', minutes: 0, level: 0 },
        { kind: 'addTask', title: 'Read docs', note: '', minutes: 20, level: 0 }
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

describe('resume wording', () => {
  const resume = {
    name: 'Asha',
    headline: 'Developer',
    contact: [],
    summary: 'Developer who builds web apps.',
    skills: [],
    experience: [{ heading: 'Intern', subheading: 'Initech', dates: '', bullets: ['Made a dashboard', 'Fixed bugs'] }],
    projects: [{ heading: 'Site', subheading: 'React', dates: '', bullets: ['Personal site'] }],
    education: [],
    certifications: [],
    keywords: null
  }

  it('numbers every line, so even a small model rewrites each one, and maps answers back', async () => {
    const { ai, complete } = service({
      rewrites: [
        { line: 1, better: 'Frontend developer who builds fast web apps.' },
        { line: 2, better: 'Built an analytics dashboard in React' },
        { line: 3, better: 'Fixed bugs' },
        { line: 4, better: 'Designed and shipped a personal React site' }
      ]
    })
    const suggestions = await ai.polishResume(resume, { title: 'React Developer', description: 'React, CSS' }, ['React'])
    expect(suggestions).toEqual([
      { id: 'summary-0-0', section: 'summary', entry: 0, bullet: 0, original: 'Developer who builds web apps.', reworded: 'Frontend developer who builds fast web apps.' },
      { id: 'experience-0-0', section: 'experience', entry: 0, bullet: 0, original: 'Made a dashboard', reworded: 'Built an analytics dashboard in React' },
      { id: 'projects-0-0', section: 'projects', entry: 0, bullet: 0, original: 'Personal site', reworded: 'Designed and shipped a personal React site' }
    ])
    const sent = (complete.mock.calls[0] as unknown as [{ messages: { content: string }[] }])[0].messages.at(-1)!.content
    expect(sent).toContain('1. (summary) Developer who builds web apps.')
    expect(sent).toContain('2. Made a dashboard')
    expect(sent).toContain('4. Personal site')
    expect(sent).toContain('adds no new skills')
    expect(sent).toContain('React Developer')
  })

  it('drops wording that claims a skill you do not have, or runs too long', async () => {
    const { ai } = service({
      rewrites: [
        { line: 1, better: 'Developer skilled in Kubernetes and Docker.' },
        { line: 2, better: 'Made a dashboard using Kubernetes' },
        { line: 3, better: 'x'.repeat(400) }
      ]
    })
    expect(await ai.polishResume(resume, null, ['React'])).toEqual([])
  })

  it('ignores lines that do not exist, and a second answer for the same line', async () => {
    const { ai } = service({
      rewrites: [
        { line: 0, better: 'Ghost' },
        { line: 9, better: 'Ghost' },
        { line: 3, better: 'Resolved bugs' },
        { line: 3, better: 'Squashed bugs' }
      ]
    })
    expect(await ai.polishResume(resume, null, [])).toEqual([
      { id: 'experience-0-1', section: 'experience', entry: 0, bullet: 1, original: 'Fixed bugs', reworded: 'Resolved bugs' }
    ])
  })

  it('asks nothing when there is nothing to reword', async () => {
    const { ai, complete } = service({ rewrites: [] })
    expect(await ai.polishResume({ ...resume, summary: '', experience: [], projects: [] }, null, [])).toEqual([])
    expect(complete).not.toHaveBeenCalled()
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

describe('changes to existing items', () => {
  function withData(reply: unknown) {
    const s = service(reply)
    const skill = s.store.saveRecord('skill', null, { name: 'React', category: 'technical', claimedLevel: '2', status: 'using', notes: '' })!
    const roadmap = s.store.saveRecord('roadmap', null, { title: 'Path', startDate: '' })!
    const item = s.store.saveRecord('roadmapItem', null, { title: 'CSS', week: '1', effortHours: '2', status: 'open', details: '', exercise: '', resources: '' }, roadmap.id)!
    return { ...s, skill, roadmap, item }
  }
  const reply = (proposals: unknown[]) => ({ reply: 'Ok', proposals })
  const change = (kind: string, title: string, level = 0) => ({ kind, title, note: 'Because', minutes: 0, level })

  it('proposes a level change with before and after, and saves nothing yet', async () => {
    const { ai, aiStore, store } = withData(reply([change('setSkillLevel', 'react', 4)]))
    await ai.chat('I got better')
    const [proposal] = aiStore.listProposals()
    expect(proposal?.summary).toBe('Change level: React')
    expect(proposal?.details).toContainEqual({ label: 'Level', value: '2 → 4' })
    expect(store.listRecords('skill')[0]?.values['claimedLevel']).toBe('2')
  })

  it.each([
    ['an unknown skill', change('setSkillLevel', 'Rust', 3)],
    ['a level out of range', change('setSkillLevel', 'React', 9)],
    ['no change', change('setSkillLevel', 'React', 2)],
    ['an unknown topic', change('markTopicDone', 'Nope')]
  ])('proposes nothing for %s', async (_name, item) => {
    const { ai, aiStore } = withData(reply([item]))
    await ai.chat('Hi')
    expect(aiStore.listProposals()).toEqual([])
  })

  it('applies a level change, refusing one made stale by an edit', () => {
    const { store, skill } = withData({})
    expect(applyProposal(store, 'updateSkillLevel', { skillId: skill.id, from: '2', to: '4' }).ok).toBe(true)
    expect(store.listRecords('skill')[0]?.values).toMatchObject({ name: 'React', claimedLevel: '4', status: 'using' })
    expect(applyProposal(store, 'updateSkillLevel', { skillId: skill.id, from: '2', to: '5' })).toMatchObject({
      ok: false,
      message: expect.stringContaining('changed since')
    })
    expect(applyProposal(store, 'updateSkillLevel', { skillId: 999, from: '0', to: '1' }).ok).toBe(false)
  })

  it('proposes and applies marking a topic done, once', async () => {
    const { ai, aiStore, store, roadmap, item } = withData(reply([change('markTopicDone', 'css')]))
    await ai.chat('I finished CSS')
    expect(aiStore.listProposals()[0]?.details).toContainEqual({ label: 'Status', value: 'Not done → Done' })
    const payload = { roadmapId: roadmap.id, itemId: item.id }
    expect(applyProposal(store, 'completeTopic', payload).ok).toBe(true)
    expect(store.listRecords('roadmapItem', roadmap.id)[0]?.values['status']).toBe('done')
    expect(applyProposal(store, 'completeTopic', payload)).toMatchObject({ ok: false, message: expect.stringContaining('already done') })
    expect(applyProposal(store, 'completeTopic', { roadmapId: roadmap.id, itemId: 999 }).ok).toBe(false)
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
    expect(aiStore.getSettings()['aiProvider']).toBe('ollama')
    aiStore.saveSettings({ aiProvider: 'off', hacked: 'yes' })
    expect(aiStore.getSettings()['aiProvider']).toBe('off')
    expect(db.prepare("SELECT count(*) AS n FROM setting WHERE key = 'hacked'").get()).toEqual({ n: 0 })
  })

  it('falls back to the default for a value no longer offered, such as the removed cloud AI', () => {
    const { aiStore, db } = stores()
    db.prepare("INSERT INTO setting (key, value) VALUES ('aiProvider', 'claude'), ('claudeModel', 'x')").run()
    expect(aiStore.getSettings()['aiProvider']).toBe('ollama')
    expect(aiStore.getSettings()['claudeModel']).toBeUndefined()
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
