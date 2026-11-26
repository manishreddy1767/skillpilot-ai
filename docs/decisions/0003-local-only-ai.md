# ADR 0003: Local-only AI, and no automated access to job sites

- Status: Accepted
- Date: 2026-11-26

## Context

The owner asked that no data leave the laptop, "even a little bit", and for the app to work with
LinkedIn, Naukri, and other hiring sites, run on a local model, and make decisions.

Up to version 1.4, AI could use Claude through the Anthropic API, which sends career data to Anthropic.
Working with hiring sites automatically, by signing in, reading pages, or applying, would also send data
to those sites, and breaks their terms of use, which puts the owner's accounts at risk.

## Decision

- Remove the cloud AI, the API key, and the Anthropic SDK. AI runs only in Ollama on this laptop.
- Block every connection that would leave the laptop, from pages, the main process, and Chromium itself.
- Do not access job sites automatically. Jobs come in by pasting or importing a saved page, and searches
  open in the owner's own browser, which is the only part that reaches the internet.
- The AI only suggests; the owner approves every change. This was the owner's choice.
- Add an offline skills library, so the most important features do not depend on a model at all.

## Consequences

- Nothing about the owner can leave the laptop through SkillPilot, and a test proves the running app
  holds no outside connections.
- A small local model is slower and less capable than a large cloud one. Real-model testing found it
  echoing questions, returning text unchanged, and repeating steps; each was fixed, and the skills library
  carries the work that must be reliable.
- Job details must be brought in by hand, one job at a time.
- Exports from version 1.x cannot be imported into 2.0, because the database version changed.
