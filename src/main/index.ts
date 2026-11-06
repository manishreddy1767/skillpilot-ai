import { join } from 'node:path'
import {
  BrowserWindow,
  app,
  dialog,
  ipcMain,
  powerMonitor,
  safeStorage,
  screen,
  type IpcMainEvent,
  type IpcMainInvokeEvent
} from 'electron'
import { Channel } from '../shared/ipc'
import { KeyStore } from './ai/key-store'
import { createAiHandlers } from './ai-handlers'
import { createDataHandlers } from './data-handlers'
import { localDate } from './db/backup'
import { openCareerData } from './db/open-career-data'
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

  const data = openCareerData({
    folder: dataPath,
    logError: (error) => writeErrorLog(errorLogPath, error),
    alertError: (error) => {
      const reason = error instanceof Error ? error.message : String(error)
      dialog.showErrorBox(
        'SkillPilot AI could not open your data',
        `The widget will still run, but your profile is unavailable. Your data file was not changed.\n\n${reason}`
      )
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

  const handlers = createDataHandlers({
    getStore: () => data.store,
    notifyOverview: () => {
      if (!overview.isDestroyed()) overview.webContents.send(Channel.OverviewChanged)
    },
    logError: (error) => writeErrorLog(errorLogPath, error),
    today: () => localDate(new Date())
  })

  const denied = { ok: false, message: 'Not allowed.' } as const

  /** Career data is only for the full app window. */
  const fromApp = <A extends unknown[], R>(handler: (...args: A) => R) => {
    return (event: IpcMainInvokeEvent, ...args: A) => {
      const allowed = appWindow && !appWindow.isDestroyed() && event.sender === appWindow.webContents
      return allowed ? handler(...args) : denied
    }
  }

  ipcMain.handle(Channel.GetProfile, fromApp(handlers.getProfile))
  ipcMain.handle(Channel.SaveProfile, fromApp(handlers.saveProfile))
  ipcMain.handle(Channel.ListRecords, fromApp(handlers.listRecords))
  ipcMain.handle(Channel.SaveRecord, fromApp(handlers.saveRecord))
  ipcMain.handle(Channel.DeleteRecord, fromApp(handlers.deleteRecord))
  ipcMain.handle(Channel.ListLinks, fromApp(handlers.listLinks))
  ipcMain.handle(Channel.SetLink, fromApp(handlers.setLink))
  ipcMain.handle(Channel.GetDashboard, fromApp(handlers.getDashboard))

  const keys = new KeyStore(join(dataPath, 'api-key.enc'), {
    isAvailable: () => safeStorage.isAsyncEncryptionAvailable(),
    encrypt: (text) => safeStorage.encryptStringAsync(text),
    decrypt: async (encrypted) => (await safeStorage.decryptStringAsync(encrypted)).result
  })

  const aiHandlers = createAiHandlers({
    getStores: () => (data.store && data.aiStore ? { store: data.store, aiStore: data.aiStore } : null),
    keys,
    notifyOverview: () => {
      if (!overview.isDestroyed()) overview.webContents.send(Channel.OverviewChanged)
    },
    logError: (error) => writeErrorLog(errorLogPath, error),
    today: () => localDate(new Date()),
    applySettings: () => undefined
  })

  ipcMain.handle(Channel.GetSettings, fromApp(aiHandlers.getSettings))
  ipcMain.handle(Channel.SaveSettings, fromApp(aiHandlers.saveSettings))
  ipcMain.handle(Channel.GetAiStatus, fromApp(aiHandlers.getAiStatus))
  ipcMain.handle(Channel.SaveApiKey, fromApp(aiHandlers.saveApiKey))
  ipcMain.handle(Channel.RemoveApiKey, fromApp(aiHandlers.removeApiKey))
  ipcMain.handle(Channel.GetChat, fromApp(aiHandlers.getChat))
  ipcMain.handle(Channel.SendChat, fromApp(aiHandlers.sendChat))
  ipcMain.handle(Channel.ClearChat, fromApp(aiHandlers.clearChat))
  ipcMain.handle(Channel.GetGapAnalysis, fromApp(aiHandlers.getGapAnalysis))
  ipcMain.handle(Channel.DraftRequirements, fromApp(aiHandlers.draftRequirements))
  ipcMain.handle(Channel.CreateGapReport, fromApp(aiHandlers.createGapReport))
  ipcMain.handle(Channel.GenerateRoadmap, fromApp(aiHandlers.generateRoadmap))
  ipcMain.handle(Channel.SuggestTasks, fromApp(aiHandlers.suggestTasks))
  ipcMain.handle(Channel.ListProposals, fromApp(aiHandlers.listProposals))
  ipcMain.handle(Channel.AcceptProposal, fromApp(aiHandlers.acceptProposal))
  ipcMain.handle(Channel.RejectProposal, fromApp(aiHandlers.rejectProposal))
  ipcMain.handle(Channel.GetAiLog, fromApp(aiHandlers.getAiLog))
  ipcMain.handle(Channel.GetOverview, (event) =>
    !overview.isDestroyed() && event.sender === overview.webContents ? handlers.getOverview() : denied
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

  app.once('will-quit', () => data.close())
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
