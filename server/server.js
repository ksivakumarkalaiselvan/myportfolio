import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, getDriver } from './db.js';
import authRouter from './routes/auth.routes.js';
import messagesRouter from './routes/messages.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = process.env.SITE_DIR || path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));

/* ---------------- security headers ---------------- */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

/* ---------------- CORS (local dev only; production is same-origin) ----------------
   When the site is served by this same Express app the browser sends no
   Origin header for same-origin requests, so this is a no-op in production. */
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || [
  'http://127.0.0.1:8000',
  'http://localhost:8000',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:5500',
  'http://localhost:5500'
].join(',')).split(',').map((s) => s.trim()).filter(Boolean);

app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

/* ---------------- simple per-IP throttle for public writes ---------------- */
const writeHits = new Map();
app.post('/api/messages', (req, res, next) => {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const hit = writeHits.get(ip);
  if (!hit || now > hit.resetAt) {
    writeHits.set(ip, { count: 1, resetAt: now + 60_000 });
    return next();
  }
  hit.count += 1;
  if (hit.count > 6) {
    return res.status(429).json({ error: 'rate_limited', message: 'Too many messages sent. Please try again shortly.' });
  }
  next();
});
setInterval(() => {
  const now = Date.now();
  for (const [ip, hit] of writeHits) if (now > hit.resetAt) writeHits.delete(ip);
}, 60_000).unref();

/* ---------------- API ---------------- */
app.get('/api/health', async (_req, res) => {
  let dbOk = false;
  try {
    const { getStats } = await import('./db.js');
    await getStats();
    dbOk = true;
  } catch {
    dbOk = false;
  }
  res.json({ ok: true, db: getDriver(), dbReady: dbOk, uptime: Math.round(process.uptime()) });
});

app.use('/api/auth', authRouter);
app.use('/api/messages', messagesRouter);

app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));

/* ---------------- static site ---------------- */
app.use(
  express.static(SITE_DIR, {
    index: 'index.html',
    maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    }
  })
);

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(SITE_DIR, 'index.html'));
});

/* ---------------- errors ---------------- */
app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'server_error', message: 'Something went wrong on our side.' });
});

/* ---------------- boot ---------------- */
initDb()
  .then(() => {
    app.listen(PORT, HOST, () => {
      console.log(`[server] K. Sivakumar portfolio API listening on http://${HOST}:${PORT}`);
      console.log(`[server] serving site from ${SITE_DIR}`);
    });
  })
  .catch((err) => {
    console.error('[fatal] database initialisation failed:', err);
    process.exit(1);
  });
