# Roadmap

Each milestone ends with something that runs on the laptop and is tested. The first two make up the
MVP.

## MVP scope

A running desktop app with the floating widget, free dragging, remembered position, hover overview,
click to expand, minimize back to the widget, a tray icon with Quit, and a basic career profile stored
locally. The overview shows real saved data.

Not in the MVP: AI, roadmaps, tasks, notifications, and the installer.

## Milestones

### M0: Widget spike (Phase 1)

Prove the risky behaviour with real windows before anything is built on it.

- Transparent always-on-top widget, custom drag, click versus drag detection
- Hover overview that opens and closes cleanly, with focus left alone
- Answers to the open questions in [Windows limits](architecture/windows-limits.md)

Done when dragging, hover, and click work together over ordinary apps. If a core behaviour cannot work,
the Electron decision is revisited here.

### M1: Desktop foundation (Phase 1)

- Project setup, three-window structure, typed IPC, tray, single instance, Quit
- Position saved and restored, including monitor removal
- Main window with minimize-to-widget

### M2: Profile and storage (Phase 2 start, completes the MVP)

- SQLite, migrations, and backups
- Profile, education, and experience screens
- Goal and career details feeding the hover overview

### M3: Career data (Phase 2)

- Skills with claimed and demonstrated levels, and evidence
- Goals with milestones
- Projects linked to skills
- Computed progress, skill visualizations, and the first dashboard

### M4: Career intelligence (Phase 3)

- API key handling, provider layer, and the "what was sent" view
- Target roles, skill-gap reports, and recommendations
- Roadmap generation and editing
- Assistant chat with `propose_change` confirmation

### M5: Learning management (Phase 4)

- Daily tasks, weekly targets, deadlines, reminders, and streaks
- AI-suggested daily tasks based on available time
- Roadmap adjusts as progress changes
- Full dashboard

### M6: Desktop integration (Phase 5)

- Start at login, configurable notifications with quiet hours and a daily limit
- Multi-monitor refinement, widget size and opacity, click-through mode, transitions
- Installer

### M7: Testing and refinement (Phase 6)

- Full test pass, data persistence checks, memory and startup measurements
- Widget tested across positions, monitors, and scaling levels
- Checks that it does not interfere with other apps

## Testing

| Layer | Tool | Covers |
|---|---|---|
| Logic and data | Vitest | Progress calculations, repositories, migrations |
| Windows | Playwright for Electron | Launch, IPC, window states, restored position |
| Manual checklist | By hand | Hover feel, focus, multiple monitors, sleep and wake, fullscreen apps |

Mouse feel and multi-monitor behaviour cannot be fully automated, so they stay on the manual checklist.

## Commit approach

One commit per real change, in small logical steps, attributed to `manishreddy1767`. No empty commits,
no splitting that makes history less useful, and no backdating.
