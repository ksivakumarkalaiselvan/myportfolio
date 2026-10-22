import { Router } from 'express';
import { insertNotification, listNotifications, deleteNotification, toggleNotification } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

/** Public: the site's notification bell reads these (only active ones). */
router.get('/', async (req, res, next) => {
  try {
    const notifications = await listNotifications({ activeOnly: true, limit: 5 });
    res.json({ notifications });
  } catch (err) {
    next(err);
  }
});

/** Private: full list (including inactive) for the admin portal. */
router.get('/all', requireAuth, async (_req, res, next) => {
  try {
    const notifications = await listNotifications({ activeOnly: false, limit: 50 });
    res.json({ notifications });
  } catch (err) {
    next(err);
  }
});

/** Private: publish a new notification. */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { title, body, type } = req.body || {};
    const cleanTitle = typeof title === 'string' ? title.trim().slice(0, 200) : '';
    const cleanBody = typeof body === 'string' ? body.trim().slice(0, 1000) : '';

    if (!cleanTitle) {
      return res.status(400).json({ error: 'bad_request', message: 'A title is required.' });
    }

    const saved = await insertNotification({ title: cleanTitle, body: cleanBody, type });
    res.status(201).json({ ok: true, notification: saved });
  } catch (err) {
    next(err);
  }
});

/** Private: activate / deactivate an announcement without deleting it. */
router.patch('/:id/active', requireAuth, async (req, res, next) => {
  try {
    const active = req.body && req.body.active;
    const result = await toggleNotification(req.params.id, active);
    if (result === null) {
      return res.status(404).json({ error: 'not_found', message: 'Notification not found.' });
    }
    res.json({ ok: true, active: result });
  } catch (err) {
    next(err);
  }
});

/** Private: remove an announcement. */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const removed = await deleteNotification(req.params.id);
    if (!removed) {
      return res.status(404).json({ error: 'not_found', message: 'Notification not found.' });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
