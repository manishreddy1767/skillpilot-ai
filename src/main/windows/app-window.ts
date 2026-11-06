import { BrowserWindow } from 'electron'
import { loadPage, secureWebPreferences } from './common'

/** The full interface: a normal resizable window, created the first time it is opened. */
export function createAppWindow(): BrowserWindow {
  const appWindow = new BrowserWindow({
    title: 'SkillPilot AI',
    width: 1100,
    height: 720,
    minWidth: 760,
    minHeight: 520,
    show: false,
    backgroundColor: '#0f172a',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0f172a', symbolColor: '#e2e8f0', height: 40 },
    webPreferences: secureWebPreferences
  })

  loadPage(appWindow, 'app')
  appWindow.once('ready-to-show', () => appWindow.show())
  return appWindow
}
