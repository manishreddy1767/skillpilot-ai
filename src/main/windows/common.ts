import { join } from 'node:path'
import type { BrowserWindow, WebPreferences } from 'electron'

export const secureWebPreferences: WebPreferences = {
  preload: join(__dirname, '../preload/index.js'),
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false
}

export function loadPage(window: BrowserWindow, page: 'widget' | 'overview' | 'app'): void {
  // The app only ever shows its own pages.
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())

  const devServer = process.env['ELECTRON_RENDERER_URL']
  if (devServer) void window.loadURL(`${devServer}/${page}/index.html`)
  else void window.loadFile(join(__dirname, `../renderer/${page}/index.html`))
}
