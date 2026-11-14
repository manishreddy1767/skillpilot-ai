import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { browserPaths, createDesktopActions, type DesktopDeps } from './desktop-actions'

const env = {
  SystemRoot: 'C:\\Windows',
  ProgramFiles: 'C:\\Program Files',
  'ProgramFiles(x86)': 'C:\\Program Files (x86)',
  LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local'
}
const chrome = join('C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe')

function setup(installed: string[] = [chrome]) {
  const deps: DesktopDeps = {
    launch: vi.fn(),
    openExternal: vi.fn(() => Promise.resolve()),
    openPath: vi.fn(() => Promise.resolve('')),
    folderPath: vi.fn((folder) => `C:\\Users\\me\\${folder}`),
    exists: (path) => installed.includes(path),
    env
  }
  return { deps, desktop: createDesktopActions(deps) }
}

describe('browserPaths', () => {
  it('looks where each browser installs', () => {
    expect(browserPaths('chrome', env)[0]).toBe(chrome)
    expect(browserPaths('chrome', env)).toContain(join(env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'))
    expect(browserPaths('edge', env)[0]).toContain('msedge.exe')
    expect(browserPaths('firefox', env)[0]).toContain('firefox.exe')
  })
})

describe('desktop actions', () => {
  it('launches a Start menu app by its ID through Explorer, never a shell', () => {
    const { deps, desktop } = setup()
    desktop.launchApp({ name: 'Google Chrome', id: 'Chrome' })
    expect(deps.launch).toHaveBeenCalledWith(join('C:\\Windows', 'explorer.exe'), ['shell:AppsFolder\\Chrome'])
  })

  it('opens a site in Chrome when asked and Chrome is installed', async () => {
    const { deps, desktop } = setup()
    await expect(desktop.openUrl('https://www.youtube.com', 'chrome')).resolves.toBe('')
    expect(deps.launch).toHaveBeenCalledWith(chrome, ['https://www.youtube.com'])
    expect(deps.openExternal).not.toHaveBeenCalled()
  })

  it('falls back to the default browser, and says so, when the named one is missing', async () => {
    const { deps, desktop } = setup([])
    await expect(desktop.openUrl('https://github.com', 'firefox')).resolves.toContain('Firefox is not installed')
    expect(deps.openExternal).toHaveBeenCalledWith('https://github.com')
  })

  it('uses the default browser when none is named', async () => {
    const { deps, desktop } = setup()
    await desktop.openUrl('https://github.com')
    expect(deps.openExternal).toHaveBeenCalledWith('https://github.com')
    expect(deps.launch).not.toHaveBeenCalled()
  })

  it.each(['file:///C:/Windows/System32/cmd.exe', 'javascript:alert(1)', 'ms-settings:', 'not a url'])(
    'refuses to open "%s" as a web address',
    async (url) => {
      const { deps, desktop } = setup()
      await expect(desktop.openUrl(url, 'chrome')).rejects.toThrow('Only web addresses')
      expect(deps.launch).not.toHaveBeenCalled()
      expect(deps.openExternal).not.toHaveBeenCalled()
    }
  )

  it('opens folders, and reports a folder that would not open', async () => {
    const { deps, desktop } = setup()
    await desktop.openFolder('downloads')
    expect(deps.openPath).toHaveBeenCalledWith('C:\\Users\\me\\downloads')
    vi.mocked(deps.openPath).mockResolvedValueOnce('Not found')
    await expect(desktop.openFolder('music')).rejects.toThrow('Not found')
  })

  it('opens Windows settings', async () => {
    const { deps, desktop } = setup()
    await desktop.openWindowsSettings()
    expect(deps.openExternal).toHaveBeenCalledWith('ms-settings:')
  })

  it.each([
    ['up', '[char]175', '1..5'],
    ['down', '[char]174', '1..5'],
    ['mute', '[char]173', '1..1']
  ] as const)('presses the volume %s key', (change, key, presses) => {
    const { deps, desktop } = setup()
    desktop.volume(change)
    const [file, args] = vi.mocked(deps.launch).mock.calls[0]!
    expect(file).toContain('powershell.exe')
    expect(args.at(-1)).toContain(key)
    expect(args.at(-1)).toContain(presses)
  })

  it('locks the computer', () => {
    const { deps, desktop } = setup()
    desktop.lock()
    expect(deps.launch).toHaveBeenCalledWith(join('C:\\Windows', 'System32', 'rundll32.exe'), ['user32.dll,LockWorkStation'])
  })
})
