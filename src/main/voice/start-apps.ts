import type { StartApp } from '../../shared/desktop-commands'

const NOISE = /uninstall|readme|read me|help|documentation|license|release notes|website|manual|support|feedback/i

/** Reads `Get-StartApps | ConvertTo-Json`, keeping real apps people would ask to open. */
export function parseStartApps(json: string): StartApp[] {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    return []
  }
  const rows = Array.isArray(value) ? value : [value]
  const apps: StartApp[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const { Name: name, AppID: id } = row as { Name?: unknown; AppID?: unknown }
    if (typeof name !== 'string' || typeof id !== 'string' || !name.trim() || !id.trim()) continue
    if (NOISE.test(name) || name.length > 60 || /^https?:/i.test(id)) continue
    apps.push({ name: name.trim(), id: id.trim() })
  }
  return apps
}

export const START_APPS_SCRIPT = 'Get-StartApps | Select-Object Name, AppID | ConvertTo-Json -Compress'

/** The Start menu apps, read once and refreshed now and then, so newly installed apps appear. */
export class StartApps {
  private apps: StartApp[] = []
  private readAt: number | null = null
  private reading: Promise<StartApp[]> | null = null

  constructor(
    private readonly read: () => Promise<string>,
    private readonly now: () => number = Date.now,
    private readonly maxAge = 10 * 60_000
  ) {}

  async get(): Promise<StartApp[]> {
    if (this.readAt !== null && this.now() - this.readAt < this.maxAge) return this.apps
    this.reading ??= this.read()
      .then((json) => {
        this.apps = parseStartApps(json)
        this.readAt = this.now()
        return this.apps
      })
      .catch(() => this.apps)
      .finally(() => {
        this.reading = null
      })
    return this.reading
  }
}
