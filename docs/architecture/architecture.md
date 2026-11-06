# SkillPilot AI: Architecture

Status: proposal, awaiting approval. Last updated 2026-11-06.

SkillPilot AI is a private, single-user Windows desktop application. It lives on the desktop as a
small floating widget and manages one person's career: profile, skills, goals, projects, learning,
and AI guidance. There is no server, no accounts, and no public deployment.

## Stack

| Concern | Choice | Why |
|---|---|---|
| Desktop shell | Electron 45 | Transparent, frameless, always-on-top windows, with click-through and hover forwarding as documented APIs. See [ADR 0001](../decisions/0001-electron-desktop-shell.md). |
| Language | TypeScript throughout | One language for the main process and the UI. |
| UI | React + Vite (electron-vite) | Runs from local files inside Electron. No web server, no browser. |
| Charts | Plain CSS and HTML | The charts are simple bars and meters, so no chart library is needed. |
| Storage | SQLite through built-in `node:sqlite` | Local file, no native module to rebuild. See [ADR 0002](../decisions/0002-built-in-sqlite.md). |
| AI | Claude API through `@anthropic-ai/sdk`, behind a provider interface | See [AI and privacy](ai-and-privacy.md). |
| Secrets | Electron `safeStorage` (Windows DPAPI) | The API key is encrypted on disk and never enters source control. |
| Packaging | electron-builder, NSIS installer | One installer with a Start Menu shortcut, which toasts need. |
| Tests | Vitest, real-input PowerShell test | Logic and database tests, plus real mouse tests against the built app. |

## Process model

```
                     Electron main process (Node)
   window manager | SQLite | AI client | scheduler | tray | notifications
          |                    |                    |
       typed IPC            typed IPC            typed IPC
          |                    |                    |
    Widget window       Overview window        Main window
    72 x 72 px          about 340 x 420 px     resizable
    transparent         transparent            opaque
    always on top       always on top          normal window
    never takes focus   never takes focus      in the taskbar
```

- **The main process owns everything sensitive.** Database access, the API key, and network calls
  stay there.
- **Renderers are UI only.** They run with `contextIsolation` on and `nodeIntegration` off, and
  reach the main process through a small typed preload API.
- **Three windows, not one that resizes.** Resizing a transparent window while animating it is
  fragile, and transparent windows are poor candidates for the full app. Each window does one job.
  See [widget behaviour](widget-behavior.md).
- **A tray icon is always present.** It is the way back if the widget is hidden or off screen, and
  the place to exit completely.

## Repository layout (planned)

```
src/
  main/        windows, ipc, db, ai, scheduler, tray
  preload/     typed bridge
  renderer/
    widget/    floating icon
    overview/  hover panel
    app/       full interface
  shared/      types used on both sides of IPC
tests/
docs/
```

## How the OS is used

| Need | Mechanism |
|---|---|
| Stay above other windows | `setAlwaysOnTop`, user-toggleable |
| Avoid stealing keyboard focus | `focusable: false` on the widget, `showInactive()` for the overview |
| Keep out of the taskbar | `skipTaskbar: true` on the widget and overview |
| Monitors | `screen` API, `display-added`, `display-removed`, `display-metrics-changed` |
| Sleep and wake | `powerMonitor` resume re-runs the scheduler |
| Start at login | `app.setLoginItemSettings`, off by default, set in Settings |
| Notifications | Electron `Notification`, which shows Windows toasts |
| One running copy | `app.requestSingleInstanceLock` |
| Exit | Tray menu, Quit |

Known constraints are listed in [Windows limits](windows-limits.md).

## Principles

- **Structured data is the source of truth.** The AI reads it and proposes changes. It never
  silently edits it.
- **Numbers are computed, not generated.** Progress, gaps, and streaks come from deterministic code,
  so they can be explained and reproduced.
- **Works without AI.** With no key or no internet, everything except AI features still runs.
- **Single user by construction.** No login, no tenant fields, one profile row.

## Relationship to the `phase-1-foundation` branch

That unmerged branch is a FastAPI and Next.js web application that plans a move to PostgreSQL. This
project now requires a genuine desktop application, so that code is not carried forward. Two of its
ideas are kept: evidence as the primary fact about a skill, and LLMs at the edges rather than as the
system of record.
