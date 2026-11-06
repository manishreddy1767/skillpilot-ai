import { BrowserWindow, screen } from 'electron'
import { circleRows } from '../logic/geometry'
import { loadPage, secureWebPreferences } from './common'

export const WIDGET_SIZE = 72

export function createWidgetWindow(): BrowserWindow {
  const { workArea } = screen.getPrimaryDisplay()

  const widget = new BrowserWindow({
    title: 'SkillPilot Widget',
    x: workArea.x + workArea.width - WIDGET_SIZE - 48,
    y: workArea.y + workArea.height - WIDGET_SIZE - 48,
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
