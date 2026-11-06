# ADR 0002: SQLite through built-in node:sqlite

- Status: Proposed
- Date: 2026-11-06

## Context

The app needs reliable local relational storage. The usual Electron choice, `better-sqlite3`, is a
native module that must be rebuilt to match each Electron version, which is a known source of
breakage after upgrades. A server database such as PostgreSQL has no place in a single-user desktop
app.

## Verification

A throwaway Electron 45.2.3 app on the target laptop (Node 24.22.2 inside Electron) loaded
`node:sqlite`, created a database file, and wrote and read a row. It reported SQLite 3.53.4 and printed
no experimental warning.

## Decision

Use `node:sqlite` from the Electron main process. All SQL sits behind a small repository layer.

## Consequences

- No native dependency and no rebuild step, so installing and upgrading stay simple.
- Queries are synchronous, which is fine at this data size, but a slow query would block the main
  process. Heavy work should stay out of the hover path.
- If `node:sqlite` ever causes problems, `better-sqlite3` can replace it inside the repository layer.
- The database file is not encrypted. See [Windows limits](../architecture/windows-limits.md).
