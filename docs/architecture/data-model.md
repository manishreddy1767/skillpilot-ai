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
- **Portability:** Settings can export everything to a JSON file, import it back, restore any backup, or
  erase everything. Imports are checked first and applied in one transaction, so a bad file changes nothing.
  The API key is never exported. A backup is taken before any of these replace data.
- **Widget position:** kept in a small `widget-position.json` file, so the widget can appear before the
  database opens. Other settings are stored in the database.

## Claimed versus demonstrated skills

A skill has two separate measures, because knowing about something and having shown it are different.

- **Claimed level:** what I say, from 0 to 5. Changes are kept as history.
- **Demonstrated level:** derived only from evidence, such as a project, certification, or work
  experience. Each evidence item has a kind and a strength.

So if a project uses React, Python, and PostgreSQL, linking those skills counts as evidence for all
three once the project is under way. A skill claimed at 4 with no evidence shows as unproven. Demonstrated level is computed by code
and can always be traced back to the evidence behind it.

## Tables

| Area | Tables |
|---|---|
| Profile | `profile` (one row), `education`, `work_experience`, `certification` |
| Skills | `skill`, `skill_level_history`, `evidence` |
| Goals | `goal`, `goal_skill`, `goal_project`, `milestone` |
| Projects | `project`, `project_skill` |
| Target roles | `target_role`, `role_requirement`, `gap_report` |
| Roadmap | `roadmap`, `roadmap_item` |
| Daily work | `task` |
| AI | `chat_message`, `proposed_change`, `ai_request` |
| App | `setting`, `notification_log` |

`milestone` serves both goals and projects. Skills and evidence link to projects so that finishing a
project feeds straight into skill and goal progress.

## Computed measures

These come from code in `src/shared/progress.ts`, not from the AI. The dashboard shows the rules, so
every number can be explained.

| Measure | Basis |
|---|---|
| Demonstrated level | Points from evidence: minor 1, solid 2, strong 3. A linked project earns 1 while active, 3 when complete, and 0 while planned. Levels 1 to 5 start at 1, 2, 4, 6, and 9 points. |
| Skill proof | Unproven with no demonstrated level, partly proven below the claim, proven at or above it |
| Goal progress | The average of milestones done and required skills reached. A skill counts fully for its demonstrated level and half for any claimed level beyond that. A done goal is 100%. |
| Overall progress | Average of active goals, weighted by priority: low 1, medium 2, high 3 |
| Role readiness | Each requirement weighted by importance, scored like goal skills, so claimed-only levels earn half credit. See `src/shared/gap.ts`. |
| Learning streak | Consecutive days with a finished task of any type except Other. Today not being done yet does not break it. See `src/shared/learning.ts`. |
| Weekly minutes | Minutes of finished tasks since Monday, against the target in Settings |
| Pace | Minutes finished in the last 14 days against the 14 before: up above 120%, down below 70% |
| Roadmap | Topics done, hours left, the current week from the start date, and how many weeks behind the next topic is |
