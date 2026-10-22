import { Router } from 'express';
import { insertMessage, listMessages, deleteMessage, markAllRead, getStats, getDriver } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Public: contact form submission. */
router.post('/', async (req, res, next) => {
  try {
    const { name, email, subject, message } = req.body || {};

    const clean = (v) => (typeof v === 'string' ? v.trim().slice(0, 5000) : '');

    const cleanName = clean(name);
    const cleanEmail = clean(email);
    const cleanSubject = clean(subject);
    const cleanMessage = clean(message);

    if (!cleanName || !cleanEmail || !cleanMessage) {
      return res.status(400).json({ error: 'bad_request', message: 'Name, email and message are required.' });
    }
    if (!EMAIL_RE.test(cleanEmail)) {
      return res.status(400).json({ error: 'bad_request', message: 'That email address does not look valid.' });
    }

    const saved = await insertMessage({
      name: cleanName,
      email: cleanEmail,
      subject: cleanSubject,
      body: cleanMessage
    });

    res.status(201).json({ ok: true, id: saved.id });
  } catch (err) {
    next(err);
  }
});

/** Private: everything below requires a valid session token. */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const messages = await listMessages({ limit: req.query.limit || 100 });
    const stats = await getStats();
    res.json({ messages, stats, driver: getDriver() });
  } catch (err) {
    next(err);
  }
});

router.get('/stats', requireAuth, async (_req, res, next) => {
  try {
    res.json(await getStats());
  } catch (err) {
    next(err);
  }
});

router.post('/read-all', requireAuth, async (_req, res, next) => {
  try {
    const updated = await markAllRead();
    res.json({ ok: true, updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const removed = await deleteMessage(req.params.id);
    if (!removed) {
      return res.status(404).json({ error: 'not_found', message: 'Message not found.' });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
