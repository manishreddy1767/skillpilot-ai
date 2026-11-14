import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  BrowserWindow,
  Notification,
  app,
  dialog,
  globalShortcut,
  systemPreferences,
  ipcMain,
  powerMonitor,
  safeStorage,
  screen,
  shell,
  type IpcMainEvent,
  type IpcMainInvokeEvent
} from 'electron'
import { openVocabulary, type StartApp } from '../shared/desktop-commands'
import { Channel, type VoiceStatus } from '../shared/ipc'
import { FIXED_PHRASES, SPOKEN_SECTION_NAMES } from '../shared/voice-commands'
import { MIC_BADGE_RATIO, defaultSettings, type Settings } from '../shared/settings'
import { KeyStore } from './ai/key-store'
import { createAiHandlers } from './ai-handlers'
import { createDataHandlers } from './data-handlers'
import { createPortabilityHandlers } from './portability-handlers'
import { localDate } from './db/backup'
import { openCareerData } from './db/open-career-data'
import { installErrorLog, writeErrorLog } from './error-log'
import { DragTracker } from './logic/drag-tracker'
import { centreIn, overlaps, placePanel, widgetShape, type Point } from './logic/geometry'
import { HoverController } from './logic/hover-controller'
import { isPoint } from './logic/validation'
import { WidgetPlacement } from './logic/widget-placement'
import { checkNotifications } from './notifier'
import { applyShortcuts } from './shortcuts'
import { loadPosition, savePosition } from './position-store'
import { createTray } from './tray'
import { APP_WINDOW_SIZE, createAppWindow } from './windows/app-window'
import { OVERVIEW_SIZE, createOverviewWindow } from './windows/overview'
import { createWidgetWindow } from './windows/widget'
import { createDesktopActions, type DesktopActions } from './voice/desktop-actions'
import { SpeechHost } from './voice/speech-host'
import { START_APPS_SCRIPT, StartApps } from './voice/start-apps'
import { respond } from './voice/voice-agent'
import { VoiceController } from './voice/voice-controller'

const PANEL_GAP = 8
/** Displays often report several changes in a row, so wait for them to settle. */
const DISPLAY_SETTLE_DELAY = 300
// Every minute, so reminders set for a time arrive on time. A check takes a few milliseconds.
const NOTIFICATION_CHECK_INTERVAL = 60 * 1000
const FIRST_NOTIFICATION_CHECK = 60 * 1000
const FADE_STEP = 0.2
const FADE_INTERVAL = 16
const DRAG_FOLLOW_INTERVAL = 16

const toPair = ({ x, y }: Point): [number, number] => [x, y]

function start(): void {
  const dataPath = app.getPath('userData')
  const errorLogPath = join(dataPath, 'logs', 'errors.log')
  const positionPath = join(dataPath, 'widget-position.json')

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

  const startupSettings = data.aiStore?.getSettings() ?? defaultSettings
  let widgetSize = Number(startupSettings['widgetSize'])

  const placement = new WidgetPlacement({
    getSize: () => widgetSize,
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

  const widget = createWidgetWindow(placement.target(), widgetSize)
  const overview = createOverviewWindow()
  let appWindow: BrowserWindow | null = null
  let quitting = false
  let clickThrough = process.argv.includes('--click-through') || startupSettings['clickThrough'] === 'on'
  let fadeTimer: NodeJS.Timeout | null = null

  const stopFade = (): void => {
    if (fadeTimer) clearInterval(fadeTimer)
    fadeTimer = null
  }

  const fadeInOverview = (): void => {
    stopFade()
    // Windows' "show animations" setting is respected: the panel then simply appears.
    if (systemPreferences.getAnimationSettings().prefersReducedMotion) {
      overview.setOpacity(1)
      overview.showInactive()
      return
    }
    let opacity = 0
    overview.setOpacity(opacity)
    overview.showInactive()
    fadeTimer = setInterval(() => {
      opacity = Math.min(1, opacity + FADE_STEP)
      if (!overview.isDestroyed()) overview.setOpacity(opacity)
      if (opacity >= 1) stopFade()
    }, FADE_INTERVAL)
  }

  const hover = new HoverController({
    getCursor: () => screen.getCursorScreenPoint(),
    getWidgetBounds: () => widget.getBounds(),
    getPanelBounds: () => overview.getBounds(),
    showPanel: () => {
      const bounds = widget.getBounds()
      const { workArea } = screen.getDisplayMatching(bounds)
      overview.setBounds(placePanel(bounds, OVERVIEW_SIZE, workArea, PANEL_GAP))
      fadeInOverview()
    },
    hidePanel: () => {
      stopFade()
      overview.hide()
    }
  })

  const drag = new DragTracker()

  // Fixed width and height: crossing monitors with different scaling can resize a window.
  const moveWidget = (position: Point): void => {
    widget.setBounds({ ...position, width: widgetSize, height: widgetSize })
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

  let dragTimer: NodeJS.Timeout | null = null

  const stopFollowing = (): void => {
    if (dragTimer) clearInterval(dragTimer)
    dragTimer = null
  }

  const followCursor = (): void => {
    const position = drag.move(screen.getCursorScreenPoint())
    if (!position) return
    hover.suspend()
    moveWidget(position)
  }

  ipcMain.on(
    Channel.DragPress,
    from(widget, (_event, offset) => {
      if (!isPoint(offset)) return
      drag.press(screen.getCursorScreenPoint(), offset)
      // The page's move events can lag or stop, so the cursor is followed from here.
      stopFollowing()
      dragTimer = setInterval(followCursor, DRAG_FOLLOW_INTERVAL)
    })
  )

  ipcMain.on(Channel.DragMove, from(widget, followCursor))

  ipcMain.on(
    Channel.DragRelease,
    from(widget, () => {
      // One last placement, so the widget always ends up exactly under the cursor.
      followCursor()
      stopFollowing()
      const result = drag.release()
      hover.resume()
      if (result === 'click') openApp()
      if (result === 'drag') placement.userMoved(widget.getBounds())
    })
  )

  /** After any change: refresh the panel and today's progress snapshot. */
  function changed(): void {
    if (!overview.isDestroyed()) overview.webContents.send(Channel.OverviewChanged)
    handlers.recordSnapshot()
  }

  const handlers = createDataHandlers({
    getStore: () => data.store,
    notifyOverview: changed,
    logError: (error) => writeErrorLog(errorLogPath, error),
    today: () => localDate(new Date()),
    latestPriority: () => data.aiStore?.latestPriority() ?? null,
    weeklyTarget: () => Number(data.aiStore?.getSettings()['weeklyMinutes'] ?? 0),
    monthlyTarget: () => Number(data.aiStore?.getSettings()['monthlyMinutes'] ?? 0)
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
    notifyOverview: changed,
    logError: (error) => writeErrorLog(errorLogPath, error),
    today: () => localDate(new Date()),
    applySettings: (settings) => applySettings(settings)
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
  ipcMain.handle(Channel.SuggestProjects, fromApp(aiHandlers.suggestProjects))
  ipcMain.handle(Channel.ListProposals, fromApp(aiHandlers.listProposals))
  ipcMain.handle(Channel.AcceptProposal, fromApp(aiHandlers.acceptProposal))
  ipcMain.handle(Channel.RejectProposal, fromApp(aiHandlers.rejectProposal))
  ipcMain.handle(Channel.GetAiLog, fromApp(aiHandlers.getAiLog))

  const jsonFilter = [{ name: 'SkillPilot AI export', extensions: ['json'] }]
  const portability = createPortabilityHandlers({
    getTransfer: () => data.transfer,
    chooseSavePath: async (suggested) => {
      const options = { defaultPath: suggested, filters: jsonFilter }
      const result = appWindow ? await dialog.showSaveDialog(appWindow, options) : await dialog.showSaveDialog(options)
      return result.canceled || !result.filePath ? null : result.filePath
    },
    chooseOpenPath: async () => {
      const options = { properties: ['openFile' as const], filters: jsonFilter }
      const result = appWindow ? await dialog.showOpenDialog(appWindow, options) : await dialog.showOpenDialog(options)
      return result.canceled ? null : (result.filePaths[0] ?? null)
    },
    afterReplace: () => {
      if (data.aiStore) applySettings(data.aiStore.getSettings())
      if (!overview.isDestroyed()) overview.webContents.send(Channel.OverviewChanged)
      // Lets the reply reach the page before it reloads with the new data.
      setTimeout(() => appWindow?.webContents.reload(), 300)
    },
    removeKey: () => keys.remove(),
    logError: (error) => writeErrorLog(errorLogPath, error),
    today: () => localDate(new Date())
  })

  ipcMain.handle(Channel.ExportData, fromApp(portability.exportData))
  ipcMain.handle(Channel.ImportData, fromApp(portability.importData))
  ipcMain.handle(Channel.ListBackups, fromApp(portability.listBackups))
  ipcMain.handle(Channel.RestoreBackup, fromApp(portability.restoreBackup))
  ipcMain.handle(Channel.EraseAll, fromApp(portability.eraseAll))
  ipcMain.handle(Channel.GetLearning, fromApp(handlers.getLearning))
  ipcMain.handle(Channel.GetHistory, fromApp(handlers.getHistory))
  handlers.recordSnapshot()
  ipcMain.handle(Channel.GetRecommendation, fromApp(handlers.getRecommendation))
  ipcMain.handle(Channel.GetRoleReadiness, fromApp(handlers.getRoleReadiness))
  ipcMain.handle(Channel.RescheduleRoadmap, fromApp(handlers.rescheduleRoadmap))

  // Voice: Windows' own offline speech engine, kept running in a hidden PowerShell between requests.
  const systemRoot = process.env['SystemRoot'] ?? 'C:\Windows'
  const powershell = join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const logError = (error: unknown): void => writeErrorLog(errorLogPath, error)
  const speech = new SpeechHost(spawn, powershell, (message) => logError(new Error(message)))
  const startApps = new StartApps(
    () =>
      new Promise((resolve, reject) =>
        execFile(powershell, ['-NoProfile', '-NonInteractive', '-Command', START_APPS_SCRIPT], { windowsHide: true, maxBuffer: 4_000_000 }, (error, stdout) =>
          error ? reject(error) : resolve(stdout)
        )
      )
  )
  /** Teaches the speech engine the apps, sites, and sections people can ask for by name. */
  const teach = (apps: StartApp[]): void =>
    speech.setVocabulary([...openVocabulary(apps), ...SPOKEN_SECTION_NAMES], FIXED_PHRASES)
  const teachSpeech = async (): Promise<void> => teach(await startApps.get())
  // Sites, folders, and sections are known at once. Installed apps follow when Windows has listed them.
  teach([])
  void teachSpeech()

  // Test hooks, set from outside: a recording to hear instead of the microphone, and a log that
  // records desktop actions and spoken replies instead of doing them.
  const testHooks = globalThis as { __skillpilotVoiceFile?: string; __skillpilotDesktopLog?: string[] }
  const realDesktop = createDesktopActions({
    launch: (file, args) => spawn(file, args, { detached: true, stdio: 'ignore', windowsHide: false }).unref(),
    openExternal: (url) => shell.openExternal(url),
    openPath: (path) => shell.openPath(path),
    folderPath: (folder) => app.getPath(folder),
    exists: existsSync,
    env: process.env
  })
  const desktop = new Proxy(realDesktop, {
    get: (target, name: keyof DesktopActions) => {
      const log = testHooks.__skillpilotDesktopLog
      if (!log) return target[name]
      return (...args: unknown[]) => {
        log.push(`${String(name)} ${JSON.stringify(args)}`)
        return name === 'openUrl' ? Promise.resolve('') : Promise.resolve()
      }
    }
  })

  // Messages for the app window wait until its page says it is ready, so none are lost while it loads.
  let appReady = false
  let appQueue: [string, unknown[]][] = []
  const sendToApp = (channel: string, ...args: unknown[]): void => {
    if (appWindow && !appWindow.isDestroyed() && appReady) appWindow.webContents.send(channel, ...args)
    else appQueue.push([channel, args])
  }
  ipcMain.on(Channel.AppReady, (event) => {
    if (!appWindow || appWindow.isDestroyed() || event.sender !== appWindow.webContents) return
    appReady = true
    for (const [channel, args] of appQueue) appWindow.webContents.send(channel, ...args)
    appQueue = []
  })
  app.on('browser-window-created', (_event, window) => {
    window.webContents.on('did-start-loading', () => {
      if (window === appWindow) appReady = false
    })
  })

  // The hover panel shows only the widget's own conversations.
  let panelTalking = false
  const broadcast = (status: VoiceStatus): void => {
    for (const window of [widget, panelTalking ? overview : null, appWindow]) {
      if (window && !window.isDestroyed()) window.webContents.send(Channel.VoiceStatus, status)
    }
  }
  /** Ends the widget's conversation: the panel goes back to its summary and may close again. */
  const endPanelTalk = (): void => {
    if (!overview.isDestroyed()) overview.webContents.send(Channel.VoiceStatus, { phase: 'idle' })
    panelTalking = false
    hover.release()
  }
  const voice = new VoiceController({
    host: {
      listen: (...args) => speech.listen(...args),
      cancel: () => speech.cancel(),
      say: (text) => {
        if (testHooks.__skillpilotDesktopLog) testHooks.__skillpilotDesktopLog.push(`say ${JSON.stringify(text)}`)
        else speech.say(text)
      }
    },
    respond: async (heard) => {
      await teachSpeech()
      return respond(heard, {
        data: {
          listRecords: (kind) => handlers.listRecords(kind),
          saveRecord: (kind, id, values) => handlers.saveRecord(kind, id, values),
          completeTask: (id) => handlers.completeTask(id)
        },
        desktop,
        apps: () => startApps.get(),
        today: () => localDate(new Date()),
        now: () => new Date(),
        actNow: () => data.aiStore?.getSettings()['voiceActNow'] !== 'off',
        aiBlocked: () => {
          const status = aiHandlers.getAiStatus()
          return status.ok ? status.value.blocked : status.message
        },
        logError
      })
    },
    language: () => data.aiStore?.getSettings()['voiceLanguage'] ?? 'en-US',
    speakReplies: () => data.aiStore?.getSettings()['voiceReplies'] !== 'off',
    audioFile: () => testHooks.__skillpilotVoiceFile,
    broadcast,
    logError
  })

  ipcMain.handle(Channel.Listen, fromApp(() => voice.listen()))
  ipcMain.handle(Channel.StopListening, (event) => {
    const allowed = [widget, appWindow].some((window) => window && !window.isDestroyed() && event.sender === window.webContents)
    return allowed ? voice.stop() : denied
  })

  /** The widget's microphone. Replies show in the hover panel, which stays open until a moment after. */
  let releaseTimer: NodeJS.Timeout | null = null
  ipcMain.on(
    Channel.WidgetListen,
    from(widget, async () => {
      if (voice.listening) {
        voice.stop()
        endPanelTalk()
        return
      }
      if (releaseTimer) clearTimeout(releaseTimer)
      panelTalking = true
      hover.hold()
      const result = await voice.listen()
      if (result.ok) {
        const { heard, reply, navigate, ask, minimize } = result.value
        const note = heard ? `Heard "${heard}". ${reply}` : reply
        if (navigate) {
          openApp()
          sendToApp(Channel.Navigate, navigate, note)
        } else if (ask) {
          openApp()
          sendToApp(Channel.VoiceAsk, ask)
        } else if (minimize) {
          appWindow?.hide()
        }
      }
      if (panelTalking) releaseTimer = setTimeout(endPanelTalk, 5_000)
    })
  )
  app.once('before-quit', () => speech.dispose())
  // The one change the hover panel may make: ticking off a task.
  ipcMain.handle(Channel.CompleteTask, (event, id: unknown) => {
    const fromPanel = !overview.isDestroyed() && event.sender === overview.webContents
    const fromAppWindow = appWindow && !appWindow.isDestroyed() && event.sender === appWindow.webContents
    return fromPanel || fromAppWindow ? handlers.completeTask(id) : denied
  })
  ipcMain.handle(Channel.GetOverview, (event) =>
    !overview.isDestroyed() && event.sender === overview.webContents ? handlers.getOverview() : denied
  )

  ipcMain.on(Channel.HoverEnter, from(widget, () => hover.pointerEntered()))
  ipcMain.on(Channel.HoverLeave, from(widget, () => hover.pointerLeft()))
  ipcMain.on(Channel.OpenApp, from(overview, openApp))
  ipcMain.on(Channel.MinimizeToWidget, (event) => {
    if (appWindow && event.sender === appWindow.webContents) {
      voice.stop()
      appWindow.hide()
    }
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

  // The tray names Hide or Show by the widget's state, which changes after the menu is first built.
  widget.on('show', () => refreshTray())
  widget.on('hide', () => refreshTray())

  const setAlwaysOnTop = (enabled: boolean): void => {
    widget.setAlwaysOnTop(enabled)
    overview.setAlwaysOnTop(enabled)
  }

  /** For when the widget is in the way, or cannot be found. The shortcut or the tray brings it back. */
  const toggleWidget = (): void => {
    if (widget.isVisible()) {
      hover.close()
      widget.hide()
    } else {
      moveWidget(placement.target())
      widget.showInactive()
    }
    refreshTray()
  }

  const { tray, refresh: refreshTray } = createTray({
    openApp,
    isAlwaysOnTop: () => widget.isAlwaysOnTop(),
    setAlwaysOnTop: (enabled) => {
      setAlwaysOnTop(enabled)
      data.aiStore?.saveSettings({ alwaysOnTop: enabled ? 'on' : 'off' })
    },
    isClickThrough: () => clickThrough,
    setClickThrough: (enabled) => {
      setClickThrough(enabled)
      data.aiStore?.saveSettings({ clickThrough: enabled ? 'on' : 'off' })
    },
    isWidgetVisible: () => widget.isVisible(),
    toggleWidget,
    resetWidgetPosition: () => {
      hover.close()
      moveWidget(placement.reset())
    },
    quit: () => app.quit()
  })

  /** Puts settings into effect. Used at startup and whenever they are saved. */
  function applySettings(settings: Settings): void {
    const size = Number(settings['widgetSize'])
    if (size !== widgetSize) {
      widgetSize = size
      moveWidget(widget.getBounds())
      widget.setShape(widgetShape(size, MIC_BADGE_RATIO))
    }
    widget.setOpacity(Number(settings['widgetOpacity']) / 100)
    setAlwaysOnTop(settings['alwaysOnTop'] === 'on')
    setClickThrough(settings['clickThrough'] === 'on')
    // A development build would register the bare Electron program, so only the installed app does this.
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: settings['startAtLogin'] === 'on' })
    const taken = applyShortcuts(globalShortcut, settings['shortcuts'] === 'on', { toggleWidget, openApp })
    if (taken.length) writeErrorLog(errorLogPath, new Error(`Shortcuts already used by another app: ${taken.join(', ')}`))
    refreshTray()
  }

  applySettings({ ...startupSettings, clickThrough: clickThrough ? 'on' : 'off' })

  const notify = (): void => {
    const { store, aiStore } = data
    if (!store || !aiStore || quitting) return
    const now = new Date()
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const recommendation = handlers.getRecommendation()
    try {
      checkNotifications({
        store,
        aiStore,
        today: localDate(now),
        time,
        recommendation: recommendation.ok ? recommendation.value : null,
        send: ({ title, body }) => {
          const notification = new Notification({ title, body })
          notification.on('click', openApp)
          notification.show()
        }
      })
    } catch (error) {
      writeErrorLog(errorLogPath, error)
    }
  }

  const firstCheck = setTimeout(notify, FIRST_NOTIFICATION_CHECK)
  const regularCheck = setInterval(notify, NOTIFICATION_CHECK_INTERVAL)
  powerMonitor.on('resume', notify)

  app.once('before-quit', () => {
    quitting = true
    clearTimeout(firstCheck)
    clearInterval(regularCheck)
    stopFade()
    stopFollowing()
    // Suspended, not just closed: a late hover must not reach a destroyed window.
    hover.suspend()
    if (settleTimer) clearTimeout(settleTimer)
    tray.destroy()
  })

  app.once('will-quit', () => {
    globalShortcut.unregisterAll()
    data.close()
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  installErrorLog(join(app.getPath('userData'), 'logs', 'errors.log'), (title, message) =>
    dialog.showErrorBox(title, message)
  )
  // Windows ties notifications to this id, which matches the installer.
  app.setAppUserModelId('com.skillpilot.ai')
  // Windows are hidden rather than closed, so the app runs until Quit is chosen.
  app.on('window-all-closed', () => undefined)
  void app.whenReady().then(start)
}
