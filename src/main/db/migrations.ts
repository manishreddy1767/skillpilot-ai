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
