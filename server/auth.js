/**
 * Stateless HMAC session tokens + credential verification.
 * No JWT dependency: a signed base64url payload is enough for a single-admin portal.
 */
import crypto from 'node:crypto';

const SECRET = process.env.SESSION_SECRET || 'dev-only-secret-change-me';
const TOKEN_TTL_MS = Number(process.env.SESSION_TTL_MS || 8 * 60 * 60 * 1000); // 8h

export const DEFAULT_USER = process.env.ADMIN_USER || 'admin';
export const DEFAULT_PASSWORD = process.env.ADMIN_PASSWORD || 'sivakumar2026';

function sign(data) {
  return crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
}

/** Constant-time string compare that tolerates differing lengths. */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function createToken(username) {
  const payload = Buffer.from(
    JSON.stringify({ u: username, exp: Date.now() + TOKEN_TTL_MS })
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  if (!safeEqual(signature, sign(payload))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export function checkCredentials(username, password) {
  const expectedUser = process.env.ADMIN_USER || DEFAULT_USER;
  const expectedPass = process.env.ADMIN_PASSWORD || DEFAULT_PASSWORD;
  const userOk = safeEqual(username || '', expectedUser);
  const passOk = safeEqual(password || '', expectedPass);
  return userOk && passOk;
}

/* ---------------- login rate limiting (in-memory) ---------------- */
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export function rateLimit(key) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_ATTEMPTS - 1, retryAfter: 0 };
  }
  entry.count += 1;
  const remaining = Math.max(0, MAX_ATTEMPTS - entry.count);
  if (entry.count > MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true, remaining, retryAfter: 0 };
}

export function clearAttempts(key) {
  attempts.delete(key);
}

/** Periodic cleanup so the Map cannot grow unbounded. */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of attempts) {
    if (now > entry.resetAt) attempts.delete(key);
  }
}, WINDOW_MS).unref();

export function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const session = verifyToken(token);
  if (!session) {
    return res.status(401).json({ error: 'unauthorized', message: 'Session expired. Please sign in again.' });
  }
  req.session = session;
  next();
}
