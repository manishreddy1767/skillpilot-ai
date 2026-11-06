import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiStore } from './ai/ai-store'
import { KeyStore } from './ai/key-store'
import type { AiProvider } from './ai/providers'
import { createAiHandlers } from './ai-handlers'
import { CareerStore } from './db/career-store'
import { migrate } from './db/migrations'

let folder: string
const open: DatabaseSync[] = []

const encryptor = {
  isAvailable: async () => true,
  encrypt: async (value: string) => Buffer.from(`enc:${value}`),
  decrypt: async (data: Buffer) => data.toString().slice(4)
}

function setup(reply: unknown = { reply: 'Hi', proposals: [] }) {
  const db = new DatabaseSync(':memory:')
  open.push(db)
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db, () => undefined)
  const store = new CareerStore(db)
  const aiStore = new AiStore(db)
  const keys = new KeyStore(join(folder, 'key.enc'), encryptor)
  const fake: AiProvider = {
    name: 'claude',
    model: 'm',
    complete: vi.fn(async () => ({ json: reply, inputTokens: 1, outputTokens: 1 }))
  }
  const makeClaude = vi.fn(() => fake)
  const notifyOverview = vi.fn()
  const logError = vi.fn()
  const applySettings = vi.fn()
  const h = createAiHandlers({
    getStores: () => ({ store, aiStore }),
    keys,
    notifyOverview,
    logError,
    applySettings,
    today: () => '2026-11-06',
    makeClaude
  })
  return { h, store, aiStore, keys, fake, makeClaude, notifyOverview, logError, applySettings }
}

const allSettings = (h: ReturnType<typeof setup>['h'], over: Record<string, string>) => {
  const current = h.getSettings()
  if (!current.ok) throw new Error('no settings')
  return { ...current.value, ...over }
}

async function ready() {
  const s = setup()
  await s.h.saveApiKey('sk-test')
  s.h.saveSettings(allSettings(s.h, { aiProvider: 'claude' }))
  return s
}

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'skillpilot-aih-'))
})

afterEach(() => {
  for (const db of open.splice(0)) if (db.isOpen) db.close()
  rmSync(folder, { recursive: true, force: true })
})

describe('settings', () => {
  it('saves valid settings and puts them into effect', () => {
    const { h, applySettings } = setup()
    expect(h.saveSettings(allSettings(h, { widgetSize: '96' }))).toMatchObject({ ok: true, value: { widgetSize: '96' } })
    expect(applySettings).toHaveBeenCalledOnce()
  })

  it('rejects a value that is not offered', () => {
    const { h, applySettings } = setup()
    expect(h.saveSettings(allSettings(h, { widgetSize: '9000' })).ok).toBe(false)
    expect(applySettings).not.toHaveBeenCalled()
  })

  it.each(['https://example.com', 'http://10.0.0.5:11434'])('refuses %s for Ollama', (ollamaUrl) => {
    const { h } = setup()
    expect(h.saveSettings(allSettings(h, { ollamaUrl }))).toMatchObject({ ok: false, errors: { ollamaUrl: expect.any(String) } })
  })
})

describe('AI status', () => {
  it('is off by default and says why', () => {
    expect(setup().h.getAiStatus()).toMatchObject({ ok: true, value: { provider: 'off', hasKey: false, blocked: expect.stringContaining('off') } })
  })

  it('asks for a key when Claude has none', () => {
    const { h } = setup()
    h.saveSettings(allSettings(h, { aiProvider: 'claude' }))
    expect(h.getAiStatus()).toMatchObject({ value: { blocked: expect.stringContaining('API key') } })
  })

  it('is ready once there is a key, and never exposes it', async () => {
    const { h } = await ready()
    const status = h.getAiStatus()
    expect(status).toMatchObject({ ok: true, value: { provider: 'claude', hasKey: true, blocked: '' } })
    expect(JSON.stringify(status)).not.toContain('sk-test')
  })

  it('does not need a key for Ollama', () => {
    const { h } = setup()
    h.saveSettings(allSettings(h, { aiProvider: 'ollama' }))
    expect(h.getAiStatus()).toMatchObject({ value: { blocked: '', model: 'llama3.2' } })
  })
})

describe('API key', () => {
  it.each(['', '   ', 'has space', null, 5, 'k'.repeat(501)])('refuses %s', async (key) => {
    const { h, keys } = setup()
    expect((await h.saveApiKey(key)).ok).toBe(false)
    expect(keys.hasKey()).toBe(false)
  })

  it('trims, saves, and removes', async () => {
    const { h, keys } = setup()
    await h.saveApiKey('  sk-test  ')
    await expect(keys.read()).resolves.toBe('sk-test')
    h.removeApiKey()
    expect(keys.hasKey()).toBe(false)
  })

  it('reports when secure storage fails', async () => {
    const s = setup()
    vi.spyOn(s.keys, 'save').mockRejectedValue(new Error('no encryption'))
    expect(await s.h.saveApiKey('sk-test')).toMatchObject({ ok: false, message: expect.stringContaining('not stored') })
    expect(s.logError).toHaveBeenCalledOnce()
  })

  it('passes the decrypted key and chosen model to the provider', async () => {
    const { h, makeClaude } = await ready()
    await h.sendChat('Hi')
    expect(makeClaude).toHaveBeenCalledWith('sk-test', 'claude-opus-5-5')
  })
})

describe('chat', () => {
  it('explains why it cannot run, and makes no request', async () => {
    const { h, fake } = setup()
    expect(await h.sendChat('Hi')).toMatchObject({ ok: false, message: expect.stringContaining('off') })
    expect(fake.complete).not.toHaveBeenCalled()
  })

  it.each(['', '   ', null, 'x'.repeat(4001)])('refuses the message %s', async (message) => {
    const { h, fake } = await ready()
    expect((await h.sendChat(message)).ok).toBe(false)
    expect(fake.complete).not.toHaveBeenCalled()
  })

  it('replies and stores the conversation', async () => {
    const { h } = await ready()
    const result = await h.sendChat('Hello')
    expect(result).toMatchObject({ ok: true, value: [{ content: 'Hello' }, { content: 'Hi' }] })
    h.clearChat()
    expect(h.getChat()).toEqual({ ok: true, value: [] })
  })

  it('reports an unexpected failure plainly, and logs it', async () => {
    const s = await ready()
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
    const { h } = await ready()
    expect(h.getGapAnalysis(role).ok).toBe(false)
    expect((await h.draftRequirements(role)).ok).toBe(false)
    expect((await h.createGapReport(role)).ok).toBe(false)
    expect((await h.generateRoadmap(role)).ok).toBe(false)
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
  const keys = new KeyStore(join(folder, 'key.enc'), encryptor)
  const h = createAiHandlers({
    getStores: () => null,
    keys,
    notifyOverview: vi.fn(),
    logError: vi.fn(),
    applySettings: vi.fn(),
    today: () => '2026-11-06'
  })
  expect(h.getSettings()).toMatchObject({ ok: false, message: expect.stringContaining('could not be opened') })
  expect(await h.sendChat('Hi')).toMatchObject({ ok: false, message: expect.stringContaining('could not be opened') })
})
