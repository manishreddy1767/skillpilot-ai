# Windows limits

Target: Windows 11 Home, the laptop this is developed on. Windows is the only supported platform.

## What Windows will not allow

| Limit | Effect |
|---|---|
| Exclusive-fullscreen games and apps | The widget can be covered. Borderless fullscreen is usually fine. |
| Lock screen and UAC prompts | These run on a secure desktop, so no app window appears there. |
| Other always-on-top windows | Windows has no "topmost of all". Task Manager or another on-top app may sit above the widget. |
| Do Not Disturb | Windows can hold back toasts. The app cannot override this and should not try. |
| Task Manager startup control | I can disable startup there, and it overrides the app setting. The app reads the real state. |

## Milestone 0 results

Tested with real mouse input on Windows 11 at 125% display scaling, on one monitor.

| Question | Result |
|---|---|
| Virtual desktops | The widget stayed visible after switching to a newly created desktop. |
| Win+D (Show Desktop) | The widget stayed visible. |
| Round hit area | `setShape` works. Clicks at the corners reached the app behind. No fallback is needed. |
| Click-through mode | Clicks reach the app behind, and hover and click on the widget are off. It uses plain `setIgnoreMouseEvents`, with no event forwarding. The mode is reversed from the tray. |

Not tested, because there is only one monitor: dragging between monitors with different scaling, and
unplugging a monitor. Fixed-size `setBounds` is in place for the first, and milestone 1 adds recovery
for the second, tested with simulated display layouts.

## Consequences of the design

- **Notifications only fire while the app runs.** There is no separate background service, so reminders
  are missed if the app is closed. Start at login covers most of this. On wake, overdue reminders are
  combined into one notification.
- **Toasts need the installed app.** They rely on an AppUserModelID and a Start Menu shortcut, so they
  may not behave the same when run from source.
- **SmartScreen.** The installer is unsigned, so Windows warns on first run. For one personal laptop,
  choosing Run anyway is reasonable and a signing certificate is not worth paying for.
- **The API key is tied to this Windows account.** DPAPI cannot decrypt it after a Windows reinstall or
  on another machine, so it has to be re-entered. Other data is unaffected.
- **The database is not encrypted.** It is protected by the Windows account. Device encryption, where
  the laptop supports it, protects it if the laptop is lost.
- **Memory.** Electron uses more memory than a native app. See
  [ADR 0001](../decisions/0001-electron-desktop-shell.md).

## Development note

The VS Code terminal can have `ELECTRON_RUN_AS_NODE=1` set, which makes Electron run as plain Node and
fail with `Cannot read properties of undefined (reading 'whenReady')`. This happened during research
on this laptop, in a shell started from VS Code. The variable is not saved in the Windows user or
machine environment. The dev script will clear it before launching.
