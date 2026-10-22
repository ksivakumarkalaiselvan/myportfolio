import { Router } from 'express';
import { checkCredentials, createToken, rateLimit, clearAttempts } from '../auth.js';

const router = Router();

router.post('/login', (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const limit = rateLimit(ip);

  if (!limit.allowed) {
    return res.status(429).json({
      error: 'rate_limited',
      message: `Too many attempts. Try again in ${Math.ceil(limit.retryAfter / 60)} minute(s).`
    });
  }

  const { username, password } = req.body || {};

  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return res.status(400).json({ error: 'bad_request', message: 'Username and password are required.' });
  }

  if (!checkCredentials(username, password)) {
    return res.status(401).json({
      error: 'invalid_credentials',
      message: 'Incorrect username or password.'
    });
  }

  clearAttempts(ip);
  res.json({ token: createToken(username), expiresInMs: Number(process.env.SESSION_TTL_MS || 8 * 3600 * 1000) });
});

router.post('/logout', (_req, res) => {
  // Tokens are stateless and self-expiring; the client discards it.
  res.json({ ok: true });
});

export default router;
