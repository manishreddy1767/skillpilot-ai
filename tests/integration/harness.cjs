// Starts the built app and keeps a reference to the tray menu it builds, so tests
// can click real menu items. The app itself has no test hooks.
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { Menu, app, dialog } = require('electron')

const root = resolve(__dirname, '../..')
app.setAppPath(root)

// Tests never share a data folder or the single-copy lock with the real app.
app.setPath('userData', join(tmpdir(), 'skillpilot-ai-test'))

// Startup error boxes would block the tests, so they are recorded instead.
if (process.env.SKILLPILOT_QUIET_ERRORS) {
  globalThis.__errorBoxes = []
  dialog.showErrorBox = (_title, message) => globalThis.__errorBoxes.push(message)
}

const buildFromTemplate = Menu.buildFromTemplate.bind(Menu)
Menu.buildFromTemplate = (template) => {
  globalThis.__trayMenu = buildFromTemplate(template)
  return globalThis.__trayMenu
}

require(resolve(root, 'out-test/main/index.js'))
