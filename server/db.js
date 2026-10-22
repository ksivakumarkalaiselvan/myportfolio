/**
 * Storage layer.
 *
 * Two drivers, picked automatically:
 *   - SQLite (default) via the built-in `node:sqlite` module — zero native
 *     dependencies, so a Render build can never fail on a compile step.
 *   - MongoDB (optional) when MONGODB_URI is set — useful for a free-tier
 *     Render deploy, where the filesystem is ephemeral.
 *
 * Both expose the same async repository API so routes never branch on driver.
 */
import path from 'node:path';
import fs from 'node:fs';

const SQLITE_FILE = process.env.DB_PATH || path.join(process.cwd(), 'data', 'portfolio.db');
const MONGO_URI = process.env.MONGODB_URI || '';

let driver = null;
let sqlite = null;
let mongoCollection = null;

export const getDriver = () => driver;

export async function initDb() {
  if (MONGO_URI) {
    const { MongoClient } = await import('mongodb');
    const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 8000 });
    await client.connect();
    const db = client.db(process.env.MONGODB_DB || 'portfolio');
    mongoCollection = db.collection('messages');
    await mongoCollection.createIndex({ createdAt: -1 });
    await mongoCollection.createIndex({ read: 1 });
    driver = 'mongo';
    console.log('[db] MongoDB driver active ->', mongoCollection.namespace);
    return;
  }

  fs.mkdirSync(path.dirname(SQLITE_FILE), { recursive: true });
  const { DatabaseSync } = await import('node:sqlite');
  sqlite = new DatabaseSync(SQLITE_FILE);
  sqlite.exec('PRAGMA journal_mode = WAL;');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      email      TEXT    NOT NULL,
      subject    TEXT,
      body       TEXT    NOT NULL,
      read       INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);
  driver = 'sqlite';
  console.log('[db] SQLite driver active ->', SQLITE_FILE);
}

/** Normalise any stored timestamp shape into a strict ISO-8601 string. */
function toIso(value) {
  if (!value) return new Date().toISOString();
  const raw = String(value);
  const candidate = raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z';
  const date = new Date(candidate);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export async function insertMessage({ name, email, subject, body }) {
  if (driver === 'mongo') {
    const doc = {
      name,
      email,
      subject: subject || '',
      body,
      read: false,
      createdAt: new Date(),
      ip: ''
    };
    const res = await mongoCollection.insertOne(doc);
    return { id: String(res.insertedId), ...doc };
  }
  const stmt = sqlite.prepare(
    'INSERT INTO messages (name, email, subject, body) VALUES (?, ?, ?, ?)'
  );
  const info = stmt.run(name, email, subject || '', body);
  return { id: String(info.lastInsertRowid), name, email, subject: subject || '', body, read: false };
}

export async function listMessages({ limit = 100 } = {}) {
  if (driver === 'mongo') {
    const rows = await mongoCollection
      .find({}, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
    return rows.map((r) => ({
      id: String(r._id),
      name: r.name,
      email: r.email,
      subject: r.subject || '',
      body: r.body,
      read: !!r.read,
      createdAt: new Date(r.createdAt).toISOString()
    }));
  }
  const rows = sqlite
    .prepare('SELECT * FROM messages ORDER BY id DESC LIMIT ?')
    .all(Math.min(Number(limit) || 100, 500));
  return rows.map((r) => ({
    id: String(r.id),
    name: r.name,
    email: r.email,
    subject: r.subject || '',
    body: r.body,
    read: !!r.read,
    createdAt: toIso(r.createdAt)
  }));
}

export async function deleteMessage(id) {
  if (driver === 'mongo') {
    const res = await mongoCollection.deleteOne({ _id: new (await import('mongodb')).ObjectId(id) });
    return res.deletedCount > 0;
  }
  const info = sqlite.prepare('DELETE FROM messages WHERE id = ?').run(Number(id));
  return info.changes > 0;
}

export async function markAllRead() {
  if (driver === 'mongo') {
    const res = await mongoCollection.updateMany({ read: false }, { $set: { read: true } });
    return res.modifiedCount;
  }
  const info = sqlite.prepare('UPDATE messages SET read = 1 WHERE read = 0').run();
  return info.changes;
}

export async function getStats() {
  if (driver === 'mongo') {
    const total = await mongoCollection.countDocuments({});
    const unread = await mongoCollection.countDocuments({ read: false });
    return { total, unread };
  }
  const total = sqlite.prepare('SELECT COUNT(*) AS c FROM messages').get().c;
  const unread = sqlite.prepare('SELECT COUNT(*) AS c FROM messages WHERE read = 0').get().c;
  return { total, unread };
}
