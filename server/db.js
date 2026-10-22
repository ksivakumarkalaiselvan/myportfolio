/**
 * Storage layer.
 *
 * Three drivers, picked automatically by which environment variables are set:
 *   1. DATABASE_URL  -> PostgreSQL (e.g. a free Supabase project)  [RECOMMENDED]
 *   2. MONGODB_URI   -> MongoDB Atlas
 *   3. (nothing)     -> SQLite via the built-in `node:sqlite` module
 *
 * All expose the same async repository API so routes never branch on driver.
 */
import path from 'node:path';
import fs from 'node:fs';

const SQLITE_FILE = process.env.DB_PATH || path.join(process.cwd(), 'data', 'portfolio.db');
const MONGO_URI = process.env.MONGODB_URI || '';
const PG_URI = process.env.DATABASE_URL || ''; // Supabase PostgreSQL

let driver = null;
let sqlite = null;
let mongoCollection = null;
let pgPool = null;

export const getDriver = () => driver;

export async function initDb() {
  if (PG_URI) {
    const { Pool } = await import('pg');
    pgPool = new Pool({
      connectionString: PG_URI,
      // Supabase/managed Postgres require TLS; relax the CA check on free tiers.
      ssl: /sslmode|supabase|postgres:\/\//i.test(PG_URI) ? { rejectUnauthorized: false } : undefined,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000
    });
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name       TEXT        NOT NULL,
        email      TEXT        NOT NULL,
        subject    TEXT        NOT NULL DEFAULT '',
        body       TEXT        NOT NULL,
        read       BOOLEAN     NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await pgPool.query('CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages (created_at DESC)');
    driver = 'postgres';
    const host = new URL(PG_URI).host;
    console.log('[db] PostgreSQL driver active ->', host);
    return;
  }

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
  const row = { name, email, subject: subject || '', body, read: false };

  if (driver === 'postgres') {
    const res = await pgPool.query(
      `INSERT INTO messages (name, email, subject, body)
       VALUES ($1, $2, $3, $4)
       RETURNING id::text AS id, created_at`,
      [name, email, subject || '', body]
    );
    const saved = res.rows[0];
    return { id: saved.id, ...row, createdAt: toIso(saved.created_at) };
  }

  if (driver === 'mongo') {
    const doc = { ...row, createdAt: new Date() };
    const res = await mongoCollection.insertOne(doc);
    return { id: String(res.insertedId), ...row, createdAt: doc.createdAt.toISOString() };
  }

  const info = sqlite
    .prepare('INSERT INTO messages (name, email, subject, body) VALUES (?, ?, ?, ?)')
    .run(name, email, subject || '', body);
  return { id: String(info.lastInsertRowid), ...row };
}

export async function listMessages({ limit = 100 } = {}) {
  const max = Math.min(Number(limit) || 100, 500);

  if (driver === 'postgres') {
    const res = await pgPool.query(
      'SELECT id::text AS id, name, email, subject, body, read, created_at FROM messages ORDER BY id DESC LIMIT $1',
      [max]
    );
    return res.rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      subject: r.subject || '',
      body: r.body,
      read: !!r.read,
      createdAt: toIso(r.created_at)
    }));
  }

  if (driver === 'mongo') {
    const rows = await mongoCollection
      .find({}, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .limit(max)
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
    .all(max);
  return rows.map((r) => ({
    id: String(r.id),
    name: r.name,
    email: r.email,
    subject: r.subject || '',
    body: r.body,
    read: !!r.read,
    createdAt: toIso(r.created_at)
  }));
}

export async function deleteMessage(id) {
  if (driver === 'postgres') {
    const numeric = Number(id);
    if (!Number.isSafeInteger(numeric) || numeric <= 0) return false;
    const res = await pgPool.query('DELETE FROM messages WHERE id = $1', [numeric]);
    return res.rowCount > 0;
  }
  if (driver === 'mongo') {
    const { ObjectId } = await import('mongodb');
    let objectId;
    try { objectId = new ObjectId(String(id)); } catch { return false; }
    const res = await mongoCollection.deleteOne({ _id: objectId });
    return res.deletedCount > 0;
  }
  const info = sqlite.prepare('DELETE FROM messages WHERE id = ?').run(Number(id));
  return info.changes > 0;
}

export async function markAllRead() {
  if (driver === 'postgres') {
    const res = await pgPool.query('UPDATE messages SET read = TRUE WHERE read = FALSE');
    return res.rowCount;
  }
  if (driver === 'mongo') {
    const res = await mongoCollection.updateMany({ read: false }, { $set: { read: true } });
    return res.modifiedCount;
  }
  const info = sqlite.prepare('UPDATE messages SET read = 1 WHERE read = 0').run();
  return info.changes;
}

export async function getStats() {
  if (driver === 'postgres') {
    const res = await pgPool.query(
      'SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE NOT read)::int AS unread FROM messages'
    );
    return { total: res.rows[0].total, unread: res.rows[0].unread };
  }
  if (driver === 'mongo') {
    const total = await mongoCollection.countDocuments({});
    const unread = await mongoCollection.countDocuments({ read: false });
    return { total, unread };
  }
  const total = sqlite.prepare('SELECT COUNT(*) AS c FROM messages').get().c;
  const unread = sqlite.prepare('SELECT COUNT(*) AS c FROM messages WHERE read = 0').get().c;
  return { total, unread };
}

/** Graceful shutdown so pooled connections do not hang the process. */
export async function closeDb() {
  if (pgPool) await pgPool.end();
}
