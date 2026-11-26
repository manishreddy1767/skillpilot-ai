# AI integration and privacy

## Nothing leaves the laptop

SkillPilot works entirely on this computer. Since version 2.0 there is no cloud AI and no API key, and
the app blocks every connection that would leave the laptop:

| Layer | What it does |
|---|---|
| Pages | The app's windows may load only its own files and local addresses. Every other request is cancelled before it is sent (`src/main/network-lock.ts`). |
| Main process | `fetch` is wrapped so it can reach only `localhost`, `127.0.0.1`, or `[::1]`, which is where Ollama runs. |
| Chromium | Background networking, component updates, domain reliability, safe-browsing checks, sync, pings, and DNS prefetch are switched off before start-up. The spell checker is off, because it downloads dictionaries. |
| Proof | A test asks Windows which connections the running app's processes hold, and requires every one to be local. |

Blocked attempts are written to the error log by host name only, never the full address.

The only thing that reaches the internet is **your own browser**, when you ask SkillPilot to open a job
search or a website. That is Chrome talking to the site, as if you had typed the address; SkillPilot
itself sends nothing, and never signs in to, reads, or scrapes LinkedIn, Naukri, or any other site.
Automated access to those sites breaks their terms and would put your accounts at risk, so it is not offered.

A cloud API key saved by an older version is deleted at start-up.

## The local model

AI runs in [Ollama](https://ollama.com) on this laptop. It is on by default with `qwen3:4b`; Settings
lists the installed models and whether Ollama is running. To add a model, run `ollama pull <name>`.

Each request asks for structured JSON with a fixed shape, and skips the model's separate "thinking"
pass, which small models take minutes over. A request times out after five minutes with a plain message.

With AI off, or Ollama not running, everything else works: gap scores, the skills library, job matching,
resumes, voice commands, and progress.

## What the AI does

| Feature | How it works |
|---|---|
| Assistant | Chat that knows your career data. It can suggest skills, goals, tasks, a level change, or marking a roadmap topic done, at most three per reply. |
| Agent | Given a goal, it works in up to six steps with SkillPilot's own tools: reading your skills, tasks, jobs, job matches, and role gaps, and suggesting tasks, skills, and goals. A repeated step is not run again, and a second repeat ends the run. |
| Role requirements | Drafted for a target role, under the skills' usual names, once each. |
| Skill-gap report | Code calculates readiness and gaps. The AI explains them and sets priorities; it cannot change the scores. |
| Roadmap | Ordered topics with effort, exercises, and resources, as one suggestion. |
| Daily tasks and project ideas | Suggested to fit your time and close your gaps. |
| Resume wording | Clearer wording for each line of a resume, for one job. |

## You approve every change

The AI only ever suggests. Each suggestion waits in a review list showing what would change, and
nothing is saved until you accept it. Accepted content is validated like anything you typed.

One exception, chosen by you: a question **spoken** to the assistant applies the suggestions it produces
straight away, so voice can act hands-free. Turn off **Carry out spoken requests straight away** in
Settings to review everything again.

## Honesty in resumes

The resume builder only uses what you entered. It puts a job's skills first and picks your most relevant
projects, but it never adds a skill or experience you do not have: skills a job wants that you lack are
listed as missing, with a reminder to add them only if they are true.

Wording from the local AI is checked before you see it. A suggestion that names a skill that is neither
in the original line nor among your skills is dropped, as is one that grows too long. You accept or
reject each remaining line.

## Without AI: the skills library

`src/shared/skills-library.ts` holds SkillPilot's own knowledge: over 100 skills with the names job
descriptions use for them, prerequisites, what to study, and a practice exercise each, and 22 roles common
in Indian hiring with the level and importance of each skill they need. It makes these work offline and
instantly, with no model at all:

- suggesting a role's requirements, and a roadmap for its gaps
- finding the skills a job description asks for, essential or nice to have, and your match
- counting "ReactJS" as React, "k8s" as Kubernetes, and so on, in gap analysis

## Jobs

Jobs are added by pasting a description or importing a page saved from the browser (Ctrl+S on LinkedIn,
Naukri, or Indeed). The page is read on this laptop: the structured job data sites embed is used first,
with the page text as a fallback. Scripts in the page are dropped, never run, and only web links are kept.
Search buttons, and voice commands such as "search Naukri for React jobs in Pune", open the site's search
in Chrome.

## Voice

There are two microphones: one in the assistant's input bar, and one on the widget at the robot's
bottom-right. Both use Windows' own offline speech engine (`System.Speech`), kept running in a hidden
PowerShell between requests. Recognition happens on the laptop; audio is never saved or sent. Listening
checks first that Windows has not muted the microphone.

The engine listens for the app's own command phrases first, which is far more reliable than free
dictation, and never acts on speech it is unsure of. Commands open apps, websites, searches, job
searches, folders, and SkillPilot screens, change the volume, lock the computer, and add or tick off
tasks. Spoken text is never run as a command, and nothing is closed, deleted, or bought by voice.

## How this was tested

Unit and integration tests use a stand-in Ollama server on this computer, so requests and errors are
exercised end to end without a model. An opt-in test, run with `SKILLPILOT_REAL_MODEL=qwen3:4b`, drives
the real app against the real model and prints what it said.

Testing with the real `qwen3:4b` found problems no stand-in could show, now fixed:

| Found | Fix |
|---|---|
| Chat copied the question as its answer, every time | The message is labelled, rules sit with the instructions, and an echo is retried once, then reported |
| Resume wording handed every line back unchanged | Each line is numbered and asked for separately, with an example |
| Requirements listed both Git and Version Control | Requirements use usual names, once each |
| The agent once repeated one lookup six times | Repeats are skipped, then the run ends |
| Chat quoted internal instructions | Rules moved out of the message |

Small models remain less reliable than large ones. Answers can be vague or slightly embellished, which is
why every change waits for your approval.
