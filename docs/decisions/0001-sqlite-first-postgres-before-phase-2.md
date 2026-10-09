# ADR 0001 — SQLite first, PostgreSQL before Phase 2

- Status: Accepted
- Date: 2026-10-09

## Context

PostgreSQL is the intended primary database. The development machine currently has neither
PostgreSQL nor Docker installed. Phase 1 (profile create/view) uses no PostgreSQL-specific
features.

## Decision

Use SQLite for Phase 1 through SQLAlchemy 2 and Alembic, using only portable column types.
Switch to PostgreSQL (via Docker Compose) at the start of Phase 2, before evidence, assessment,
and skill-graph tables are added.

## Consequences

- Zero-install local setup for Phase 1.
- Known divergences, mitigated in application code:
  - **Case sensitivity:** emails are lowercased before storage so uniqueness behaves identically.
  - **Time zones:** SQLite does not store offsets; timestamps are written in UTC and re-tagged as
    UTC when read.
  - **Type enforcement:** SQLite is permissive; Pydantic validation and explicit lengths keep data
    consistent.
- Migration cost is low: no production data exists; switching means changing `DATABASE_URL`,
  adding `psycopg`, and running `alembic upgrade head` against PostgreSQL.
- Phase 2+ features (recursive CTEs over the skill graph, JSONB provenance, pgvector) require
  PostgreSQL; this ADR expires at the start of Phase 2.
