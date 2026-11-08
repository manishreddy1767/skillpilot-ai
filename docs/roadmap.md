# Roadmap

Each milestone ends with something that runs on the laptop and is tested. The first two make up the
MVP.

## MVP scope

A running desktop app with the floating widget, free dragging, remembered position, hover overview,
click to expand, minimize back to the widget, a tray icon with Quit, and a basic career profile stored
locally. The overview shows real saved data.

Not in the MVP: AI, roadmaps, tasks, notifications, and the installer.

## Milestones

Development and testing use one monitor. Positioning stays aware of multiple monitors, and the widget
must stay reachable if the resolution or monitor setup changes. M0 to M3 need no API key. At M4 the
key is added through Settings.

### M0: Widget spike (Phase 1), complete

Prove the risky behaviour with real windows before anything is built on it.

- Transparent always-on-top widget, custom drag, click versus drag detection
- Hover overview that opens and closes cleanly, with focus left alone
- Answers to the open questions in [Windows limits](architecture/windows-limits.md)

Done when dragging, hover, and click work together over ordinary apps. If a core behaviour cannot work,
the Electron decision is revisited here.

### M1: Desktop foundation (Phase 1), complete

- Project setup, three-window structure, typed IPC, tray, single instance, Quit
- Position saved and restored, including monitor removal
- Main window with minimize-to-widget
- Reset widget position in the tray

### M2: Profile and storage (Phase 2 start, completes the MVP), complete

- SQLite, migrations, and backups
- Profile, education, experience, and certification screens
- Goal and career details feeding the hover overview

### M3: Career data (Phase 2), complete

- Skills with claimed and demonstrated levels, and evidence
- Goals with milestones
- Projects linked to skills
- Computed progress, skill visualizations, and the first dashboard

### M4: Career intelligence (Phase 3), complete

- API key handling, provider layer, and the "what was sent" view
- Target roles, skill-gap reports, and recommendations
- Roadmap generation and editing
- Assistant chat with `propose_change` confirmation

### M5: Learning management (Phase 4), complete

- Daily tasks, weekly targets, deadlines, reminders, and streaks
- AI-suggested daily tasks based on available time
- Roadmap adjusts as progress changes
- Full dashboard

### M6: Desktop integration (Phase 5), complete

- Start at login, configurable notifications with quiet hours and a daily limit
- Multi-monitor refinement, widget size and opacity, click-through mode, transitions
- Installer

### M7: Testing and refinement (Phase 6), complete

- Full test pass, data persistence checks, memory and startup measurements
- Widget tested across positions, monitors, and scaling levels
- Checks that it does not interfere with other apps

Results are in the [quality report](quality-report.md).

## After 1.0

These milestones cover parts of the original brief that 1.0 left thin, and gaps found while testing.

### M8: Data ownership, complete

- Export everything to a JSON file, and import it back
- Restore any backup from the app
- Erase everything, with a typed confirmation
- A backup before any import, restore, or erase

### M9: Progress over time, complete

- A daily snapshot of progress, kept locally
- A progress trend chart and a list of skills that improved
- A monthly review, and a weekly summary notification
- Progress history in the AI context, for questions like "how did I do this month"

### M10: Richer evidence, complete

- Certifications and work experience can count as evidence for skills
- AI project ideas that target missing skills, linked to those skills when accepted

### M11: Planning, complete

- Task reminders at a set time
- Repeating tasks
- A monthly learning target
- Assistant suggestions that change existing items, shown with before and after

### M12: Polish and release, complete

- Global keyboard shortcuts for the widget and the app
- A keyboard and accessibility pass
- A final quality pass, and version 1.1.0

### Voice, complete

- A microphone in the assistant's input bar, using Windows' offline speech engine
- Spoken commands carried out at once, and spoken questions sent to the assistant
- Settings for the speech language and for acting at once, and version 1.2.0

## Testing

Every feature ships with unit tests and integration tests, and they must pass before it counts as
done. `npm run test:all` runs every layer.

| Layer | Tool | Covers |
|---|---|---|
| Unit | Vitest, tests beside the code | Logic, windows, tray, bridge, screens, scripts |
| Integration | Playwright, `tests/integration` | The real app with a faked cursor: IPC, security, windows, tray, quit, errors |
| Desktop | `tests/desktop/widget.ps1` | Real mouse input against the built app, reading state from Windows |
| Installer | `tests/installer` | The real installer: install, use, measure, uninstall |
| Manual checklist | By hand | Hover feel, tray menu, sleep and wake, fullscreen apps |

Mouse feel cannot be fully automated, so it stays on the manual checklist.

Integration tests build to `out-test/` and use their own data folder, so they cannot disturb a running
copy of the app or real data. The desktop test uses the real mouse and `out/`, so close the app first.

## Commit approach

One commit per real change, in small logical steps, attributed to `manishreddy1767`. No empty commits,
no splitting that makes history less useful, and no backdating.
