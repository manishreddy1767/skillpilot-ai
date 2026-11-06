import { join } from 'node:path'
import { Menu, Tray, app, nativeImage } from 'electron'

export interface TrayActions {
  openApp(): void
  isAlwaysOnTop(): boolean
  setAlwaysOnTop(enabled: boolean): void
  isClickThrough(): boolean
  setClickThrough(enabled: boolean): void
  quit(): void
}

/** The way back if the widget is hidden, and the way to exit completely. */
export function createTray(actions: TrayActions): Tray {
  const icon = nativeImage
    .createFromPath(join(app.getAppPath(), 'resources/icon.png'))
    .resize({ width: 16, height: 16 })
  const tray = new Tray(icon)
  tray.setToolTip('SkillPilot AI')

  const refresh = (): void => {
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open SkillPilot AI', click: actions.openApp },
        { type: 'separator' },
        {
          label: 'Always on top',
          type: 'checkbox',
          checked: actions.isAlwaysOnTop(),
          click: (item) => {
            actions.setAlwaysOnTop(item.checked)
            refresh()
          }
        },
        {
          label: 'Click-through mode',
          type: 'checkbox',
          checked: actions.isClickThrough(),
          click: (item) => {
            actions.setClickThrough(item.checked)
            refresh()
          }
        },
        { type: 'separator' },
        { label: 'Quit SkillPilot AI', click: actions.quit }
      ])
    )
  }

  refresh()
  tray.on('click', actions.openApp)
  return tray
}
