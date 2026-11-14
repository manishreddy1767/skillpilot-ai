import { join } from 'node:path'
import type { Browser, Folder, StartApp } from '../../shared/desktop-commands'

export interface DesktopDeps {
  /** Starts a program and lets it run on its own. Arguments are passed as they are, never through a shell. */
  launch(file: string, args: string[]): void
  openExternal(url: string): Promise<void>
  openPath(path: string): Promise<string>
  folderPath(folder: Folder): string
  exists(path: string): boolean
  env: Record<string, string | undefined>
}

const BROWSER_NAMES: Record<Browser, string> = { chrome: 'Chrome', edge: 'Edge', firefox: 'Firefox' }

/** Where each browser installs itself. */
export function browserPaths(browser: Browser, env: Record<string, string | undefined>): string[] {
  const roots = {
    programs: env['ProgramFiles'] ?? 'C:\\Program Files',
    programs86: env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
    local: env['LOCALAPPDATA'] ?? ''
  }
  switch (browser) {
    case 'chrome':
      return [roots.programs, roots.programs86, roots.local].filter(Boolean).map((root) => join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'))
    case 'edge':
      return [roots.programs86, roots.programs].map((root) => join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'))
    case 'firefox':
      return [roots.programs, roots.programs86].map((root) => join(root, 'Mozilla Firefox', 'firefox.exe'))
  }
}

const isWebAddress = (url: string): boolean => {
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol)
  } catch {
    return false
  }
}

/** The only things voice may do outside SkillPilot. Each one is fixed; spoken text is never run as a command. */
export function createDesktopActions({ launch, openExternal, openPath, folderPath, exists, env }: DesktopDeps) {
  const system = env['SystemRoot'] ?? 'C:\\Windows'

  return {
    launchApp(app: StartApp): void {
      launch(join(system, 'explorer.exe'), [`shell:AppsFolder\\${app.id}`])
    },

    /** Opens a web address, in the named browser when asked. Returns a note if that browser is missing. */
    async openUrl(url: string, browser?: Browser): Promise<string> {
      if (!isWebAddress(url)) throw new Error('Only web addresses can be opened.')
      if (browser) {
        const installed = browserPaths(browser, env).find(exists)
        if (installed) {
          launch(installed, [url])
          return ''
        }
        await openExternal(url)
        return ` ${BROWSER_NAMES[browser]} is not installed, so it opened in your default browser.`
      }
      await openExternal(url)
      return ''
    },

    async openFolder(folder: Folder): Promise<void> {
      const problem = await openPath(folderPath(folder))
      if (problem) throw new Error(problem)
    },

    openWindowsSettings: (): Promise<void> => openExternal('ms-settings:'),

    /** Presses the keyboard's volume keys, five steps at a time. */
    volume(change: 'up' | 'down' | 'mute'): void {
      const key = { up: 175, down: 174, mute: 173 }[change]
      const presses = change === 'mute' ? 1 : 5
      launch(join(system, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), [
        '-NoProfile',
        '-NonInteractive',
        '-WindowStyle',
        'Hidden',
        '-Command',
        `$shell = New-Object -ComObject WScript.Shell; 1..${presses} | ForEach-Object { $shell.SendKeys([char]${key}) }`
      ])
    },

    lock(): void {
      launch(join(system, 'System32', 'rundll32.exe'), ['user32.dll,LockWorkStation'])
    }
  }
}

export type DesktopActions = ReturnType<typeof createDesktopActions>
