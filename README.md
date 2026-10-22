# K. Sivakumar — Portfolio (full stack)

Awwwards-tier dark single-page portfolio (`index.html`) + a small Node backend
that stores contact-form submissions and powers a hidden **admin console**
(opened by clicking the footer year **5 times**).

```
D:\protfolio\
├── index.html              # the whole site (frontend + admin portal UI)
├── server/                 # Express API + SQLite document store
│   ├── server.js           # static hosting + /api routes + security headers
│   ├── db.js               # storage layer (SQLite default, MongoDB optional)
│   ├── auth.js             # HMAC session tokens + timed-safe credential check
│   ├── routes/
│   │   ├── auth.routes.js        # POST /api/auth/login
│   │   └── messages.routes.js    # contact form + admin inbox CRUD
│   ├── scripts/smoke.js    # 10-check end-to-end API test
│   └── .env.example
├── render.yaml             # Render blueprint (one-click deploy)
├── legacy/                 # the old site, untouched
└── assets/                 # bg images, resume PDF (when added)
```

---

## 1. Run it locally

Requirements: **Node 24+** (uses the built-in `node:sqlite` module — no native
builds, no DB server to install).

```powershell
# one-time
npm install --prefix server

# terminal 1 — the full stack (API + site on one port)
$env:ADMIN_USER="admin"; $env:ADMIN_PASSWORD="sivakumar2026"; node server/server.js
# → http://127.0.0.1:3000
```

Then open **http://127.0.0.1:3000** — the same server serves the site and the
API, so there is no CORS involved.

Optional: also keep the static-only preview running (`python -m http.server 8000`).
When the site runs on port **8000** the frontend automatically targets
`http://127.0.0.1:3000` for the API (localhost origins are whitelisted in CORS).

### Try the admin console

1. Scroll to the footer and click the year **2026** five times (within 4 s).
   After 3 clicks it starts glowing — that's your hint.
2. Sign in: username `admin`, password `sivakumar2026` (local defaults).
3. The dashboard shows live stats from the database, every contact submission,
   and lets you delete messages or mark everything read.

---

## 2. Deploy to Render

**You do this part** (I have no access to your Render account):
create a free account at <https://render.com>, then either:

### Option A — Blueprint (recommended)

1. Push this repo to GitHub:
   ```powershell
   git add -A
   git commit -m "Portfolio + admin portal + Render backend"
   git remote add origin https://github.com/k-sivakumar/portfolio.git
   git push -u origin master
   ```
2. In the Render dashboard: **New → Blueprint**, pick the repo.
   Render reads `render.yaml` and provisions everything.
3. When prompted, fill in the `sync: false` secrets:
   - `ADMIN_USER` — your admin username
   - `ADMIN_PASSWORD` — a strong password (not the dev default!)
   - `ALLOWED_ORIGINS` — leave empty (the API and site share one origin)

This uses a **persistent disk** for the SQLite file, so submissions survive
redeploys. Disks require a paid instance (Starter, $7/mo).

### Option B — free tier + Supabase PostgreSQL (recommended)

Render's free instances lose local files on every restart, so SQLite would
wipe your messages. Point the backend at a **free Supabase Postgres database**
instead — the backend detects `DATABASE_URL` and switches automatically:

1. Sign up at <https://supabase.com> → **New project** → pick a region near you
   (Singapore/Mumbai) → set a database password (save it!).
2. **Project Settings → Database → Connection string → URI** and copy the
   **Session pooler** string (port `5432`, host `aws-0-...pooler.supabase.com`).
   It looks like: `postgres://postgres.xxxx:YOUR-DB-PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`
   – replace `YOUR-DB-PASSWORD` with the password you saved.
3. In Render: **New → Web Service** (or Blueprint — `render.yaml` already asks
   for the right keys), point at the repo, and fill the prompts:
   | Key | Value |
   |---|---|
   | Build command | `npm install --prefix server --omit=dev` |
   | Start command | `node server/server.js` |
   | `DATABASE_URL` | the Supabase session-pooler string |
   | `ADMIN_USER` / `ADMIN_PASSWORD` | your admin credentials |
   | `SESSION_SECRET` | leave to Render (generated) |

No tables to create — the backend creates the `messages` table on first boot.

Note: free Supabase projects pause after ~1 week of no database activity;
an email from Supabase restores them with one click. Portal logins and
contact messages count as activity.

*(MongoDB Atlas also still works — set `MONGODB_URI` instead and remove
`DATABASE_URL`.)*

---

## 3. Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Render injects its own port automatically |
| `ADMIN_USER` | `admin` | Admin console username |
| `ADMIN_PASSWORD` | `sivakumar2026` | **Change before deploying** |
| `SESSION_SECRET` | dev fallback | HMAC key for session tokens — **change** |
| `SESSION_TTL_MS` | `28800000` | Session lifetime (8 h) |
| `DB_PATH` | `./data/portfolio.db` | SQLite file location |
| `DATABASE_URL` | – | Supabase Postgres connection string (top priority when set) |
| `MONGODB_URI` | – | Atlas connection string (used if `DATABASE_URL` is unset) |
| `MONGODB_DB` | `portfolio` | Mongo database name |
| `ALLOWED_ORIGINS` | localhost dev ports | Extra CORS origins (production needs none) |
| `SITE_DIR` | repo root | Where `index.html` is served from |

## 4. API reference

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | – | Liveness + active DB driver |
| POST | `/api/messages` | – | Contact-form submission (6/min/IP) |
| POST | `/api/auth/login` | – | Returns a session token (5 tries/15 min/IP) |
| GET | `/api/messages` | Bearer token | Inbox + stats + DB driver |
| POST | `/api/messages/read-all` | Bearer token | Mark everything read |
| DELETE | `/api/messages/:id` | Bearer token | Delete one message |

Sessions are stateless HMAC-signed tokens (8 h TTL). Credential checks are
timing-safe. Message content is HTML-escaped in the admin UI (XSS-safe).

## 5. Verify a deployment

```powershell
$env:ADMIN_USER=<you>; $env:ADMIN_PASSWORD=<yours>
node server/scripts/smoke.js https://<your-app>.onrender.com
```

Expect **10 passed, 0 failed**. Note: on Render free tier the service sleeps
after ~15 min idle; the first request then takes ~50 s to wake.
