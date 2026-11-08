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

The microphone in the assistant's input bar uses Windows' own offline speech engine (`System.Speech`),
run in a hidden PowerShell started by the main process. Recognition happens on the laptop: audio is
never saved and never sent anywhere. Only the recognised text is used, and only the app window may
start listening. Listening stops when you press stop, leave the assistant, minimise, or quit.

Simple commands are understood without AI and carried out at once: open a section, add a task (with
"today", "tomorrow", a weekday, or "in 3 days"), add a skill or goal, mark a task done, ask what is due,
and minimise. A task is ticked off only when exactly one open task matches. Anything else is sent to the
assistant as a message, which needs AI to be set up.

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
