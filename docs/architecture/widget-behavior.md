# Widget behaviour

This is the core of the product. Dragging, hover, click, and focus behaviour were proven with real
mouse input in milestone 0 (`npm run test:desktop`). Saved position and display recovery came in
milestone 1, and the options below in milestone 6.

## States

```
             hover 180 ms               cursor away 250 ms
   Widget  ----------------->  Overview  ----------------->  Widget
     |                            |
     | click                      | click an item
     v                            v
   Main window  <-----------------+
     |
     | minimize-to-widget button
     v
   Widget (still where you left it)
```

## Floating icon

The widget is a 72 x 72 px window: transparent, frameless, always on top, not resizable, out of the
taskbar, and `focusable: false`, so clicking it never takes keyboard focus from the app you are using.

The icon is round but the window is square. `setShape` limits the window's clickable area to the
circle on Windows, so the corners do not block clicks on whatever is behind them.

## Free dragging

CSS drag regions (`-webkit-app-region: drag`) are deliberately **not** used. Electron documents that
draggable areas swallow pointer events, which would break both hover and click on the widget.

Instead:

1. `pointerdown` captures the pointer and records the grab offset inside the widget.
2. While the button is held, the main process reads `screen.getCursorScreenPoint()` about 60 times a
   second, subtracts the offset, and moves the window with `setBounds`. It does not rely on the page's
   `pointermove` events, which can lag behind.
3. Movement under 4 px counts as a click. Anything more is a drag, and hover stays suppressed until
   it ends.
4. `pointerup` places the widget one last time and saves the position.

`setBounds` always passes the fixed width and height. Moving a window across monitors with different
scaling can otherwise change its size.

**There is no clamping and no snapping.** No screen edges, corners, or grid are imposed during a drag.
The widget goes wherever the cursor takes it, on any monitor.

## Remembering position

The position is saved to `widget-position.json` in the app's data folder the moment a drag ends, so a
crash loses nothing. It holds x, y, the display id, and that display's bounds. A missing or damaged file
means the widget starts at its default spot.

At launch, after any display change, and after waking from sleep:

- If at least half of the widget would be on a connected display, it returns to its spot exactly. That
  includes a spot the user chose partly off the screen edge.
- Otherwise it moves to the same relative position on its own display, or on the primary display if
  that display is gone, fully inside the work area.
- The user's spot is kept through a recovery, so the widget returns when the display does. Only a drag
  or a reset changes it.

This recovery is the only time the app moves the widget by itself, and it never happens during a drag.
Dragging cannot strand the widget, because the point being held always stays under the cursor.

As a final safety net, **Reset widget position** in the tray returns it to the default spot.

## Hover overview

The overview is its own window, created at startup and kept hidden so it opens instantly. It is shown
with `showInactive()`, so it never takes focus.

- **Opening.** The cursor must rest on the widget for 180 ms, which stops the panel flashing as the
  mouse passes by. It does not open during a drag.
- **Placement.** It opens beside the widget, on the side with room on that display. This moves the
  panel only, never the widget.
- **Closing.** `mouseleave` is unreliable when the cursor crosses between two windows. So while the
  panel is open, the main process checks the cursor position every 100 ms against the widget, the
  panel, and the gap between them, and hides the panel after 250 ms outside.
- **Using it.** The cursor can move into the panel, for example to tick off a task. The timing values
  will be tuned by hand.

Contents, most important first: current goal and overall progress, today's tasks, skills in progress,
next deadline, latest achievement, and one AI recommendation. It reads from the local database, so it
never waits on the network.

## Expanding

A click opens the main window: a normal, opaque, resizable window with a taskbar entry and the
standard title bar controls through `titleBarOverlay`, which keeps Windows 11 Snap working. It opens
centred on the widget's display, and moves there on reopening if it is on another display. Launching
the app a second time opens this window instead of starting another copy.

Its minimize-to-widget button hides the window. The widget stays where it was throughout.

## Options

| Setting | Default |
|---|---|
| Always on top | On |
| Widget size | 64 px, adjustable from 48 to 128 |
| Opacity | 100%, adjustable down to 30% |
| Always on top | On |
| Click-through mode | Off. When on, clicks pass through the widget. Turned off from the tray. |
| Start at login | Off. Only the installed app registers this. |

Two global shortcuts work from any app: Ctrl+Alt+Shift+S shows or hides the widget, and Ctrl+Alt+Shift+O opens the
full window. They can be turned off in Settings. If another app already holds one, it is noted in the
error log. If Windows is set not to show animations, the panel appears without fading and the
screens skip their transitions.

These are in Settings, apply at once, and are remembered. The tray's toggles change the same settings.

Hover and drag stay active at every opacity. Click-through is the one mode that disables them, which
is why it can only be reversed from the tray.
