import { BrowserWindow } from 'electron'
import { MIC_BADGE_RATIO } from '../../shared/settings'
import { widgetShape, type Point } from '../logic/geometry'
import { loadPage, secureWebPreferences } from './common'

export function createWidgetWindow(position: Point, size: number): BrowserWindow {
  const widget = new BrowserWindow({
    title: 'SkillPilot Widget',
    ...position,
    width: size,
    height: size,
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
    // Clicking the widget must never take keyboard focus from the current app.
    focusable: false,
    webPreferences: secureWebPreferences
  })

  // The window is square but the robot and its microphone are round: let clicks through elsewhere.
  widget.setShape(widgetShape(size, MIC_BADGE_RATIO))
  loadPage(widget, 'widget')
  widget.once('ready-to-show', () => widget.showInactive())
  return widget
}
