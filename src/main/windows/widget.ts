import { BrowserWindow } from 'electron'
import { circleRows, type Point } from '../logic/geometry'
import { loadPage, secureWebPreferences } from './common'

export const WIDGET_SIZE = 72

export function createWidgetWindow(position: Point): BrowserWindow {
  const widget = new BrowserWindow({
    title: 'SkillPilot Widget',
    ...position,
    width: WIDGET_SIZE,
    height: WIDGET_SIZE,
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

  // The window is square but the icon is round: let clicks through at the corners.
  widget.setShape(circleRows(WIDGET_SIZE))
  loadPage(widget, 'widget')
  widget.once('ready-to-show', () => widget.showInactive())
  return widget
}
