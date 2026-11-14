# AI integration and privacy

## Approach

AI is optional. With it off, everything else works, including skill-gap scores.

Each AI feature is one request that returns structured JSON. There is no agent loop and no tool use, so
the app stays simple and two providers fit behind one small interface (`AiProvider`):

| Provider | How it runs | Data leaves the laptop? |
|---|---|---|
| Claude | `@anthropic-ai/sdk`, streamed, from the main process | Yes, to Anthropic |
| Ollama | A local model at a `localhost` address | No |
| Off | The default | No |

For Claude, the default model is `claude-opus-5-5`, and Sonnet 5.5 and Haiku 5.5 are options in Settings.
API use is billed per token to your own Anthropic account, separately from any Claude subscription. At
the listed $4 per million input tokens and $20 per million output tokens, a chat turn with 5,000 tokens
of context and a 1,000-token reply costs about $0.04, plus thinking tokens. Sonnet 5.5 is $2 and $10, and
Haiku 5.5 is $0.10 and $0.50. These prices are from reference data dated 2026-10-06, so check them.

Requests opt in to Anthropic's server-side fallback (`fallbacks: "default"`), so a request declined by a
safety classifier can be retried on another model. Haiku has no such fallback.

## What the AI does

| Feature | How it works |
|---|---|
| Role requirements | The AI drafts the skills a target role needs, as suggestions to accept. |
| Skill-gap report | Code calculates readiness and gaps. The AI explains them and sets priorities. It cannot change the scores. |
| Roadmap | The AI drafts ordered topics, effort, exercises, and resources, as one suggestion. Everything can be edited. |
| Daily tasks | The AI suggests tasks that fit the daily time set in Settings. |
| Project ideas | The AI suggests up to three projects that would demonstrate missing skills. Accepted ideas are linked to skills you already have. |
| Assistant | Chat that knows your career data. It can suggest new skills, goals, and tasks, and changes to existing items: your level for a skill, or marking a roadmap topic done. A change shows the current and new value, and is refused if the item changed after it was suggested. |
| Resources | Named so they can be searched for. The AI is told not to give links, because invented links are a known failure. |

## Changes need confirmation

The AI can only create suggestions. Each one waits in a review list, showing what would be added. Nothing
is saved until you accept it, and accepted content is validated like anything you typed. This holds for
every AI suggestion, which is stricter than confirming only the important ones.

One exception, chosen by you: a question **spoken** to the assistant applies the suggestions it
produces straight away, so voice can act hands-free. Only suggestions created by that question are
accepted, they are validated as usual, and the app says how many were applied. Typed messages never
do this. Turn off **Carry out spoken requests straight away** in Settings to review everything again.

## Voice

There are two microphones: one in the assistant's input bar, and one on the widget at the robot's
bottom-right. Both use Windows' own offline speech engine (`System.Speech`), kept running in a hidden
PowerShell between requests so listening starts at once. It closes after 10 idle minutes and with the
app. Recognition happens on the laptop: audio is never saved and never sent anywhere. Only the app
window and the widget may start listening.

**How it listens.** The engine first listens for the app's own command phrases, such as "open ...",
"add task ...", or "search for ...", with the names of installed apps, websites, folders, and sections.
This is far more reliable than free dictation, especially across accents. Anything else falls back to
dictation. Speech the engine is unsure of is never acted on: the app says what it thought it heard and
asks again.

**What it can do,** at once and without AI:

| Say | Does |
|---|---|
| "open Chrome", "open VS Code", "open WhatsApp" | Opens the installed app, by its Start menu entry |
| "open YouTube in Chrome", "go to example dot com" | Opens the website, in the named browser if installed |
| "search for React hooks", "play lofi on YouTube" | Opens a Google or YouTube search |
| "open downloads", "open Windows settings" | Opens the folder or Windows settings |
| "volume up", "mute", "lock my computer" | Presses the volume keys, or locks Windows |
| "what time is it", "what's the date today" | Says the time or date |
| "open my skills", "add task read the guide tomorrow", "mark the guide as done", "add skill Python", "what's due today" | SkillPilot itself |

Anything else is sent to the AI assistant when it is on.

**Safety.** Spoken text is never run as a command. Apps launch only from the Windows Start menu list,
web pages only as `http` or `https` addresses, and folders only from a fixed list. Nothing is closed,
deleted, or bought by voice. A task is ticked off only when exactly one open task matches.

**Replies** show in the assistant, or for the widget in the hover panel, which stays open while it talks.
They are also spoken aloud with Windows' offline voice; turn this off with **Speak replies aloud** in
Settings.

## What leaves the laptop

Only when using Claude, only when you run an AI feature, and only to the Anthropic API.

| Sent when relevant | Never sent |
|---|---|
| Headline, about me, goals, target roles, interests, preferences | API key, except to authenticate |
| Skills, levels, and status | Full name |
| Qualifications, job titles, and certifications | Email, phone, and location |
| Goals, projects, and role gaps | Employer and school names |
| The messages you write | Backups and the database file |

Free text is sent as written, so a name typed into "About me" or a message would be included. Settings
shows the exact text of your last 30 requests under **What was sent**, stored only on this laptop. How
Anthropic retains API data is set by its policies and your account, so check those directly.

## Keeping the key safe

- Entered in Settings, encrypted with `safeStorage` (Windows DPAPI), and stored in `api-key.enc`.
- Only the main process decrypts it. Renderers can save or remove it, but can never read it.
- It is kept out of the database, so it is not in logs, backups, or exports.
- The key is passed to the SDK explicitly, so credentials in environment variables are never used.

## Without a key or connection

AI buttons are disabled with the reason shown. Profile, skills, goals, projects, tasks, gap scores,
progress, and notifications keep working.

## How this was tested

The real SDK runs against a local server speaking Anthropic's streaming format, so requests, auth, and
error handling are exercised end to end. The real Anthropic service has not been called, because no key
was available during development. The first real request is the remaining check.
