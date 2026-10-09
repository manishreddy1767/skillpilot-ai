# SkillPilot AI — Personal Career & Learning Agent

SkillPilot maintains an evidence-backed model of a user's skills, compares it with their career
goals and the job market, and recommends explainable next steps.

**Status:** Phase 1 — create and view a personal profile.
See [docs/architecture/architecture.md](docs/architecture/architecture.md) for the design and
[docs/decisions/](docs/decisions/) for architecture decision records.

```
backend/    FastAPI + SQLAlchemy + Alembic (Python, managed with uv)
frontend/   Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui
docs/       Architecture and decision records
```

## Prerequisites

- [uv](https://docs.astral.sh/uv/) (installs the pinned Python version automatically)
- Node.js 20.9+ and npm

No API keys, Docker, or database server are required for Phase 1 (SQLite is used locally).

## Setup

Run from the repository root in Git Bash:

```bash
# Backend
cd backend
cp .env.example .env          # optional; defaults work as-is
uv sync                       # creates backend/.venv and installs dependencies
uv run alembic upgrade head   # creates backend/skillpilot.db
cd ..

# Frontend
cd frontend
cp .env.example .env.local    # set BACKEND_URL if the backend is not on port 8000
npm install
cd ..
```

## Running locally

Use two terminals:

```bash
# Terminal 1 — API on http://localhost:8000 (interactive docs at /docs)
cd backend && uv run uvicorn app.main:app --reload --port 8000

# Terminal 2 — web app on http://localhost:3000
cd frontend && npm run dev
```

If a port is taken, pick another: `--port 8001` for the backend (and update `BACKEND_URL` in
`frontend/.env.local`), `npm run dev -- --port 3100` for the frontend.

## Checks

```bash
# Backend (from backend/)
uv run pytest
uv run ruff check .
uv run ruff format --check .

# Frontend (from frontend/)
npm run lint
npm run typecheck
npm run build
```

## Database migrations

```bash
cd backend
uv run alembic revision --autogenerate -m "describe the change"   # then review the file
uv run alembic upgrade head
```

`tests/test_migrations.py` fails if the models and migrations drift apart.

## API (v1)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/health` | Liveness |
| GET | `/api/v1/health/ready` | Database connectivity (503 if unreachable) |
| POST | `/api/v1/profiles` | Create a profile (409 on duplicate email) |
| GET | `/api/v1/profiles` | List profiles (`limit` ≤ 100, `offset`) |
| GET | `/api/v1/profiles/{id}` | Get a profile |

Errors share one envelope: `{"error": {"code", "message", "details"}}`.

## Known limitations (Phase 1)

- **No authentication** — anyone who can reach the API can read every profile. Do not deploy
  publicly until auth is implemented.
- Profiles cannot yet be edited or deleted (next increment).
- An unknown profile URL shows a "not found" page but responds with HTTP 200, because the page
  streams before the profile lookup finishes.
- SQLite is used until Phase 2 (see [ADR 0001](docs/decisions/0001-sqlite-first-postgres-before-phase-2.md)).
