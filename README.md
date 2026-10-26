# Found — Campus Lost & Found

A full-stack campus lost-and-found platform for reporting lost or found items, uploading photos, finding AI-assisted matches, filing and reviewing claims, chatting in real time, and answering policy questions with a retrieval-augmented assistant.

The app has three roles:

- **USER** — report items, upload images, browse the feed, file claims, chat, and receive notifications.
- **MANAGER** — review claims, manage item reports, and complete handovers.
- **ADMIN** — manage users, roles, audit logs, and the assistant's knowledge base.

---

## Why Found exists

Campus lost-and-found usually lives in group chats, spreadsheets, notice boards, and paper logs. That works for a single message, but it breaks down when several people are looking for similar items, when ownership has to be proved, or when staff need to know what happened next.

Found turns that scattered process into one searchable, staff-reviewed workflow:

- **Finders can report an item in under a minute** with photos, location, category, and identifying details.
- **Owners can search instead of scrolling** through chats, then open a report and submit a claim with proof.
- **AI narrows the search** by comparing descriptions, attributes, and photos, but it only suggests matches. People confirm them.
- **Staff review claims and complete handovers** after an ID check, with a clear status from submitted to resolved.
- **Everyone can see the next step** through claims, notifications, chat, and a grounded policy assistant.

### The problem it solves

| Campus problem | How Found handles it |
| --- | --- |
| Reports are scattered across group chats, stories, and spreadsheets. | A public, paginated board with search, categories, lost/found filters, and location context. |
| Owners cannot prove an item is theirs in a public thread. | Structured claims with evidence, visible only to the claimant and authorized staff. |
| Finders and owners cannot coordinate safely. | Claim-scoped real-time chat, without exposing personal details in the public report. |
| Staff manually compare dozens of reports. | Text, image, and attribute matching that produces ranked, explainable suggestions. |
| Nobody knows whether a claim is pending, approved, or completed. | Claim status tracking and manager handover completion. |
| Policy questions get answered inconsistently. | A retrieval-augmented assistant that cites approved campus knowledge documents. |
| There is no audit trail for sensitive actions. | Role-based staff/admin tools, audit logs, and user management. |

### What makes Found different

- **Searchable by default.** The board is the source of truth, not a chat thread.
- **Proof before handover.** A claim is reviewed before anyone receives an item.
- **AI suggests, people decide.** Match scores are hints, not automatic ownership decisions.
- **Privacy boundaries.** Public reports exclude claim evidence; claim details stay between the claimant and staff.
- **One timeline.** Report → match → claim → chat → review → handover → resolved.
- **Grounded answers.** The assistant answers from approved campus documents and shows its sources.

Found is a complete campus workflow demo, not a production deployment. See [Known limitations](#known-limitations) for the current scope.

---

## Contents

- [Why Found exists](#why-found-exists)
- [Features](#features)
- [How to use Found](#how-to-use-found)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Quick start with Docker](#quick-start-with-docker)
- [Local development setup](#local-development-setup)
- [Demo accounts](#demo-accounts)
- [Environment variables](#environment-variables)
- [Docker services and volumes](#docker-services-and-volumes)
- [Database and seed data](#database-and-seed-data)
- [AI pipeline](#ai-pipeline)
- [API overview](#api-overview)
- [Testing and quality checks](#testing-and-quality-checks)
- [Project structure](#project-structure)
- [Troubleshooting](#troubleshooting)
- [Production checklist](#production-checklist)
- [Known limitations](#known-limitations)

---

## Features

- Lost and found item reporting with image uploads, validation, and signed media URLs.
- Paginated item feed with search, filters, categories, and status tracking.
- AI-assisted lost/found matching using text and image embeddings.
- Claims workflow with manager approval, rejection, and handover completion.
- Real-time chat over WebSocket with persisted messages and read state.
- In-app notifications for matches, claims, messages, and announcements.
- Retrieval-augmented chatbot for campus lost-and-found policy questions.
- Admin tools for users, roles, audit logs, and knowledge documents.
- JWT access tokens, HttpOnly refresh cookies, Argon2 password hashing, and rate limiting.
- Redis-backed caching, rate limits, real-time pub/sub, and Celery task queue.

---

## How to use Found

The screenshots below come from the demo app. Start the app with [Docker](#quick-start-with-docker) or [local development](#local-development-setup), open it in a browser, and sign in with one of the [demo accounts](#demo-accounts). The password for every demo account is `Campus123!`.

The screenshots use generated placeholder images and demo data, not real student photos or personal information.

### 1. Sign in

![Found login screen with demo account shortcuts](screenshots/01-login.png)

Use a demo account to explore each role. The login screen includes quick-fill shortcuts for the main demo roles. After signing in, the app opens on the public board.

### 2. Browse and search the board

![The Found board showing found items, categories, and filters](screenshots/02-browse-board.png)

The board is the main discovery surface. Use the search bar for a description, brand, or location, switch between **Lost** and **Found**, and narrow results by category. The screenshot shows the result grid; the search controls sit above it. Each card shows the item photo, status, category, location, and when it was reported.

### 3. Report a lost or found item

![Report a lost item form with title, category, location, date, and photo fields](screenshots/03-report-item.png)

Choose **Report → Lost** or **Report → Found**. Add a clear title, description, category, location, date, and optional photos. The more specific the description, the better the matching and the easier it is for staff to verify a claim.

### 4. Open an item and send a claim

![Found item detail page for a backpack with claim status and safety guidance](screenshots/04-item-detail.png)

The item page shows the full description, photo, location, status, and attributes. If you recognize the item, use **This is mine — send a claim** to submit proof. Claim evidence is visible only to you and authorized staff. The screenshot shows an item that the demo user has already claimed and that is now under review.

### 5. Review possible matches

![Possible matches page showing an AI-suggested charger match with an 86 percent score](screenshots/05-matches.png)

Open **My reports → Matches** to see reports that look similar to yours. Each suggestion includes a score and a reason. Use **New**, **Notified**, **Confirmed**, and **Not a match** to keep the match queue useful. A high score is a hint, not proof.

### 6. Track claims

![Claims page showing an in-review backpack claim](screenshots/06-claims.png)

The **Claims** page shows every claim you have sent and its current state: **In review**, **Approved**, **Completed**, or **Rejected**. Open a claim to see the item, your evidence, and the next handover step.

### 7. Chat with the other person

![Real-time conversation with a finder about a backpack claim](screenshots/07-conversation.png)

Once a claim connects you with a finder or claimant, use the conversation to arrange a safe handover. Messages are persisted, delivered in real time, and scoped to the people involved. Keep personal documents and payment details out of chat.

### 8. Ask the assistant

![Found assistant answering a claim question with grounded sources](screenshots/08-assistant.png)

The assistant answers questions about reporting, claims, handovers, and campus policy. It retrieves approved knowledge documents, shows the sources it used, and labels whether the answer is grounded in campus information. If no external LLM is configured, it uses a deterministic fallback agent.

### 9. Staff review and handover

![Manager claim review queue with pending claims and review actions](screenshots/09-manager-claims.png)

Managers open the **Staff** workspace to compare claim evidence with the item report. They can approve or reject a claim, then complete the handover after checking the claimant's student or staff ID. Completing the handover marks the item as returned and resolves the report.

### 10. Admin operations

![Admin operations overview with accounts, reports, claims, knowledge, and recent activity](screenshots/10-admin-overview.png)

Admins get an operations view of accounts, open reports, pending claims, knowledge-base readiness, and recent audit activity. From here they can manage users and roles, review audit logs, and maintain the documents that power the assistant.

### Suggested end-to-end demo

1. Sign in as `student@campus.edu` and browse the board.
2. Open the **Black North Face backpack** and review the existing claim.
3. Check **My reports → Matches** for the charger match.
4. Open **Claims** and follow the in-review claim.
5. Open **Messages** and continue the backpack conversation.
6. Ask the assistant how to claim a found item.
7. Sign in as `manager@campus.edu` and review the pending claims.
8. Sign in as `admin@campus.edu` to inspect the operations overview.

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 8, TanStack Router, TanStack Query, Tailwind CSS 4, Radix UI, Bun |
| Backend | Python 3.13, FastAPI, SQLAlchemy 2 async, Alembic, Pydantic Settings |
| Database | PostgreSQL 17 with `pgvector` and `citext` |
| Cache and queue | Redis 7, Celery 5 |
| AI | `BAAI/bge-small-en-v1.5` (384d text), `openai/clip-vit-base-patch32` (512d image), sentence-transformers, Transformers, PyTorch CPU |
| Auth | JWT, HttpOnly refresh cookies, Argon2 via `pwdlib` |
| Tests | Vitest, React Testing Library, Playwright, Ruff |

---

## Architecture

```text
Browser
  |
  v
Nginx (web)  ──/api──>  FastAPI (api)  ──>  PostgreSQL 17 + pgvector
  |                         |
  |                         ├──> Redis 0 (cache, rate limits, pub/sub, Celery broker)
  |                         └──> Redis 1 (response cache)
  |
  └── static React build

Celery worker  ──>  PostgreSQL
      |
      ├──> text/image embeddings
      ├──> item matching
      ├──> knowledge-document ingestion
      └──> local model cache
```

In local development, Vite runs on port `5173` and proxies `/api` to the API on port `8000`. In Docker, Nginx serves the production React build on port `8080` and proxies `/api` to the API container.

---

## Quick start with Docker

This is the fastest way to run the full stack. It starts PostgreSQL, Redis, the FastAPI API, a Celery worker, and the React frontend behind Nginx.

### Prerequisites

- Docker Engine or Docker Desktop
- Docker Compose v2
- At least 8 GB of free RAM recommended
- At least 10 GB of free disk space for images, PyTorch, and AI model caches
- Internet access on first build and first AI task

### 1. Create the Docker environment file

From the repository root:

```bash
cp compose.env.example .env
```

Generate a JWT secret:

```bash
openssl rand -hex 32
```

Open `.env` and replace `JWT_SECRET_KEY` with the generated value. On Windows, you can generate one with:

```powershell
[System.Convert]::ToHexString((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

### 2. Build and start everything

```bash
docker compose up --build -d
```

The API container waits for PostgreSQL and Redis, runs `alembic upgrade head`, optionally seeds demo data, and then starts Uvicorn. The worker starts after the API is healthy.

### 3. Open the app

| Service | URL |
| --- | --- |
| Web app | <http://localhost:8080> |
| API | <http://localhost:8000> |
| API docs | <http://localhost:8000/docs> or <http://localhost:8080/docs> |
| Health check | <http://localhost:8000/health> or <http://localhost:8080/health> |

### 4. Check status and logs

```bash
docker compose ps
docker compose logs -f api
docker compose logs -f worker
docker compose logs -f web
```

The first AI task downloads the text and image models into the `model_cache` volume. This can take several minutes. The API remains usable while the worker downloads models.

### 5. Stop or reset

```bash
# Stop containers but keep data
docker compose down

# Stop containers and delete the database, uploads, Redis data, and model cache
docker compose down -v
```

### Port conflicts

Only the web and API ports are published. If either is already in use, set different ports in `.env`:

```dotenv
WEB_PORT=18080
API_PORT=18000
```

Then run `docker compose up --build -d` again. PostgreSQL and Redis are internal to the Compose network and are not exposed to the host. If you change `WEB_PORT`, also update `CORS_ORIGINS` in `.env` to match the new browser origin.

---

## Local development setup

Use this mode when you want hot reload and direct access to the source code.

### Prerequisites

- Python **3.13**
- [uv](https://docs.astral.sh/uv/)
- [Bun](https://bun.sh/) 1.4+
- Docker (recommended for PostgreSQL and Redis)
- Alternatively: PostgreSQL 17 with `pgvector` and `citext`, plus Redis 7
- Google Chrome if you want to run Playwright E2E tests

> Windows users should use WSL2 for the backend and Docker workflows.

### 1. Start PostgreSQL and Redis

From the repository root:

```bash
cd server
docker compose up -d postgres redis
```

This uses `server/docker-compose.yml`, which publishes PostgreSQL on `5432` and Redis on `6379`.

If you already have PostgreSQL or Redis running, either stop those services or change the ports in `server/docker-compose.yml` and `server/.env`.

### 2. Configure the backend

```bash
cd server
cp .env.example .env
```

Generate a secret and set `JWT_SECRET_KEY` in `server/.env`:

```bash
openssl rand -hex 32
```

Install dependencies:

```bash
uv sync
```

Apply migrations:

```bash
uv run alembic upgrade head
```

Seed demo data with generated placeholder images:

```bash
uv run python -m scripts.seed_dev --with-images
```

Run the API:

```bash
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3. Run the Celery worker

Open a second terminal:

```bash
cd server
uv run celery -A app.worker.celery_app worker --loglevel=INFO --concurrency=1
```

The worker handles item embeddings, match generation, and knowledge-document ingestion. Keep `AI_TASKS_ENABLED=true` in `server/.env` when the worker is running.

### 4. Run the frontend

Open a third terminal:

```bash
cd client
cp .env.example .env
bun install --frozen-lockfile
bun run dev
```

Open <http://localhost:5173>. Vite proxies `/api` and the WebSocket connection to the API at `http://127.0.0.1:8000`.

If your API is on a different host or port, update `VITE_API_PROXY_TARGET` in `client/.env`.

### 5. Useful local commands

```bash
# Re-seed from scratch
cd server
uv run python -m scripts.seed_dev --reset --with-images

# Create a new migration
uv run alembic revision --autogenerate -m "describe the change"

# Apply migrations
uv run alembic upgrade head

# Roll back one migration
uv run alembic downgrade -1

# Inspect Celery
uv run celery -A app.worker.celery_app inspect ping
uv run celery -A app.worker.celery_app inspect active
uv run celery -A app.worker.celery_app inspect registered
```

---

## Demo accounts

The seed script creates these development accounts. The password is the same for all of them:

```text
Password: Campus123!
```

| Role | Email | Notes |
| --- | --- | --- |
| USER | `student@campus.edu` | Main demo user with reports, claims, and conversations |
| USER | `finder@campus.edu` | Reports found items |
| USER | `nina@campus.edu` | Additional demo user |
| MANAGER | `manager@campus.edu` | Reviews claims and manages items |
| ADMIN | `admin@campus.edu` | Manages users, audit logs, and knowledge documents |
| USER | `disabled@campus.edu` | Inactive account used to test disabled-user behavior |

The seed script refuses to run when `ENVIRONMENT=production`.

---

## Environment variables

There are three separate environment files:

| File | Used by | Purpose |
| --- | --- | --- |
| `.env` (root) | Docker Compose | Ports, database credentials, JWT secret, demo seeding, worker concurrency |
| `server/.env` | Local backend | API, database, Redis, auth, AI, storage, and rate-limit settings |
| `client/.env` | Local frontend | Vite development proxy and API base URL |

Start from the examples:

```bash
cp compose.env.example .env       # Docker Compose
cp server/.env.example server/.env # local backend
cp client/.env.example client/.env # local frontend
```

For the Docker stack, keep `CORS_ORIGINS` aligned with `WEB_PORT`. The example uses port `8080`; if you change the port, update both values.

### Important backend variables

| Variable | Default | Description |
| --- | --- | --- |
| `ENVIRONMENT` | `development` | `development`, `test`, or `production` |
| `DEBUG` | `false` | FastAPI debug mode |
| `DATABASE_URL` | `postgresql+asyncpg://lostfound:lostfound@localhost:5432/lostfound` | Async PostgreSQL URL |
| `REDIS_URL` | `redis://localhost:6379/0` | Celery broker, rate limits, pub/sub |
| `REDIS_CACHE_URL` | Redis DB 1 | Response cache |
| `JWT_SECRET_KEY` | none | Must be at least 32 characters; generate with `openssl rand -hex 32` |
| `CORS_ORIGINS` | `[]` | JSON array of allowed browser origins |
| `STORAGE_DIR` | `storage` | Local upload directory |
| `AI_TASKS_ENABLED` | `true` | Enqueue embeddings, matching, and ingestion through Celery |
| `AI_DEVICE` | `cpu` | `cpu`, `cuda`, or `mps` |
| `AI_LLM_BASE_URL` | empty | Optional OpenAI-compatible base URL |
| `AI_LLM_API_KEY` | empty | Optional LLM API key |
| `AI_LLM_MODEL` | empty | Optional model name; without it the assistant uses its built-in fallback |
| `MAX_IMAGE_SIZE_BYTES` | `10485760` | 10 MB per image |
| `MAX_IMAGES_PER_ITEM` | `5` | Maximum images per item |

See `server/.env.example` for the complete list, including rate limits, cache TTLs, matching weights, and RAG settings.

### Frontend variables

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `/api/v1` | API base path or absolute URL |
| `VITE_API_PROXY_TARGET` | `http://127.0.0.1:8000` | Vite dev proxy target |

For Docker builds, `VITE_API_BASE_URL` is passed as a build argument. The default `/api/v1` keeps the browser on the same origin and lets Nginx proxy requests to the API.

---

## Docker services and volumes

The root `docker-compose.yml` defines:

| Service | Host port | Description |
| --- | --- | --- |
| `postgres` | none | PostgreSQL 17 with pgvector and citext |
| `redis` | none | Redis 7 with append-only persistence |
| `api` | `API_PORT` (`8000`) | FastAPI, migrations, optional demo seed |
| `worker` | none | Celery worker for AI jobs |
| `web` | `WEB_PORT` (`8080`) | Nginx serving the React build and proxying `/api` |

Persistent volumes:

| Volume | Mount | Contents |
| --- | --- | --- |
| `postgres_data` | `/var/lib/postgresql/data` | Database |
| `redis_data` | `/data` | Redis append-only data |
| `storage_data` | `/app/storage` | Uploaded item images |
| `model_cache` | `/models` | Hugging Face, sentence-transformers, and Torch model cache |

The Docker stack does **not** publish PostgreSQL or Redis ports. Use `docker compose exec` to access them:

```bash
docker compose exec postgres psql -U lostfound -d lostfound
docker compose exec redis redis-cli
```

---

## Database and seed data

Alembic migrations live in `server/alembic/versions/`. The API container applies them automatically before starting.

```bash
# Docker
docker compose exec api alembic upgrade head

# Local
cd server
uv run alembic upgrade head
```

The PostgreSQL init script `server/docker/postgres/init.sql` enables the `vector` and `citext` extensions on first database creation.

Seed demo data:

```bash
# Docker
docker compose exec api python -m scripts.seed_dev --with-images

# Local
cd server
uv run python -m scripts.seed_dev --with-images
```

Reset seeded data and recreate it:

```bash
docker compose exec api python -m scripts.seed_dev --reset --with-images
```

Set `SEED_DEMO_DATA=true` in the root `.env` to seed automatically when the API container starts. Set it to `false` for a clean database or production deployment.

---

## AI pipeline

Item processing is asynchronous:

1. A user creates or updates an item with optional images.
2. The API enqueues `app.worker.tasks.embeddings.refresh_item_embeddings`.
3. The worker builds a text representation, encodes it with `BAAI/bge-small-en-v1.5`, and encodes each image with CLIP.
4. The worker stores embeddings in PostgreSQL with pgvector.
5. Matching compares lost and found candidates using weighted text, image, and attribute scores.

Default matching settings:

| Setting | Value |
| --- | --- |
| Text weight | `0.45` |
| Image weight | `0.35` |
| Attribute weight | `0.20` |
| Minimum match score | `0.70` |
| Notification threshold | `0.90` |

The assistant uses hybrid retrieval over approved knowledge documents:

| Setting | Value |
| --- | --- |
| Chunk size | `800` characters |
| Chunk overlap | `120` characters |
| Candidate limit | `20` |
| Final top-k | `5` |
| Reciprocal-rank fusion `k` | `60` |

The LLM is optional. If `AI_LLM_BASE_URL` and `AI_LLM_MODEL` are empty, the chatbot uses its built-in heuristic agent instead of an external model.

Models are downloaded lazily on the first AI task. In Docker they are cached in the `model_cache` volume. On CPU, the first task may take several minutes.

---

## API overview

The API is versioned under `/api/v1`. Interactive documentation is available at `/docs` and `/redoc`.

| Area | Path |
| --- | --- |
| Auth | `/api/v1/auth` |
| Current user | `/api/v1/users` |
| Items | `/api/v1/items` |
| Media | `/api/v1/media` |
| Claims | `/api/v1/claims`, `/api/v1/manager/claims` |
| Matches | `/api/v1/items/{item_id}/matches`, `/api/v1/matches` |
| Conversations | `/api/v1/conversations` |
| Notifications | `/api/v1/notifications` |
| Chatbot | `/api/v1/chatbot/messages` |
| Admin users | `/api/v1/admin/users` |
| Admin audit logs | `/api/v1/admin/audit-logs` |
| Admin knowledge | `/api/v1/admin/knowledge-documents` |
| Realtime WebSocket | `/api/v1/ws` |
| Health | `/health` |

The frontend's TypeScript API types can be regenerated while the API is running:

```bash
cd client
bun run api:types
```

---

## Testing and quality checks

### Frontend

```bash
cd client
bun run lint
bun run typecheck
bun run test
bun run build
```

Playwright E2E tests use the installed Google Chrome channel and start the Vite dev server automatically:

```bash
cd client
bunx playwright install chrome
bun run test:e2e
```

The API and seeded database should be running before E2E tests.

### Backend

```bash
cd server
uv run ruff check .
```

The repository does not currently include a committed backend pytest suite. The frontend has Vitest and Playwright coverage.

### Docker

Validate the Compose file without starting containers:

```bash
docker compose --env-file compose.env.example config
```

Build the API and web images:

```bash
docker compose --env-file compose.env.example build api web
```

For a full-stack smoke test without conflicting with local services, use alternate ports:

```bash
API_PORT=18000 WEB_PORT=18080 \
CORS_ORIGINS='["http://localhost:18080","http://127.0.0.1:18080"]' \
  docker compose --env-file compose.env.example up --build -d
curl http://localhost:18000/health
curl http://localhost:18080/api/v1/items

# Clean up the test stack and its volumes
docker compose --env-file compose.env.example down -v
```

---

## Project structure

```text
.
├── README.md
├── compose.env.example          # Docker Compose environment example
├── docker-compose.yml           # Full-stack Docker setup
├── screenshots/                 # README walkthrough screenshots
├── client/
│   ├── .dockerignore
│   ├── Dockerfile               # React build + Nginx runtime
│   ├── nginx.conf               # SPA, API, WebSocket, and docs proxy
│   ├── package.json
│   ├── src/
│   │   ├── app/                 # Router and providers
│   │   ├── components/          # Shared UI
│   │   ├── features/            # Auth, items, claims, chat, admin, assistant
│   │   └── lib/                 # API client, auth store, realtime hooks
│   └── tests/                   # Vitest and Playwright tests
└── server/
    ├── .dockerignore
    ├── Dockerfile               # FastAPI + Celery runtime
    ├── docker/
    │   ├── api-entrypoint.sh    # Migrations and optional seed
    │   └── postgres/init.sql    # pgvector and citext extensions
    ├── docker-compose.yml       # Local PostgreSQL + Redis only
    ├── app/
    │   ├── auth/                # JWT auth and security
    │   ├── item/                # Item reports, media, storage
    │   ├── claim/               # Claims workflow
    │   ├── ai/                  # Embeddings, matching, RAG, chatbot
    │   ├── chat/                # Conversations and messages
    │   ├── notification/        # In-app notifications
    │   ├── audit/               # Audit logs
    │   ├── user/                # Users and admin user management
    │   ├── worker/              # Celery app and tasks
    │   └── main.py              # FastAPI entry point
    ├── alembic/                 # Database migrations
    ├── scripts/seed_dev.py      # Development seed data
    ├── pyproject.toml
    └── uv.lock
```

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `JWT_SECRET_KEY` validation error | Generate a secret of at least 32 characters and update `.env` or `server/.env` |
| API returns `503 Database unavailable` | Check PostgreSQL health and run `alembic upgrade head` |
| Web returns `502 Bad Gateway` | Check `docker compose logs api`; the API may be unhealthy or still starting |
| AI items stay in `PROCESSING` | Check `docker compose logs worker`, Redis health, and `celery inspect ping` |
| First AI task is very slow | The worker is downloading models; wait for `model_cache` to warm up |
| Port already in use | Set `WEB_PORT` or `API_PORT` in the root `.env`, or stop the conflicting local process |
| Login works but refresh fails | Use the same host (`localhost` vs `127.0.0.1`) and check `CORS_ORIGINS` and cookie settings |
| Image upload returns `413` | Nginx allows 12 MB per request; check `MAX_IMAGE_SIZE_BYTES` and the file size |
| Playwright cannot find Chrome | Run `bunx playwright install chrome` |
| Need a completely clean start | Run `docker compose down -v`, then start again |
| Local API and Docker API conflict | Stop one of them or change `API_PORT` |
| Local PostgreSQL/Redis conflict | Stop the local services or change the ports in `server/docker-compose.yml` and `server/.env` |

Useful health checks:

```bash
curl http://localhost:8000/health
curl http://localhost:8080/health
docker compose ps
docker compose logs --tail=100 api worker
```

---

## Production checklist

Before exposing this application publicly:

- Set `ENVIRONMENT=production` and `DEBUG=false`.
- Generate a strong `JWT_SECRET_KEY` and a strong PostgreSQL password.
- Set `SEED_DEMO_DATA=false`; never seed demo accounts in production.
- Serve the app over HTTPS and set `REFRESH_COOKIE_SECURE=true` if not relying on the production default.
- Restrict `CORS_ORIGINS` to your real frontend origin.
- Keep PostgreSQL, Redis, and the Celery worker on a private network.
- Back up `postgres_data` and `storage_data` regularly.
- Run a single migration step before rolling out multiple API replicas.
- Pin Docker image versions and rebuild regularly for security updates.
- Add structured logging, metrics, error tracking, and uptime monitoring.
- Review rate limits and upload limits for your expected traffic.
- Do not run Uvicorn with `--reload` or expose the development Vite server in production.

The Docker API image runs as a non-root user. The worker uses late task acknowledgements and a 30-second stop grace period.

---

## Known limitations

- There is no committed backend pytest suite yet; backend verification currently relies on Ruff and manual/API testing.
- No external LLM is configured by default; the assistant falls back to a deterministic heuristic agent.
- Notifications are in-app only. There is no email or push delivery.
- There is no CI/CD pipeline, production observability stack, or automated backup configuration in the repository.
- Docker AI inference uses CPU by default. GPU inference requires a CUDA-capable PyTorch image, the NVIDIA Container Toolkit, and Compose GPU configuration.
- Demo images are generated placeholders, not real photos.
