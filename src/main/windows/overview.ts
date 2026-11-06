import { BrowserWindow } from 'electron'
import { loadPage, secureWebPreferences } from './common'

export const OVERVIEW_SIZE = { width: 340, height: 600 }

/** Created at startup and kept hidden, so hovering opens it instantly. */
export function createOverviewWindow(): BrowserWindow {
  const overview = new BrowserWindow({
    title: 'SkillPilot Overview',
    ...OVERVIEW_SIZE,
    show: false,
    frame: false,
    thickFrame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    webPreferences: { ...secureWebPreferences, backgroundThrottling: false }
  })

  loadPage(overview, 'overview')
  return overview
}
