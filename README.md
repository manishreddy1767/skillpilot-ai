# SkillPilot AI

A private, single-user career assistant for Windows that lives on the desktop as a small floating
robot widget. It tracks skills, goals, projects, and learning, matches you to jobs, builds tailored
resumes, and uses a local AI to suggest what to do next. **Nothing leaves your laptop**: the AI runs in
Ollama on this computer, and the app blocks every outside connection.

Status: version 2.0.0, with milestones M0 to M17 built. See the [quality report](docs/quality-report.md) for
test results and what has not been tested yet. See the [roadmap](docs/roadmap.md).

## Install

Run `npm run dist`, then run `releaseSkillPilot AI Setup 2.0.0.exe`. It is unsigned, so Windows shows a
SmartScreen warning: choose **More info**, then **Run anyway**.

AI runs locally with [Ollama](https://ollama.com). Install it, run `ollama pull qwen3:4b`, and SkillPilot
uses it automatically; Settings shows whether it is ready. Without it, everything except the AI works.

## What it does

- **Skills library:** SkillPilot's own offline knowledge of over 100 skills and 22 roles. Get a role's
  requirements and a roadmap for your gaps instantly, with no AI.
- **Jobs:** search LinkedIn, Naukri, Indeed, or Foundit in Chrome, save a job page (Ctrl+S) and import it,
  and see your match, essential and nice-to-have skills, and what you are missing.
- **Resumes:** build a resume tailored to any saved job, check its job keywords, review the local AI's
  wording line by line, and export a PDF or text. It never claims skills you do not have.
- **Agent:** give the local AI a goal, such as "get me ready for the React job at Acme", and it looks
  things up and suggests tasks, skills, and goals for you to approve.
- **Voice:** press the microphone on the widget or in the Assistant and speak.

SkillPilot never signs in to or reads job sites itself; that would break their terms and risk your
accounts. See [AI and privacy](docs/architecture/ai-and-privacy.md).

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

Voice: press the microphone at the robot's bottom-right, or the one in the Assistant's input bar, and
speak. SkillPilot answers aloud and does it straight away: "open Chrome", "open YouTube in Chrome",
"search for React hooks", "play lofi on YouTube", "open downloads", "volume up", "what time is it",
"add task read the guide tomorrow", or "open my skills". Anything else goes to the AI assistant when it
is on. Speech is recognised offline by Windows, and audio is never saved or sent. See
[AI and privacy](docs/architecture/ai-and-privacy.md#voice) for everything it can do.

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
