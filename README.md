# SkillPilot AI

A private, single-user career assistant for Windows that lives on the desktop as a small floating
widget. It tracks skills, goals, projects, and learning, and uses AI to recommend what to do next.

Status: early development. The floating widget works: free dragging, remembered position, hover
overview, and click to open. Career features come next. See the [roadmap](docs/roadmap.md).

## Running it

Needs Node 24 on Windows 11.

```
npm install
npm run dev            # run with live reload
npm start              # build and run
npm test               # unit tests
npm run test:integration   # real app, leaves the mouse alone
npm run test:desktop   # real mouse test; takes over the mouse for about 30 seconds
npm run test:all       # everything
```

Use `npm run dev` or `npm start`. They build the app first, whereas `npx electron .` fails with
"Error launching app" if there is no build yet.

To exit, right-click the tray icon and choose Quit SkillPilot AI. Unexpected errors are saved to
`%APPDATA%\SkillPilot AI\logs\errors.log`.

## Documents

- [Architecture](docs/architecture/architecture.md): stack, process model, OS integration
- [Widget behaviour](docs/architecture/widget-behavior.md): floating icon, dragging, hover, expanding
- [Data model](docs/architecture/data-model.md): storage, tables, computed measures
- [AI and privacy](docs/architecture/ai-and-privacy.md): AI features, what leaves the laptop
- [Windows limits](docs/architecture/windows-limits.md): platform restrictions and open questions
- [Roadmap](docs/roadmap.md): MVP and milestones
- Decisions: [Electron](docs/decisions/0001-electron-desktop-shell.md),
  [built-in SQLite](docs/decisions/0002-built-in-sqlite.md)
