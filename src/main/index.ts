import { join } from 'node:path'
import { BrowserWindow, app, dialog, ipcMain, screen, type IpcMainEvent } from 'electron'
import { Channel } from '../shared/ipc'
import { installErrorLog } from './error-log'
import { DragTracker } from './logic/drag-tracker'
import { placePanel } from './logic/geometry'
import { HoverController } from './logic/hover-controller'
import { isPoint } from './logic/validation'
import { createTray } from './tray'
import { createAppWindow } from './windows/app-window'
import { OVERVIEW_SIZE, createOverviewWindow } from './windows/overview'
import { WIDGET_SIZE, createWidgetWindow } from './windows/widget'

const PANEL_GAP = 8

function start(): void {
  const widget = createWidgetWindow()
  const overview = createOverviewWindow()
  let appWindow: BrowserWindow | null = null
  let quitting = false
  let clickThrough = process.argv.includes('--click-through')

  const hover = new HoverController({
    getCursor: () => screen.getCursorScreenPoint(),
    getWidgetBounds: () => widget.getBounds(),
    getPanelBounds: () => overview.getBounds(),
    showPanel: () => {
      const bounds = widget.getBounds()
      const { workArea } = screen.getDisplayMatching(bounds)
      overview.setBounds(placePanel(bounds, OVERVIEW_SIZE, workArea, PANEL_GAP))
      overview.showInactive()
    },
    hidePanel: () => overview.hide()
  })

  const drag = new DragTracker()

  const openApp = (): void => {
    hover.close()
    if (!appWindow) {
      appWindow = createAppWindow()
      appWindow.on('close', (event) => {
        if (quitting) return
        event.preventDefault()
        appWindow?.hide()
      })
      return
    }
    appWindow.show()
    appWindow.focus()
  }

  const setClickThrough = (enabled: boolean): void => {
    clickThrough = enabled
    widget.setIgnoreMouseEvents(enabled)
    if (enabled) hover.close()
  }
  setClickThrough(clickThrough)

  /** Handles a message only if it came from the window allowed to send it. */
  const from = (window: BrowserWindow, handler: (event: IpcMainEvent, ...args: unknown[]) => void) => {
    return (event: IpcMainEvent, ...args: unknown[]) => {
      if (!window.isDestroyed() && event.sender === window.webContents) handler(event, ...args)
    }
  }

  ipcMain.on(
    Channel.DragPress,
    from(widget, (_event, offset) => {
      if (isPoint(offset)) drag.press(screen.getCursorScreenPoint(), offset)
    })
  )

  ipcMain.on(
    Channel.DragMove,
    from(widget, () => {
      const position = drag.move(screen.getCursorScreenPoint())
      if (!position) return
      hover.suspend()
      // Fixed width and height: crossing monitors with different scaling can resize a window.
      widget.setBounds({ ...position, width: WIDGET_SIZE, height: WIDGET_SIZE })
    })
  )

  ipcMain.on(
    Channel.DragRelease,
    from(widget, () => {
      const result = drag.release()
      hover.resume()
      if (result === 'click') openApp()
    })
  )

  ipcMain.on(Channel.HoverEnter, from(widget, () => hover.pointerEntered()))
  ipcMain.on(Channel.HoverLeave, from(widget, () => hover.pointerLeft()))
  ipcMain.on(Channel.OpenApp, from(overview, openApp))
  ipcMain.on(Channel.MinimizeToWidget, (event) => {
    if (appWindow && event.sender === appWindow.webContents) appWindow.hide()
  })

  const tray = createTray({
    openApp,
    isAlwaysOnTop: () => widget.isAlwaysOnTop(),
    setAlwaysOnTop: (enabled) => {
      widget.setAlwaysOnTop(enabled)
      overview.setAlwaysOnTop(enabled)
    },
    isClickThrough: () => clickThrough,
    setClickThrough,
    quit: () => app.quit()
  })

  app.once('before-quit', () => {
    quitting = true
    // Suspended, not just closed: a late hover must not reach a destroyed window.
    hover.suspend()
    tray.destroy()
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  installErrorLog(join(app.getPath('userData'), 'logs', 'errors.log'), (title, message) =>
    dialog.showErrorBox(title, message)
  )
  // Windows are hidden rather than closed, so the app runs until Quit is chosen.
  app.on('window-all-closed', () => undefined)
  void app.whenReady().then(start)
}
