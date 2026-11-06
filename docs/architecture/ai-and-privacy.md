# AI integration and privacy

## Approach

Calls go from the Electron main process to the Claude API using the official `@anthropic-ai/sdk`. They
sit behind a small `AiProvider` interface, so a local model such as Ollama could be added later for
fully offline use. That is not part of the MVP.

The default model is `claude-opus-5-5`, and the model is changeable in Settings. API use is billed per
token on your own Anthropic account, separately from any Claude subscription. At the listed price of
$4 per million input tokens and $20 per million output tokens, a chat turn with 5,000 tokens of
context and a 1,000-token reply costs about $0.04, plus any thinking tokens. Claude Sonnet 5.5 ($2 and
$10) and Claude Haiku 5.5 ($0.10 and $0.50) are cheaper options. Prices are from reference data dated
2026-10-06, so check them before relying on them. Settings will show running token use.

## What the AI does

| Feature | How it works |
|---|---|
| Role requirements | The AI drafts the skills a target role needs. I review and edit them, and they are stored locally. |
| Skill-gap report | Code compares my skills with the requirements. The AI explains the result and sets priorities, returning structured output. |
| Roadmap | The AI drafts ordered topics, effort, weekly goals, and exercises. I can edit everything. |
| Daily tasks | The AI suggests tasks from available time, priorities, and recent pace. |
| Assistant chat | Streaming chat with read tools for my data. |
| Resources | Web search is used so suggested links are real. Links are not invented from memory. |

## Changes need confirmation

The assistant has read tools and a single write-like tool, `propose_change`. A proposal is stored in
`proposed_change` and shown as a card with the exact before and after. Nothing is applied until I
accept it. This holds for every change the AI suggests, which is stricter than confirming only the
important ones.

## What leaves the laptop

Only AI features send data, only when used, and only to the Anthropic API. Everything else is local.

| Sent when relevant to the request | Never sent |
|---|---|
| Skills, levels, and evidence summaries | API key |
| Goals, target roles, and roadmap | Email, phone, and address |
| Project names, descriptions, and technologies | Full legal name |
| Tasks and progress summaries | Raw database or backups |
| Education and experience summaries | Widget and app settings |
| The chat messages I write | |

A "what was sent" view in Settings shows the exact content of recent requests. Web search queries
written by the AI also go through Anthropic's search tool. How Anthropic retains API data is set by its
policies and my account, so that should be checked directly.

## Keeping the key safe

- Entered in Settings, encrypted with `safeStorage` (Windows DPAPI), and stored locally. The async
  `safeStorage` API is used, because Electron 45 reports the sync availability check as deprecated.
- Only the main process decrypts it. Renderers never see it.
- It never appears in logs, exports, or backups.
- `.gitignore` excludes `.env` files, databases, and build output from the first commit of code.

## Without a key or connection

AI buttons show as unavailable with the reason. Profile, skills, goals, projects, tasks, computed
progress, and notifications keep working.
