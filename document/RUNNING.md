# Running the Nagla backend

Three processes plus Postgres:

| Part | Folder | Port | Start |
|---|---|---|---|
| PostgreSQL 16 | `docker-compose.yml` | 5433 | `docker compose up -d --wait postgres` |
| Node API | `api/` | 3000 | `npm run dev` |
| Job worker (detection + cleanup) | `api/` | – | `npm run worker` |
| AI service (FastAPI) | `ai/` | 8000 | `.venv/Scripts/python -m uvicorn app.main:app --port 8000` |

## Databases

One PostgreSQL server, two databases:

| Database | What | Migrations | Seed |
|---|---|---|---|
| `nagla` | users, moves, items, photos, quotes, tracking, jobs, settings | `api/src/db/migrations/` | companies, trucks, test users, settings |
| `nagla_catalog` | furniture catalog only (hardcoded reference data) | `api/src/db/catalog/migrations/` | `api/src/db/catalog/catalog.json` (300 rows) + 3 `other` rows |

- The vision model only returns a category and size class. The API then looks the item up in the catalog database (loaded into memory at start-up) for its size, weight, fragility and dismantle time.
- `move_items.catalog_id` points into the catalog database (no foreign key across databases). At confirmation each item gets a copy of its catalog row (`catalog_snapshot`), so later catalog changes never affect a confirmed move.
- To change the catalog: edit `catalog.json`, run `npm run seed`, restart the API and worker. Rows removed from the file are retired (hidden), never deleted.
- `npm run migrate` and `npm run seed` handle both databases. `npm run migrate -- latest catalog` runs only one.

## First time

```bash
docker compose up -d --wait postgres
cd api && cp .env.example .env && npm install && npm run migrate && npm run seed
cd ../ai && python -m venv .venv && .venv/Scripts/python -m pip install -r requirements-dev.txt
```

(On macOS/Linux the venv binaries are in `.venv/bin/`.)

## Tests

```bash
cd api && npm test          # 67 tests, uses the nagla_test database
cd ai && .venv/Scripts/python -m pytest -q
cd api && npm run smoke     # end to end against the running api + worker + ai
```

## Dev UI

`http://localhost:3000/dev/` (not served when `NODE_ENV=production`).

- Customer: log in as `customer@nagla.test` → My moves → New move → photos → detect → review → details → quotes → confirm → tracking.
- Company: log in as `admin@saqr.test` or `admin@fastmove.test` → accept → pick a technician (or use "Agent link" for the token-link crew page).
- Technician: log in as `tech@saqr.test` → tasks → statuses → chat → rate the client → profile.
- Seed password: `SEED_PASSWORD` in `api/.env`.

## AI keys (vision + filtering)

The keys from `document/.env` live in `ai/.env` (git-ignored; template: `ai/.env.example`).

| Step | Setting | What it does |
|---|---|---|
| Computer vision | `VISION_PROVIDER=gemini`, `GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-2.5-flash`) | All photos of one room in one Gemini call, strict JSON, one retry on invalid output (`ai/app/providers/gemini.py`) |
| AI filtering | `AI_FILTER=claude`, `CLAUDE_API_KEY`, `CLAUDE_BASE_URL` (Claude-dev proxy `https://claudeapikey.dev/v1`), `CLAUDE_MODEL` (default `claude-haiku-4-5`) | Text-only second pass: drops non-movable things, merges duplicates, fixes categories. It only refers to items by index, so it cannot invent items or boxes. Any error or timeout keeps the Gemini result (`ai/app/filtering.py`) |

- `VISION_PROVIDER=fake` / `AI_FILTER=none` turn the real models off (tests always do this, see `ai/tests/conftest.py`).
- `GET http://localhost:8000/health` shows the active provider and filter.
- The Claude-dev proxy is slow (about 50 s per call), and its `claude-*-5-5` models returned empty replies when tested, so `claude-haiku-4-5` is the default. The Node → AI timeout is 300 s.

Fake provider: fixed items per room name (bedroom, living, majlis, kitchen, dining, office; anything else gives moving boxes). A room name containing `garbage` returns invalid output, to test the failure path.

## Technician journey

Seeded technicians (role `agent`): `tech@saqr.test` (Ahmed Al-Yousef) and `tech@fastmove.test`, password `SEED_PASSWORD`.

1. Company admin accepts the move, then picks a technician in the **Technician** column (`POST /company/moves/{id}/assign`). After `accepted`, this also sets `crew_assigned`. A different technician can be picked until the crew is on the way.
2. The technician signs in and lands on `/dev/tech.html` (works at phone width).

| Method | Path | Screen |
|---|---|---|
| GET | `/tech/summary` | Home: assigned / in progress / completed counts, next task |
| GET | `/tech/tasks?scope=assigned\|in_progress\|completed\|all` | My tasks |
| GET | `/tech/tasks/{id}` | Task details: client, pickup/delivery with Google Maps links, services, schedule, truck, items, status checklist, timeline |
| GET | `/tech/tasks/{id}/job-sheet` | Crew job sheet |
| POST | `/tech/tasks/{id}/status` | Update status (`on_the_way` → `completed`). JSON `{stage, idempotency_key}`, or multipart with an optional `photo`. Same rules as `/moves/{id}/events`: idempotent, forward only, skipped stages logged |
| POST | `/tech/tasks/{id}/rate-client` | Rate the client (1-5 stars and an optional comment) after `completed`, once |
| GET | `/tech/profile` | Profile: completed moves, average rating from customers, performance, recent reviews |
| GET/POST | `/moves/{id}/messages` | Chat between the customer, the assigned technician and the company admin |
| POST | `/moves/{id}/rating` | Customer rates the technician after `completed` (shown on the technician's profile) |
| GET | `/moves/{id}/ratings` | Both ratings for a move |

- A technician only sees and updates the moves assigned to them. Others get 404 (or 403 on `/moves/{id}/events`).
- Moves now have a short number for screens (`move_no`, starting at 2800, "Move #2841").
- Migration: `api/src/db/migrations/006_technician.ts`.

## Android app

`mobile/` is a Capacitor 7 Android shell that opens the UI served by the API (customer, company admin and technician pages).

```bash
cd mobile && npm install && npm run build:apk      # builds android/app/build/outputs/apk/debug/app-debug.apk
adb reverse tcp:3000 tcp:3000                       # phone's localhost:3000 → this PC's API
npm run install:apk
```

- By default the app loads `http://localhost:3000/dev/index.html`, so the API (`npm run dev` in `api/`) must be running and `adb reverse` set up after each reconnect. Over Wi-Fi instead: `NAGLA_SERVER_URL=http://<pc-ip>:3000/dev/index.html npm run sync`, then rebuild.
- The build needs JDK 21 (`org.gradle.java.home` in `mobile/android/gradle.properties` points to `~/.jdks/jdk-21.0.13+9`. Change it on another PC). Android Studio's bundled JDK 25 is too new for Gradle 8.11.
- The dev UI is not served when `NODE_ENV=production`, so this setup is for development and demos.

## Google sign-in (second option)

Email + password is the main sign-in. Google is an extra button under it, shown only when the server has it configured (`GET /auth/google/status`).

| Where | How | Server needs |
|---|---|---|
| Android app | Native SDK: Android Credential Manager + Google Identity (`mobile/android/.../GoogleSignInPlugin.java`). The phone returns a Google ID token, the app posts it to `POST /auth/google/native`, and the API checks the signature, issuer, audience and expiry | `GOOGLE_CLIENT_ID` (the Web client ID, used as `serverClientId` and as the token audience) |
| Web dev UI (desktop browser) | Redirect: `/auth/google` → Google → `/auth/google/callback` → one-time code → `/auth/google/exchange` | also `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` |

Account matching: same Google account → same user. A new Google account becomes a new customer. A **verified** Google email that matches an existing password account is linked to it. An unverified one is refused.

Google Cloud setup (same project):
1. OAuth consent screen: External, Testing, test users added. Authorized domain `arc-homlab.com`.
2. **Web application** client: its ID goes in `GOOGLE_CLIENT_ID`. Redirect URI `https://nagla.arc-homlab.com/auth/google/callback` (web flow only).
3. **Android** client: package `com.nagla.app`, SHA-1 of the signing key. Debug builds on this PC use `~/.android/debug.keystore`: `5E:19:5D:76:E4:2A:6E:29:89:5A:80:58:AD:32:57:D6:27:E5:F3:27`. A release key needs its own SHA-1 added. Nothing from this client goes in `.env`: Google matches the app by package + SHA-1.

### Public test domain: https://nagla.arc-homlab.com

`api/.env` already uses it (`PUBLIC_URL`, `GOOGLE_REDIRECT_URI`, `APP_REDIRECT_URL`). Point the domain at port 3000 over HTTPS (reverse proxy or tunnel), never at port 8000 (AI service, spends API credits). Then `cd mobile && npm run build:apk:domain && npm run install:apk`. The app then works on any network, no `adb reverse` needed. Seeded test accounts use the generated `SEED_PASSWORD` in `api/.env` (re-applied by `npm run seed`). `GET /auth/google/status` tells the sign-in screen whether to enable the button.

## Node ↔ FastAPI contract

`contracts/detect-room.schema.json`. Node side: `api/src/modules/jobs/contract.ts`; Python side: `ai/app/schemas.py`.

## 24/7 on the ring server

`compose.ring.yaml` runs everything on the `ring` SSH host (Ubuntu ARM, Docker) as compose project `nagla` in `~/ring-apps/nagla`: Postgres, API, worker and AI service, all `restart: unless-stopped`, so they come back after crashes and reboots.

- Only the API is published: `127.0.0.1:4926` on ring. `https://nagla.arc-homlab.com` is forwarded there. Postgres and the AI service stay inside the Docker network.
- Deploy or update from this PC: `./deploy-ring.sh` (Git Bash). It uploads the code plus `api/.env` and `ai/.env`, rebuilds and restarts. Migrations and the seed run on every API start.
- The ring database is separate from the local one and starts empty (seeded users only). `POSTGRES_PASSWORD` is generated once in `~/ring-apps/nagla/.env` on ring.
- Logs: `ssh ring 'cd ~/ring-apps/nagla && docker compose logs -f api worker ai'`.

## Phone app UI (`app/`)

The real UI, merged from the friend's phone frontend (Arabic-first, English, dark mode, phone layout). Served by the API at `/app/` in every environment, and `/` redirects there. The Android app loads `https://nagla.arc-homlab.com/app/index.html`. `/dev/` stays as the test UI outside production.

- Kept from their frontend: theme and CSS (`style.css`, `phone.css`), fonts, logo and assets, the `ui.js` helpers, the landing page, the workspace shell and bottom navigation.
- New, wired to the API: `api.js` (tokens + refresh), `labels.js` (Arabic/English names for stages, roles and decisions), `auth.js` (email + password, customer sign-up, Google as a second option), `booking.js` (photos → AI scan → items → details → company prices → confirm), `request.js` (customer tracking, company accept/reject/assign, technician task statuses, chat, ratings), `workspace.js` (dashboards per role, profile, settings), `app.js` (router, events, background refresh every 8 s). Extra styles in `nq.css`.
- Their admin/inspection/manual-quote screens are not used: this app follows the backend's flow.
- Roles: customer (`#/dashboard`, `#/new`, `#/bookings`, `#/request/:id`), company admin (`#/requests`, `#/team`), technician (`#/jobs`, `#/task/:id`).

App icon and splash: `node mobile/scripts/icons.cjs` regenerates the Android launcher icons (adaptive + legacy), the splash screens and the web icons from `app/assets/naqla-mark.png` (the mark cropped from the brand sheet). The background is `#F1F8F6`.

