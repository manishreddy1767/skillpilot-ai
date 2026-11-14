# SkillPilot AI

A private, single-user career assistant for Windows that lives on the desktop as a small floating
robot widget. It tracks skills, goals, projects, and learning, and uses AI to recommend what to do next.

Status: version 1.3.0, with milestones M0 to M12 and voice built. See the [quality report](docs/quality-report.md) for
test results and what has not been tested yet. See the [roadmap](docs/roadmap.md).

## Install

Run `npm run dist`, then run `releaseSkillPilot AI Setup 1.3.0.exe`. It is unsigned, so Windows shows a
SmartScreen warning: choose **More info**, then **Run anyway**.

AI is optional and off by default. To use it, go to Settings, choose a provider, and add your Anthropic API
key or run a local Ollama model.

## Running it

Needs Node 24 on Windows 11.

```
npm install
npm run dev            # run with live reload
npm start              # build and run
npm test               # unit tests
npm run test:integration   # real app, leaves the mouse alone
npm run test:desktop   # real mouse test; takes over the mouse for about 30 seconds
npm run test:all       # everything except the installer
npm run test:installer # build, install, use, and uninstall the real installer
npm run dist           # build the Windows installer into release/
```

Use `npm run dev` or `npm start`. They build the app first, whereas `npx electron .` fails with
"Error launching app" if there is no build yet.

Your data stays on this laptop in `%APPDATA%\SkillPilot AI`, with daily backups in its `backups` folder.

Voice: open the Assistant and press the microphone in the input bar, then speak. Commands such as
"add task read the guide tomorrow", "mark read the guide as done", "add skill Python", "what's due today",
and "open my skills" are carried out at once. Anything else is sent to the assistant. Speech is recognised
offline by Windows, and audio is never saved or sent.

Shortcuts: Ctrl+Alt+Shift+S shows or hides the widget, and Ctrl+Alt+Shift+O opens SkillPilot. Settings
can export, import, and restore your data.

To exit, right-click the tray icon and choose Quit SkillPilot AI. Unexpected errors are saved to
`%APPDATA%\SkillPilot AI\logs\errors.log`.

## Documents

- [Architecture](docs/architecture/architecture.md): stack, process model, OS integration
- [Widget behaviour](docs/architecture/widget-behavior.md): floating icon, dragging, hover, expanding
- [Data model](docs/architecture/data-model.md): storage, tables, computed measures
- [AI and privacy](docs/architecture/ai-and-privacy.md): AI features, what leaves the laptop
- [Windows limits](docs/architecture/windows-limits.md): platform restrictions and open questions
- [Roadmap](docs/roadmap.md): MVP and milestones
- [Quality report](docs/quality-report.md): test results, measurements, and open items
- Decisions: [Electron](docs/decisions/0001-electron-desktop-shell.md),
  [built-in SQLite](docs/decisions/0002-built-in-sqlite.md)
