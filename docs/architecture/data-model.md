# Data model and storage

## Storage

- **Location:** `%APPDATA%\SkillPilot AI\skillpilot.db`, outside the repository.
- **Mode:** SQLite in WAL mode, with foreign keys enforced.
- **Migrations:** an ordered list in `src/main/db/migrations.ts`, applied at startup and tracked by
  `PRAGMA user_version`. Each step is all-or-nothing, and an existing database is backed up first. A
  database from a newer version of the app is refused and left unchanged.
- **Backups:** one automatic copy a day in the `backups` folder, with the last 7 kept. Copies made before
  a migration are kept separately and never removed automatically.
- **If it cannot open:** the widget keeps running, the file is left untouched, and the app says why.
- **Portability:** full JSON export and import in Settings, planned for a later milestone.
- **Widget position:** kept in a small `widget-position.json` file, so the widget can appear before the
  database opens. Other settings are stored in the database.

## Claimed versus demonstrated skills

A skill has two separate measures, because knowing about something and having shown it are different.

- **Claimed level:** what I say, from 0 to 5. Changes are kept as history.
- **Demonstrated level:** derived only from evidence, such as a project, certification, or work
  experience. Each evidence item has a kind and a strength.

So if a project uses React, Python, and PostgreSQL, linking those skills creates evidence for all
three. A skill claimed at 4 with no evidence shows as unproven. Demonstrated level is computed by code
and can always be traced back to the evidence behind it.

## Tables

| Area | Tables |
|---|---|
| Profile | `profile` (one row), `education`, `work_experience`, `certification` |
| Skills | `skill`, `skill_level_history`, `evidence` |
| Goals | `goal`, `goal_skill`, `milestone` |
| Projects | `project`, `project_skill` |
| Target roles | `target_role`, `role_requirement` |
| Roadmap | `roadmap`, `roadmap_item`, `resource` |
| Daily work | `task`, `activity_log` |
| AI | `conversation`, `message`, `gap_report`, `proposed_change` |
| App | `setting`, `notification_rule`, `notification_log` |

`milestone` serves both goals and projects. Skills and evidence link to projects so that finishing a
project feeds straight into skill and goal progress.

## Computed measures

These come from code, not from the AI.

| Measure | Basis |
|---|---|
| Role readiness | Each requirement weighted by importance, scored from demonstrated level against required level, with partial credit for claimed-only skills |
| Goal progress | Milestones completed and required skills reached |
| Overall progress | Average of active goals, weighted by priority |
| Learning streak | Consecutive days with a completed learning task |
| Pace | Tasks and topics completed in the last 14 days against the prior 14 days |

The exact weights are set in milestone 3 and shown in the app, so every percentage can be explained.
