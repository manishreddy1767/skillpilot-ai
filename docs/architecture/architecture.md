# SkillPilot AI — System Architecture

Status: living document. Last updated: 2026-10-09 (Phase 1).

## 1. Purpose

SkillPilot AI is a personal career and learning intelligence platform. It maintains an
evidence-backed, uncertainty-aware model of a user's skills, compares it with what their
target roles and the job market require, and recommends concrete, explainable next actions.
As new evidence arrives (learning, projects, assessments, application outcomes), the model
and the recommendations update.

SkillPilot is not a chatbot. Its value comes from **structured user state, provenance, and
explainable decisions**. LLMs are used at the edges — extracting structure from unstructured
text and generating prose — not as the system of record or the decision engine.

## 2. Core feedback loop

```
Profile → Skill assessment → Gap analysis → Learning plan → Learning & projects
   ↑                                                              │
   └── New goals ← Career opportunities ← Market analysis ← Updated skill profile ← New evidence
```

Every module must contribute to this loop. A feature that does not is out of scope until it does.

## 3. Data model principles

**Evidence is the primary fact. Skill assessments are derived from evidence, versioned, and
recomputable.**

Storing "Python: 7/10" as truth makes it impossible to explain, correct, or re-score. Storing
"built and tested a Flask app (project, 2026-09, user-reported)" and *deriving* proficiency and
confidence from it keeps every downstream recommendation explainable. The distinction between
exposure (watched a tutorial) and demonstrated competence (built, tested, explained) is encoded
in evidence kind and strength.

Target conceptual model (built incrementally across phases; only `profile` exists in Phase 1):

| Entity | Purpose | Phase |
|---|---|---|
| `profile` | The person: name, email, career goal, bio | 1 |
| `skill` | Canonical skill catalog (slug, name, category, description) | 2 |
| `evidence` | Profile × skill observation: kind, strength, source, observed_at, provenance | 2 |
| `skill_assessment` | Derived proficiency + confidence, `method_version`, `computed_at`; append-only | 2 |
| `skill_relation` | Graph edges (prerequisite_of, related_to, extends, used_with) | 3 |
| `target_role`, `role_skill_requirement` | Role requirements with level, importance, source | 3 |
| `plan`, `plan_item` | Learning roadmap items with rationale snapshot, status, success criterion | 3 |
| `recommendation_log` | Inputs, scores, and algorithm version for every recommendation | 3 |
| `job_posting` | Source URL, observed_at, content hash (dedupe), parsed requirements | 4 |
| `application` | Status history, resume version, outcomes | 5 |

Conventions:

- UUID primary keys (non-enumerable, portable across SQLite/PostgreSQL).
- All timestamps stored and returned in UTC.
- Structured relational records are authoritative; embeddings/retrieval are a supplement for
  semantic search over documents, never a substitute for user state.
- Personal data must be correctable and deletable.

## 4. System architecture

A **modular monolith**: one Next.js frontend, one FastAPI backend, one relational database.

```
Browser ──► Next.js (frontend/) ──/api/* rewrite──► FastAPI (backend/) ──► SQLite → PostgreSQL
```

- The frontend never touches the database; it consumes `/api/v1`.
- Next.js rewrites `/api/*` to the backend, so the browser stays same-origin (no CORS in dev).

### Backend layout

```
backend/app/
  main.py                 app factory, router mounting, exception handlers
  core/                   config, database session, error types
  api/v1/router.py        aggregates module routers under /api/v1
  modules/<module>/
    models.py             SQLAlchemy tables
    schemas.py            Pydantic request/response contracts
    service.py            business logic — no FastAPI imports
    router.py             thin HTTP layer: parse → call service → map errors
```

Rules:

- **Services do not import FastAPI.** They raise domain exceptions (e.g. `DuplicateEmailError`);
  `core/errors.py` maps them to HTTP responses. The same logic is reusable from tests, jobs, and
  future agent tool calls.
- No repository layer until a module's queries are complex enough to warrant hiding them.
- No provider abstraction until the first LLM-backed feature exists.
- Modules are created when they are implemented, not in advance.

### Deterministic vs. LLM responsibilities

| Deterministic code | LLM (when introduced) |
|---|---|
| Persistence, validation, constraints | Extracting structure from resumes / job descriptions |
| Gap calculations, scoring, ranking | Synthesising explanations from computed factors |
| Scheduling | Drafting resume wording traceable to evidence |
| Authorization, approval gates | |

## 5. API conventions

- Versioned under `/api/v1`.
- JSON request/response bodies validated by Pydantic; request models reject unknown fields.
- Every non-2xx response uses one envelope:

  ```json
  { "error": { "code": "duplicate_email", "message": "Human-readable message", "details": [] } }
  ```

- Uniqueness is enforced by database constraints; the API maps constraint violations to `409`.
- Request bodies are never logged (they contain personal data).

## 6. Phase 1 scope — create and view a profile

### `profiles` table

| Column | Type | Rules |
|---|---|---|
| `id` | UUID, PK | generated by the application |
| `name` | varchar(100), not null | trimmed, 1–100 chars |
| `email` | varchar(254), not null, unique | trimmed and lowercased before storage |
| `career_goal` | varchar(200), not null | trimmed, 1–200 chars; free text (structured target roles come in Phase 3) |
| `bio` | text, nullable | ≤ 2000 chars; blank becomes null |
| `created_at`, `updated_at` | timestamp with time zone | UTC |

### Endpoints

| Method & path | Success | Errors |
|---|---|---|
| `GET /api/v1/health` | 200 `{"status": "ok"}` | — |
| `GET /api/v1/health/ready` | 200 `{"status": "ok"}` (DB reachable) | 503 |
| `POST /api/v1/profiles` | 201 + profile, `Location` header | 409 duplicate email, 422 validation |
| `GET /api/v1/profiles` | 200 `{ items, total }` (`limit` ≤ 100, `offset`) | 422 |
| `GET /api/v1/profiles/{id}` | 200 profile | 404, 422 malformed id |

### Frontend

- `/` — list profiles, link to create.
- `/profiles/new` — form; server errors (409/422) shown next to the relevant field.
- `/profiles/[id]` — profile view with not-found and error states.

### Out of scope for Phase 1

Authentication, profile update/delete (next increment), skills, LLMs, agents, external APIs,
Docker, Redis, pgvector.

> **Security note:** without authentication, anyone who can reach the API can read every profile.
> The application must not be deployed publicly before authentication is implemented.

## 7. Decisions

| Decision | Status | Rationale / trigger to revisit |
|---|---|---|
| Modular monolith | Decided | No requirement justifies distribution |
| SQLite first, PostgreSQL before Phase 2 | Decided — [ADR 0001](../decisions/0001-sqlite-first-postgres-before-phase-2.md) | |
| Alembic migrations from day one | Decided | Schema history is needed for the Postgres switch |
| `uv` for Python dependency management | Decided | Fast, lockfile, manages Python versions |
| Next.js App Router + `/api` rewrite proxy | Decided | Same-origin, no CORS config |
| Hand-written TS API types | Decided for Phase 1 | Revisit in Phase 2: generate from OpenAPI |
| Authentication | Deferred | Before any non-local deployment |
| Skill graph storage | Deferred | Phase 3: edge table + recursive CTEs in PostgreSQL; no graph DB |
| Skill taxonomy | Deferred | Phase 2: evaluate ESCO / O*NET rather than inventing one |
| TanStack Query | Deferred | Phase 2, when cache invalidation across views matters |
| pgvector, Redis, job queue | Deferred | First concrete requirement |
| LLM provider interface | Deferred | First LLM-backed feature |

## 8. Development

See the repository [README](../../README.md) for setup and commands.
