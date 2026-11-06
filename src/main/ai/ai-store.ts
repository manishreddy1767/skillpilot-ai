import type { DatabaseSync } from 'node:sqlite'
import type { AiLogEntry, ChatMessage, GapReport, Proposal, ProposalKind } from '../../shared/ai'
import { defaultSettings, settingFields, type Settings } from '../../shared/settings'

const LOG_ENTRIES_KEPT = 30
const CHAT_MESSAGES_SENT = 20

type Row = Record<string, unknown>

/** Stored payloads are only ever written by this app, but are still parsed defensively. */
function parseList(text: unknown): string[] {
  try {
    const value: unknown = JSON.parse(String(text))
    return Array.isArray(value) ? value.map(String) : []
  } catch {
    return []
  }
}

/** Settings, AI history, and pending proposals. */
export class AiStore {
  constructor(private readonly db: DatabaseSync) {}

  getSettings(): Settings {
    const rows = this.db.prepare('SELECT key, value FROM setting').all() as { key: string; value: string }[]
    const known = new Set(settingFields.map((field) => field.key))
    const saved = rows.filter((row) => known.has(row.key)).map((row) => [row.key, row.value])
    return { ...defaultSettings, ...Object.fromEntries(saved) }
  }

  saveSettings(settings: Settings): Settings {
    const save = this.db.prepare(
      'INSERT INTO setting (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value'
    )
    for (const field of settingFields) {
      const value = settings[field.key]
      if (value !== undefined) save.run(field.key, value)
    }
    return this.getSettings()
  }

  addChatMessage(role: 'user' | 'assistant', content: string): void {
    this.db.prepare('INSERT INTO chat_message (role, content) VALUES (?, ?)').run(role, content)
  }

  listChat(limit = 200): ChatMessage[] {
    const rows = this.db
      .prepare('SELECT * FROM (SELECT * FROM chat_message ORDER BY id DESC LIMIT ?) ORDER BY id')
      .all(limit) as Row[]
    return rows.map((row) => ({
      id: Number(row['id']),
      role: row['role'] as ChatMessage['role'],
      content: String(row['content']),
      createdAt: String(row['created_at'])
    }))
  }

  recentChat(): ChatMessage[] {
    return this.listChat(CHAT_MESSAGES_SENT)
  }

  clearChat(): void {
    this.db.exec('DELETE FROM chat_message')
  }

  saveGapReport(roleId: number, summary: string, priorities: string[]): GapReport {
    const result = this.db
      .prepare('INSERT INTO gap_report (role_id, summary, priorities) VALUES (?, ?, ?)')
      .run(roleId, summary, JSON.stringify(priorities))
    return this.gapReport(roleId, Number(result.lastInsertRowid))!
  }

  /** The newest report for a role, or a specific one. */
  gapReport(roleId: number, id?: number): GapReport | null {
    const row = (
      id
        ? this.db.prepare('SELECT * FROM gap_report WHERE id = ?').get(id)
        : this.db.prepare('SELECT * FROM gap_report WHERE role_id = ? ORDER BY id DESC LIMIT 1').get(roleId)
    ) as Row | undefined
    if (!row) return null
    return {
      id: Number(row['id']),
      summary: String(row['summary']),
      priorities: parseList(row['priorities']),
      createdAt: String(row['created_at'])
    }
  }

  latestPriority(): string | null {
    const row = this.db.prepare('SELECT priorities FROM gap_report ORDER BY id DESC LIMIT 1').get() as Row | undefined
    return row ? (parseList(row['priorities'])[0] ?? null) : null
  }

  addProposal(kind: ProposalKind, summary: string, payload: unknown, details: Proposal['details']): void {
    this.db
      .prepare('INSERT INTO proposed_change (kind, summary, payload, details) VALUES (?, ?, ?, ?)')
      .run(kind, summary, JSON.stringify(payload), JSON.stringify(details))
  }

  listProposals(): Proposal[] {
    const rows = this.db.prepare("SELECT * FROM proposed_change WHERE status = 'pending' ORDER BY id").all() as Row[]
    return rows.map((row) => ({
      id: Number(row['id']),
      kind: row['kind'] as ProposalKind,
      summary: String(row['summary']),
      details: JSON.parse(String(row['details'])) as Proposal['details']
    }))
  }

  pendingProposal(id: number): { kind: ProposalKind; payload: unknown } | null {
    const row = this.db
      .prepare("SELECT kind, payload FROM proposed_change WHERE id = ? AND status = 'pending'")
      .get(id) as Row | undefined
    if (!row) return null
    return { kind: row['kind'] as ProposalKind, payload: JSON.parse(String(row['payload'])) }
  }

  resolveProposal(id: number, status: 'accepted' | 'rejected'): boolean {
    const result = this.db
      .prepare("UPDATE proposed_change SET status = ? WHERE id = ? AND status = 'pending'")
      .run(status, id)
    return Number(result.changes) > 0
  }

  logRequest(entry: Omit<AiLogEntry, 'id' | 'createdAt'>): void {
    this.db
      .prepare(
        `INSERT INTO ai_request (feature, provider, model, sent, ok, input_tokens, output_tokens)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(entry.feature, entry.provider, entry.model, entry.sent, entry.ok ? 1 : 0, entry.inputTokens, entry.outputTokens)
    this.db
      .prepare('DELETE FROM ai_request WHERE id NOT IN (SELECT id FROM ai_request ORDER BY id DESC LIMIT ?)')
      .run(LOG_ENTRIES_KEPT)
  }

  listLog(): AiLogEntry[] {
    const rows = this.db.prepare('SELECT * FROM ai_request ORDER BY id DESC').all() as Row[]
    return rows.map((row) => ({
      id: Number(row['id']),
      feature: String(row['feature']),
      provider: String(row['provider']),
      model: String(row['model']),
      sent: String(row['sent']),
      ok: Boolean(row['ok']),
      inputTokens: Number(row['input_tokens']),
      outputTokens: Number(row['output_tokens']),
      createdAt: String(row['created_at'])
    }))
  }
}
