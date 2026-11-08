import type { DatabaseSync } from 'node:sqlite'

/** Each entry moves the database up one version. Never edit one that has shipped. */
export const migrations: string[] = [
  `
  CREATE TABLE profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    full_name TEXT NOT NULL DEFAULT '',
    headline TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    current_goal TEXT NOT NULL DEFAULT '',
    target_roles TEXT NOT NULL DEFAULT '',
    short_term_goals TEXT NOT NULL DEFAULT '',
    long_term_goals TEXT NOT NULL DEFAULT '',
    interests TEXT NOT NULL DEFAULT '',
    preferences TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  INSERT INTO profile (id) VALUES (1);

  CREATE TABLE education (
    id INTEGER PRIMARY KEY,
    institution TEXT NOT NULL,
    qualification TEXT NOT NULL,
    field_of_study TEXT NOT NULL DEFAULT '',
    start_date TEXT NOT NULL DEFAULT '',
    end_date TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE work_experience (
    id INTEGER PRIMARY KEY,
    company TEXT NOT NULL,
    role TEXT NOT NULL,
    start_date TEXT NOT NULL DEFAULT '',
    end_date TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE certification (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    issuer TEXT NOT NULL DEFAULT '',
    issue_date TEXT NOT NULL DEFAULT '',
    expiry_date TEXT NOT NULL DEFAULT '',
    credential_url TEXT NOT NULL DEFAULT ''
  );
  `,
  `
  CREATE TABLE skill (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    category TEXT NOT NULL DEFAULT 'technical' CHECK (category IN ('technical', 'non-technical')),
    claimed_level INTEGER NOT NULL DEFAULT 0 CHECK (claimed_level BETWEEN 0 AND 5),
    status TEXT NOT NULL DEFAULT 'learning' CHECK (status IN ('learning', 'using', 'completed')),
    notes TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE skill_level_history (
    id INTEGER PRIMARY KEY,
    skill_id INTEGER NOT NULL REFERENCES skill (id) ON DELETE CASCADE,
    level INTEGER NOT NULL,
    recorded_on TEXT NOT NULL DEFAULT (date('now', 'localtime'))
  );

  CREATE TRIGGER skill_level_added AFTER INSERT ON skill BEGIN
    INSERT INTO skill_level_history (skill_id, level) VALUES (new.id, new.claimed_level);
  END;

  CREATE TRIGGER skill_level_changed AFTER UPDATE OF claimed_level ON skill
  WHEN new.claimed_level <> old.claimed_level BEGIN
    INSERT INTO skill_level_history (skill_id, level) VALUES (new.id, new.claimed_level);
  END;

  CREATE TABLE evidence (
    id INTEGER PRIMARY KEY,
    skill_id INTEGER NOT NULL REFERENCES skill (id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'practice',
    strength INTEGER NOT NULL DEFAULT 2 CHECK (strength BETWEEN 1 AND 3),
    observed_on TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE project (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    technologies TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'complete')),
    completed_on TEXT NOT NULL DEFAULT '',
    repo_url TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE project_skill (
    project_id INTEGER NOT NULL REFERENCES project (id) ON DELETE CASCADE,
    skill_id INTEGER NOT NULL REFERENCES skill (id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, skill_id)
  );

  CREATE TABLE goal (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    target_date TEXT NOT NULL DEFAULT '',
    priority INTEGER NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'done')),
    description TEXT NOT NULL DEFAULT '',
    completed_on TEXT NOT NULL DEFAULT ''
  );

  CREATE TRIGGER goal_done AFTER UPDATE OF status ON goal
  WHEN new.status = 'done' AND old.status <> 'done' BEGIN
    UPDATE goal SET completed_on = date('now', 'localtime') WHERE id = new.id;
  END;

  CREATE TRIGGER goal_reopened AFTER UPDATE OF status ON goal
  WHEN new.status <> 'done' AND old.status = 'done' BEGIN
    UPDATE goal SET completed_on = '' WHERE id = new.id;
  END;

  CREATE TRIGGER goal_added_done AFTER INSERT ON goal WHEN new.status = 'done' BEGIN
    UPDATE goal SET completed_on = date('now', 'localtime') WHERE id = new.id;
  END;

  CREATE TABLE goal_skill (
    goal_id INTEGER NOT NULL REFERENCES goal (id) ON DELETE CASCADE,
    skill_id INTEGER NOT NULL REFERENCES skill (id) ON DELETE CASCADE,
    required_level INTEGER NOT NULL DEFAULT 3 CHECK (required_level BETWEEN 1 AND 5),
    PRIMARY KEY (goal_id, skill_id)
  );

  CREATE TABLE goal_project (
    goal_id INTEGER NOT NULL REFERENCES goal (id) ON DELETE CASCADE,
    project_id INTEGER NOT NULL REFERENCES project (id) ON DELETE CASCADE,
    PRIMARY KEY (goal_id, project_id)
  );

  CREATE TABLE milestone (
    id INTEGER PRIMARY KEY,
    goal_id INTEGER REFERENCES goal (id) ON DELETE CASCADE,
    project_id INTEGER REFERENCES project (id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    due_date TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
    completed_on TEXT NOT NULL DEFAULT '',
    CHECK ((goal_id IS NULL) <> (project_id IS NULL))
  );

  CREATE TRIGGER milestone_done AFTER UPDATE OF status ON milestone
  WHEN new.status = 'done' AND old.status <> 'done' BEGIN
    UPDATE milestone SET completed_on = date('now', 'localtime') WHERE id = new.id;
  END;

  CREATE TRIGGER milestone_reopened AFTER UPDATE OF status ON milestone
  WHEN new.status = 'open' AND old.status = 'done' BEGIN
    UPDATE milestone SET completed_on = '' WHERE id = new.id;
  END;

  CREATE TRIGGER milestone_added_done AFTER INSERT ON milestone WHEN new.status = 'done' BEGIN
    UPDATE milestone SET completed_on = date('now', 'localtime') WHERE id = new.id;
  END;
  `,
  `
  CREATE TABLE setting (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE target_role (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE role_requirement (
    id INTEGER PRIMARY KEY,
    role_id INTEGER NOT NULL REFERENCES target_role (id) ON DELETE CASCADE,
    skill_name TEXT NOT NULL,
    required_level INTEGER NOT NULL DEFAULT 3 CHECK (required_level BETWEEN 1 AND 5),
    importance INTEGER NOT NULL DEFAULT 2 CHECK (importance BETWEEN 1 AND 3)
  );

  CREATE TABLE gap_report (
    id INTEGER PRIMARY KEY,
    role_id INTEGER NOT NULL REFERENCES target_role (id) ON DELETE CASCADE,
    summary TEXT NOT NULL,
    priorities TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE roadmap (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    start_date TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE roadmap_item (
    id INTEGER PRIMARY KEY,
    roadmap_id INTEGER NOT NULL REFERENCES roadmap (id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    week INTEGER NOT NULL DEFAULT 1,
    effort_hours INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
    details TEXT NOT NULL DEFAULT '',
    exercise TEXT NOT NULL DEFAULT '',
    resources TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE chat_message (
    id INTEGER PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE proposed_change (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL,
    summary TEXT NOT NULL,
    payload TEXT NOT NULL,
    details TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE ai_request (
    id INTEGER PRIMARY KEY,
    feature TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    sent TEXT NOT NULL,
    ok INTEGER NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE task (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'learning',
    due_date TEXT NOT NULL DEFAULT '',
    minutes INTEGER NOT NULL DEFAULT 30,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
    completed_on TEXT NOT NULL DEFAULT ''
  );

  CREATE TRIGGER task_done AFTER UPDATE OF status ON task
  WHEN new.status = 'done' AND old.status <> 'done' BEGIN
    UPDATE task SET completed_on = date('now', 'localtime') WHERE id = new.id;
  END;

  CREATE TRIGGER task_reopened AFTER UPDATE OF status ON task
  WHEN new.status = 'open' AND old.status = 'done' BEGIN
    UPDATE task SET completed_on = '' WHERE id = new.id;
  END;

  CREATE TRIGGER task_added_done AFTER INSERT ON task WHEN new.status = 'done' BEGIN
    UPDATE task SET completed_on = date('now', 'localtime') WHERE id = new.id;
  END;

  CREATE TABLE notification_log (
    id INTEGER PRIMARY KEY,
    dedupe_key TEXT NOT NULL UNIQUE,
    sent_on TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE progress_snapshot (
    day TEXT PRIMARY KEY,
    overall INTEGER,
    skills TEXT NOT NULL DEFAULT '{}'
  );
  `,
  `
  CREATE TABLE certification_skill (
    certification_id INTEGER NOT NULL REFERENCES certification (id) ON DELETE CASCADE,
    skill_id INTEGER NOT NULL REFERENCES skill (id) ON DELETE CASCADE,
    PRIMARY KEY (certification_id, skill_id)
  );

  CREATE TABLE work_skill (
    work_id INTEGER NOT NULL REFERENCES work_experience (id) ON DELETE CASCADE,
    skill_id INTEGER NOT NULL REFERENCES skill (id) ON DELETE CASCADE,
    PRIMARY KEY (work_id, skill_id)
  );
  `,
  `
  ALTER TABLE task ADD COLUMN remind_at TEXT NOT NULL DEFAULT '';
  ALTER TABLE task ADD COLUMN repeat TEXT NOT NULL DEFAULT 'none'
    CHECK (repeat IN ('none', 'daily', 'weekdays', 'weekly'));

  -- Finishing a repeating task creates the next one, unless it already exists.
  CREATE TRIGGER task_repeat AFTER UPDATE OF status ON task
  WHEN new.status = 'done' AND old.status <> 'done' AND new.repeat <> 'none' BEGIN
    INSERT INTO task (title, kind, due_date, minutes, status, remind_at, repeat)
    SELECT new.title, new.kind, next.day, new.minutes, 'open', new.remind_at, new.repeat
    FROM (
      SELECT CASE new.repeat
        WHEN 'daily' THEN date(base.day, '+1 day')
        WHEN 'weekly' THEN date(base.day, '+7 days')
        ELSE date(base.day, CASE strftime('%w', base.day) WHEN '5' THEN '+3 days' WHEN '6' THEN '+2 days' ELSE '+1 day' END)
      END AS day
      FROM (SELECT CASE WHEN new.due_date <> '' THEN new.due_date ELSE date('now', 'localtime') END AS day) AS base
    ) AS next
    WHERE NOT EXISTS (
      SELECT 1 FROM task WHERE title = new.title AND status = 'open' AND due_date = next.day
    );
  END;
  `
]

export class NewerDatabaseError extends Error {
  constructor(found: number, supported: number) {
    super(`The database is version ${found}, but this app only supports up to ${supported}`)
    this.name = 'NewerDatabaseError'
  }
}

export function databaseVersion(db: DatabaseSync): number {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number }
  return row.user_version
}

/**
 * Brings the database up to date. Each step is all-or-nothing, and an existing
 * database is backed up first. A database from a newer app is left untouched.
 */
export function migrate(
  db: DatabaseSync,
  backup: (fromVersion: number) => void,
  steps: string[] = migrations
): void {
  const current = databaseVersion(db)
  if (current > steps.length) throw new NewerDatabaseError(current, steps.length)
  if (current === steps.length) return
  if (current > 0) backup(current)

  for (let version = current; version < steps.length; version++) {
    db.exec('BEGIN')
    try {
      db.exec(steps[version]!)
      db.exec(`PRAGMA user_version = ${version + 1}`)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
}
