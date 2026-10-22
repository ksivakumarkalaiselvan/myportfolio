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

### Option B — free tier (ephemeral filesystem)

Render's free instances lose local files on every restart, so swap SQLite for
MongoDB Atlas (free M0 cluster, forever):

1. Create a free cluster at <https://cloud.mongodb.com>, get the connection
   string, and whitelist `0.0.0.0/0` in Network Access.
2. In Render: **New → Web Service**, point at the repo, then set:
   | Key | Value |
   |---|---|
   | Runtime | Node |
   | Build command | `npm install --prefix server --omit=dev` |
   | Start command | `node server/server.js` |
   | `NODE_VERSION` | `24.x` |
   | `MONGODB_URI` | `mongodb+srv://…` (from Atlas) |
   | `MONGODB_DB` | `portfolio` |
   | `ADMIN_USER` / `ADMIN_PASSWORD` | your credentials |
   | `SESSION_SECRET` | long random string |

   Delete the `disk:` block from `render.yaml` if you use the blueprint route
   with this option.

The storage layer switches automatically: if `MONGODB_URI` is set it uses
Mongo, otherwise it uses SQLite at `DB_PATH`.

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
| `MONGODB_URI` | – | Set to use Atlas instead of SQLite |
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
