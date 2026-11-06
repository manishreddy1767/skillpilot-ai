# Quality report

Version 1.0.0, tested 2026-11-06 on the development laptop: Windows 11 Home, one monitor, 125% display
scaling.

## Test results

| Layer | Command | Result |
|---|---|---|
| Unit | `npm test` | 566 of 566 |
| Integration, the real app with a faked cursor | `npm run test:integration` | 125 of 125 |
| Installer, the real installed app | `npm run test:installer` | 7 of 7 |
| Real mouse | `npm run test:desktop` | 36 of 36 in most runs. See open items. |

Line coverage from unit tests alone is about 97%. Startup wiring is covered by the integration tests.

Each milestone was also checked by breaking the app on purpose, to confirm a test notices. All 79 such
breaks are caught, including sending private details to the AI, storing the key unencrypted, and letting
other windows read career data.

## Measurements

| Measure | Result |
|---|---|
| Launch to visible widget, installed app | 0.9 to 1.4 seconds |
| Memory with the full window open | About 575 MB working set, about 270 MB private, across 6 processes |
| Idle CPU | Under 1 second of CPU over 10 seconds |
| Dashboard with 200 skills, 50 goals, 500 tasks | About 5 ms |
| Hover overview with the same data | About 5 ms |
| Installer size | 118 MB |

Memory is the known cost of Electron. See [ADR 0001](decisions/0001-electron-desktop-shell.md).

## What was confirmed

- **Data:** survives restarts and a forced kill. Upgrades keep existing data and back it up first.
- **Widget:** free placement at all four corners and edges, with the panel staying on screen.
- **Other apps:** typing in another app is not disturbed by hovering or dragging, and clicks pass through
  the widget's corners.
- **Installer:** installs and uninstalls cleanly, with the database, encryption, AI client, real Windows
  notifications, and start at login all working in the installed app.

## Not tested

| Gap | Why |
|---|---|
| A real Claude request | No API key was available. The real SDK ran against a local server speaking the same format, so the first real request is the remaining check. |
| A real Ollama model | Ollama is not installed. It was tested against a local stand-in. |
| Two monitors, and other scaling levels | Only one monitor at 125% was available. Display changes are tested with simulated layouts. |
| Real sleep and wake, and real resolution changes | The same code paths are tested by simulating the events. |
| Clicking the actual tray icon by hand | Tests click the real menu items, but not through the Windows tray. |
| How it feels | Timing and smoothness need a person to judge. |

## Open items

- **Real-mouse test, first run after a pause.** That run sometimes fails a few checks, different ones each
  time, while the runs after it pass. Two real causes were found and fixed: drags relied on page events, and
  hover could miss a re-entry after a drag. What remains could not be reproduced on demand. It may be the
  test environment or a brief cold-start delay, but that is not proven.
- **Unsigned installer.** Windows SmartScreen warns on first run. See [Windows limits](architecture/windows-limits.md).
