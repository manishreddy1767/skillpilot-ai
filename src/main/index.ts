import { join } from 'node:path'
import {
  BrowserWindow,
  app,
  dialog,
  ipcMain,
  powerMonitor,
  screen,
  type IpcMainEvent
} from 'electron'
import { Channel } from '../shared/ipc'
import { installErrorLog, writeErrorLog } from './error-log'
import { DragTracker } from './logic/drag-tracker'
import { centreIn, overlaps, placePanel, type Point } from './logic/geometry'
import { HoverController } from './logic/hover-controller'
import { isPoint } from './logic/validation'
import { WidgetPlacement } from './logic/widget-placement'
import { loadPosition, savePosition } from './position-store'
import { createTray } from './tray'
import { APP_WINDOW_SIZE, createAppWindow } from './windows/app-window'
import { OVERVIEW_SIZE, createOverviewWindow } from './windows/overview'
import { WIDGET_SIZE, createWidgetWindow } from './windows/widget'

const PANEL_GAP = 8
/** Displays often report several changes in a row, so wait for them to settle. */
const DISPLAY_SETTLE_DELAY = 300

const toPair = ({ x, y }: Point): [number, number] => [x, y]

function start(): void {
  const dataPath = app.getPath('userData')
  const errorLogPath = join(dataPath, 'logs', 'errors.log')
  const positionPath = join(dataPath, 'widget-position.json')

  const placement = new WidgetPlacement({
    size: WIDGET_SIZE,
    getDisplays: () => screen.getAllDisplays(),
    getPrimary: () => screen.getPrimaryDisplay(),
    load: () => loadPosition(positionPath),
    save: (position) => {
      // Losing a saved position is minor, so it must not interrupt the user.
      try {
        savePosition(positionPath, position)
      } catch (error) {
        writeErrorLog(errorLogPath, error)
      }
    }
  })

  const widget = createWidgetWindow(placement.target())
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

  // Fixed width and height: crossing monitors with different scaling can resize a window.
  const moveWidget = (position: Point): void => {
    widget.setBounds({ ...position, width: WIDGET_SIZE, height: WIDGET_SIZE })
  }

  const openApp = (): void => {
    hover.close()
    const { workArea } = screen.getDisplayMatching(widget.getBounds())
    if (!appWindow) {
      appWindow = createAppWindow(centreIn(workArea, APP_WINDOW_SIZE))
      appWindow.on('close', (event) => {
        if (quitting) return
        event.preventDefault()
        appWindow?.hide()
      })
      return
    }
    if (!overlaps(appWindow.getBounds(), workArea)) {
      appWindow.setPosition(...toPair(centreIn(workArea, appWindow.getBounds())))
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
      moveWidget(position)
    })
  )

  ipcMain.on(
    Channel.DragRelease,
    from(widget, () => {
      const result = drag.release()
      hover.resume()
      if (result === 'click') openApp()
      if (result === 'drag') placement.userMoved(widget.getBounds())
    })
  )

  ipcMain.on(Channel.HoverEnter, from(widget, () => hover.pointerEntered()))
  ipcMain.on(Channel.HoverLeave, from(widget, () => hover.pointerLeft()))
  ipcMain.on(Channel.OpenApp, from(overview, openApp))
  ipcMain.on(Channel.MinimizeToWidget, (event) => {
    if (appWindow && event.sender === appWindow.webContents) appWindow.hide()
  })

  let settleTimer: NodeJS.Timeout | null = null

  /** Puts the widget back where it belongs after anything that changes the displays. */
  const refitWidget = (): void => {
    if (settleTimer) clearTimeout(settleTimer)
    settleTimer = setTimeout(() => {
      if (quitting || drag.isDragging) return
      const target = placement.target()
      const { x, y } = widget.getBounds()
      if (target.x === x && target.y === y) return
      hover.close()
      moveWidget(target)
    }, DISPLAY_SETTLE_DELAY)
  }

  screen.on('display-added', refitWidget)
  screen.on('display-removed', refitWidget)
  screen.on('display-metrics-changed', refitWidget)
  powerMonitor.on('resume', refitWidget)
  app.on('second-instance', openApp)

  const tray = createTray({
    openApp,
    isAlwaysOnTop: () => widget.isAlwaysOnTop(),
    setAlwaysOnTop: (enabled) => {
      widget.setAlwaysOnTop(enabled)
      overview.setAlwaysOnTop(enabled)
    },
    isClickThrough: () => clickThrough,
    setClickThrough,
    resetWidgetPosition: () => {
      hover.close()
      moveWidget(placement.reset())
    },
    quit: () => app.quit()
  })

  app.once('before-quit', () => {
    quitting = true
    // Suspended, not just closed: a late hover must not reach a destroyed window.
    hover.suspend()
    if (settleTimer) clearTimeout(settleTimer)
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
