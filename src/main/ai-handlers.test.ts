import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiStore } from './ai/ai-store'
import type { AiProvider } from './ai/providers'
import { createAiHandlers } from './ai-handlers'
import { CareerStore } from './db/career-store'
import { migrate } from './db/migrations'

const open: DatabaseSync[] = []
const servers: Server[] = []

function setup(reply: unknown = { reply: 'Hi', proposals: [] }) {
  const db = new DatabaseSync(':memory:')
  open.push(db)
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db, () => undefined)
  const store = new CareerStore(db)
  const aiStore = new AiStore(db)
  const fake: AiProvider = {
    name: 'ollama',
    model: 'm',
    complete: vi.fn(async () => ({ json: reply, inputTokens: 1, outputTokens: 1 }))
  }
  const makeProvider = vi.fn(() => fake)
  const notifyOverview = vi.fn()
  const logError = vi.fn()
  const applySettings = vi.fn()
  const h = createAiHandlers({
    getStores: () => ({ store, aiStore }),
    notifyOverview,
    logError,
    applySettings,
    today: () => '2026-11-06',
    makeProvider
  })
  return { h, store, aiStore, fake, makeProvider, notifyOverview, logError, applySettings }
}

const allSettings = (h: ReturnType<typeof setup>['h'], over: Record<string, string>) => {
  const current = h.getSettings()
  if (!current.ok) throw new Error('no settings')
  return { ...current.value, ...over }
}

/** A stand-in for Ollama's model list, on this computer. */
async function fakeOllama(models: string[]): Promise<string> {
  const server = createServer((_req, res) => res.end(JSON.stringify({ models: models.map((name) => ({ name })) })))
  servers.push(server)
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

afterEach(async () => {
  for (const db of open.splice(0)) if (db.isOpen) db.close()
  await Promise.all(servers.splice(0).map((s) => new Promise((done) => s.close(done))))
})

describe('settings', () => {
  it('saves valid settings and puts them into effect', () => {
    const { h, applySettings } = setup()
    expect(h.saveSettings(allSettings(h, { widgetSize: '96' }))).toMatchObject({ ok: true, value: { widgetSize: '96' } })
    expect(applySettings).toHaveBeenCalledOnce()
  })

  it('rejects a value that is not offered, including the removed cloud AI', () => {
    const { h, applySettings } = setup()
    expect(h.saveSettings(allSettings(h, { widgetSize: '9000' })).ok).toBe(false)
    expect(h.saveSettings(allSettings(h, { aiProvider: 'claude' })).ok).toBe(false)
    expect(applySettings).not.toHaveBeenCalled()
  })

  it.each(['https://example.com', 'http://10.0.0.5:11434', 'http://ollama.example.com'])('refuses %s for Ollama', (ollamaUrl) => {
    const { h } = setup()
    expect(h.saveSettings(allSettings(h, { ollamaUrl }))).toMatchObject({ ok: false, errors: { ollamaUrl: expect.any(String) } })
  })
})

describe('AI status', () => {
  it('is on by default, using the local model', async () => {
    const { h } = setup()
    const url = await fakeOllama(['qwen3:4b', 'gemma3:4b'])
    h.saveSettings(allSettings(h, { ollamaUrl: url }))
    await expect(h.getAiStatus()).resolves.toEqual({
      ok: true,
      value: { provider: 'ollama', model: 'qwen3:4b', blocked: '', localModels: ['gemma3:4b', 'qwen3:4b'] }
    })
  })

  it('says when it is turned off', async () => {
    const { h } = setup()
    h.saveSettings(allSettings(h, { aiProvider: 'off' }))
    await expect(h.getAiStatus()).resolves.toMatchObject({ value: { blocked: expect.stringContaining('off') } })
  })

  it('says when Ollama is not running', async () => {
    const { h } = setup()
    h.saveSettings(allSettings(h, { ollamaUrl: 'http://127.0.0.1:9' }))
    await expect(h.getAiStatus()).resolves.toMatchObject({
      value: { localModels: null, blocked: expect.stringContaining('Ollama is not running') }
    })
  })

  it('says when the chosen model is not installed, and lists the ones that are', async () => {
    const { h } = setup()
    const url = await fakeOllama(['gemma3:4b'])
    h.saveSettings(allSettings(h, { ollamaUrl: url, ollamaModel: 'mistral' }))
    await expect(h.getAiStatus()).resolves.toMatchObject({
      value: { blocked: 'The model "mistral" is not installed in Ollama. Choose one of: gemma3:4b.' }
    })
  })

  it('accepts a model named without its tag', async () => {
    const { h } = setup()
    const url = await fakeOllama(['llama3.2:latest'])
    h.saveSettings(allSettings(h, { ollamaUrl: url, ollamaModel: 'llama3.2' }))
    await expect(h.getAiStatus()).resolves.toMatchObject({ value: { blocked: '' } })
  })
})

describe('the local model', () => {
  it('is given the saved local address and model', async () => {
    const { h, makeProvider } = setup()
    await h.sendChat('Hi')
    expect(makeProvider).toHaveBeenCalledWith('http://localhost:11434', 'qwen3:4b')
  })
})

describe('chat', () => {
  it('explains why it cannot run, and makes no request', async () => {
    const { h, fake } = setup()
    h.saveSettings(allSettings(h, { aiProvider: 'off' }))
    expect(await h.sendChat('Hi')).toMatchObject({ ok: false, message: expect.stringContaining('off') })
    expect(fake.complete).not.toHaveBeenCalled()
  })

  it.each(['', '   ', null, 'x'.repeat(4001)])('refuses the message %s', async (message) => {
    const { h, fake } = setup()
    expect((await h.sendChat(message)).ok).toBe(false)
    expect(fake.complete).not.toHaveBeenCalled()
  })

  it('replies and stores the conversation', async () => {
    const { h } = setup()
    const result = await h.sendChat('Hello')
    expect(result).toMatchObject({ ok: true, value: [{ content: 'Hello' }, { content: 'Hi' }] })
    h.clearChat()
    expect(h.getChat()).toEqual({ ok: true, value: [] })
  })

  it('reports an unexpected failure plainly, and logs it', async () => {
    const s = setup()
    vi.mocked(s.fake.complete).mockRejectedValue(new Error('private detail'))
    const result = await s.h.sendChat('Hi')
    expect(result).toEqual({ ok: false, message: 'The AI request failed. Please try again.' })
    expect(s.logError).toHaveBeenCalledOnce()
  })
})

describe('gap analysis', () => {
  it('works with no AI at all', () => {
    const { h, store } = setup()
    const role = store.saveRecord('targetRole', null, { title: 'Dev', notes: '' })!
    store.saveRecord('roleRequirement', null, { skillName: 'CSS', requiredLevel: '3', importance: '3' }, role.id)
    expect(h.getGapAnalysis(role.id)).toMatchObject({
      ok: true,
      value: { analysis: { readiness: 0, items: [{ skillName: 'CSS', status: 'missing' }] }, report: null }
    })
  })

  it.each(['x', 0, null])('refuses the role %s', async (role) => {
    const { h } = setup()
    expect(h.getGapAnalysis(role).ok).toBe(false)
    expect((await h.draftRequirements(role)).ok).toBe(false)
    expect((await h.createGapReport(role)).ok).toBe(false)
    expect((await h.generateRoadmap(role)).ok).toBe(false)
  })
})

describe('project ideas', () => {
  it('needs the local AI to be on', async () => {
    const { h } = setup()
    h.saveSettings(allSettings(h, { aiProvider: 'off' }))
    expect((await h.suggestProjects()).ok).toBe(false)
  })

  it('proposes projects when ready', async () => {
    const s = setup({ projects: [{ name: 'Shop', description: '', technologies: '', skills: [] }] })
    expect(await s.h.suggestProjects()).toEqual({ ok: true, value: 1 })
  })
})

describe('proposals', () => {
  async function withProposal(payload: unknown = { name: 'Go' }) {
    const s = setup()
    s.aiStore.addProposal('addSkill', 'Add skill: Go', payload, [{ label: 'Skill', value: 'Go' }])
    const list = s.h.listProposals()
    if (!list.ok) throw new Error('no list')
    return { ...s, id: list.value[0]!.id }
  }

  it('accepting saves it once and updates the overview', async () => {
    const { h, id, store, notifyOverview } = await withProposal()
    expect(h.acceptProposal(id)).toEqual({ ok: true, value: true })
    expect(store.listRecords('skill')).toHaveLength(1)
    expect(notifyOverview).toHaveBeenCalledOnce()
    expect(h.acceptProposal(id)).toMatchObject({ ok: false, message: expect.stringContaining('already been handled') })
    expect(store.listRecords('skill')).toHaveLength(1)
  })

  it('rejecting saves nothing', async () => {
    const { h, id, store } = await withProposal()
    h.rejectProposal(id)
    expect(store.listRecords('skill')).toEqual([])
    expect(h.listProposals()).toEqual({ ok: true, value: [] })
  })

  it('an invalid suggestion stays pending and saves nothing', async () => {
    const { h, id, store } = await withProposal({ name: '' })
    expect(h.acceptProposal(id).ok).toBe(false)
    expect(store.listRecords('skill')).toEqual([])
    expect(h.listProposals()).toMatchObject({ value: [{ id }] })
  })

  it('explains a duplicate rather than failing silently', async () => {
    const { h, id, store } = await withProposal()
    store.saveRecord('skill', null, { name: 'Go', category: 'technical', claimedLevel: '0', status: 'using', notes: '' })
    expect(h.acceptProposal(id)).toMatchObject({ ok: false, message: expect.stringContaining('already exist') })
  })

  it.each(['1', 0, null])('refuses the id %s', (id) => {
    const { h } = setup()
    expect(h.acceptProposal(id).ok).toBe(false)
    expect(h.rejectProposal(id).ok).toBe(false)
  })
})

it('reports when data is unavailable', async () => {
  const h = createAiHandlers({
    getStores: () => null,
    notifyOverview: vi.fn(),
    logError: vi.fn(),
    applySettings: vi.fn(),
    today: () => '2026-11-06'
  })
  expect(h.getSettings()).toMatchObject({ ok: false, message: expect.stringContaining('could not be opened') })
  expect(await h.sendChat('Hi')).toMatchObject({ ok: false, message: expect.stringContaining('could not be opened') })
  expect(await h.getAiStatus()).toMatchObject({ ok: false })
})
