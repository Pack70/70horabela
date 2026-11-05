const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');
const HB = require('./logic.js');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const TURSO_URL = (process.env.TURSO_URL || process.env.TURSO_DATABASE_URL || '').replace(/^libsql:\/\//, 'https://').replace(/\/+$/, '');
const TURSO_TOKEN = process.env.TURSO_TOKEN || process.env.TURSO_AUTH_TOKEN || '';
const MODE = TURSO_URL ? 'turso' : 'local';

/* ---------- Adaptador local (SQLite embutido no Node) ---------- */
let local = null;
if (MODE === 'local') {
  const { DatabaseSync } = require('node:sqlite');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  local = new DatabaseSync(process.env.DB_FILE || path.join(DATA_DIR, 'horabela.db'));
  local.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
}

/* ---------- Adaptador Turso (HTTP, protocolo Hrana v2 /v2/pipeline) ---------- */
const encArg = (v) => {
  if (v === null || v === undefined) return { type: 'null' };
  if (typeof v === 'boolean') return { type: 'integer', value: v ? '1' : '0' };
  if (typeof v === 'number') return Number.isInteger(v) ? { type: 'integer', value: String(v) } : { type: 'float', value: v };
  if (Buffer.isBuffer(v)) return { type: 'blob', base64: v.toString('base64') };
  return { type: 'text', value: String(v) };
};
const decVal = (c) => {
  if (!c || c.type === 'null') return null;
  if (c.type === 'integer') return Number(c.value);
  if (c.type === 'float') return Number(c.value);
  if (c.type === 'blob') return Buffer.from(c.base64, 'base64');
  return c.value;
};
async function pipeline(base, baton, requests) {
  let res;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await fetch(base + '/v2/pipeline', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TURSO_TOKEN }, body: JSON.stringify({ baton: baton || null, requests }) });
      if (res.status >= 500 && !baton && attempt < 2) { await new Promise((r) => setTimeout(r, 300 * (attempt + 1))); continue; }
      break;
    } catch (e) { if (baton || attempt === 2) throw e; await new Promise((r) => setTimeout(r, 300 * (attempt + 1))); }
  }
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch (_) { throw new Error('Turso HTTP ' + res.status + ': ' + text.slice(0, 200)); }
  if (!res.ok) throw new Error('Turso HTTP ' + res.status + ': ' + (data.error || text).toString().slice(0, 200));
  for (const r of data.results) if (r.type === 'error') throw new Error('SQL: ' + (r.error && r.error.message));
  return data;
}
const rowsOf = (result) => result.rows.map((row) => { const o = {}; result.cols.forEach((c, i) => { o[c.name] = decVal(row[i]); }); return o; });

// uma "conexão" mantém o baton durante uma transação
class TursoConn {
  constructor() { this.baton = null; this.base = TURSO_URL; }
  async exec(sql, args) {
    const data = await pipeline(this.base, this.baton, [{ type: 'execute', stmt: { sql, args: (args || []).map(encArg) } }]);
    if (data.baton !== undefined) this.baton = data.baton;
    if (data.base_url) this.base = String(data.base_url).replace(/\/+$/, '');
    return data.results[0].response.result;
  }
  async close() { if (this.baton) { try { await pipeline(this.base, this.baton, [{ type: 'close' }]); } catch (_) { /* ignore */ } this.baton = null; } }
}

/* ---------- API única: all / get / run / tx ---------- */
const als = new AsyncLocalStorage();
let txGate = null; // evita que consultas avulsas entrem numa transação aberta (modo local)
const waitGate = async () => { while (txGate) await txGate; };

async function exec(sql, args) {
  const conn = als.getStore();
  if (conn && conn.kind === 'turso') return conn.c.exec(sql, args);
  if (MODE === 'turso') { const d = await pipeline(TURSO_URL, null, [{ type: 'execute', stmt: { sql, args: (args || []).map(encArg) } }, { type: 'close' }]); return d.results[0].response.result; }
  if (!conn) await waitGate();
  const st = local.prepare(sql);
  if (/^\s*(select|with|pragma)/i.test(sql)) return { rows: st.all(...(args || [])) };
  const r = st.run(...(args || []));
  return { changes: Number(r.changes) };
}
const all = async (sql, ...p) => { const r = await exec(sql, p); return MODE === 'turso' ? rowsOf(r) : r.rows; };
const get = async (sql, ...p) => (await all(sql, ...p))[0];
const run = async (sql, ...p) => { const r = await exec(sql, p); return { changes: MODE === 'turso' ? r.affected_row_count : r.changes }; };

let txQueue = Promise.resolve();
const tx = (fn) => {
  const result = txQueue.then(async () => {
    let release; txGate = new Promise((r) => { release = r; });
    try {
      if (MODE === 'turso') {
        const c = new TursoConn();
        try {
          await c.exec('BEGIN IMMEDIATE');
          const out = await als.run({ kind: 'turso', c }, fn);
          await c.exec('COMMIT');
          return out;
        } catch (e) { try { await c.exec('ROLLBACK'); } catch (_) { /* ignore */ } throw e; }
        finally { await c.close(); }
      }
      local.exec('BEGIN IMMEDIATE');
      try { const out = await als.run({ kind: 'local' }, fn); local.exec('COMMIT'); return out; }
      catch (e) { try { local.exec('ROLLBACK'); } catch (_) { /* ignore */ } throw e; }
    } finally { txGate = null; release(); }
  });
  txQueue = result.catch(() => {});
  return result;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'pro' CHECK (role IN ('pro','admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  business TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  specialties TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  whatsapp TEXT NOT NULL DEFAULT '',
  instagram TEXT NOT NULL DEFAULT '',
  avatar TEXT NOT NULL DEFAULT '',
  cover TEXT NOT NULL DEFAULT '',
  policies TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  hours TEXT NOT NULL,
  min_notice_hours INTEGER NOT NULL DEFAULT 2,
  max_advance_days INTEGER NOT NULL DEFAULT 60,
  slot_step INTEGER NOT NULL DEFAULT 30,
  hold_minutes INTEGER NOT NULL DEFAULT 120,
  onboarded INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  duration INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  photo TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_services_user ON services(user_id);
CREATE TABLE IF NOT EXISTS gallery (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_gallery_user ON gallery(user_id);
CREATE TABLE IF NOT EXISTS blocks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  all_day INTEGER NOT NULL DEFAULT 1,
  start_time TEXT NOT NULL DEFAULT '',
  end_time TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_blocks_user ON blocks(user_id);
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, phone)
);
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
  service_id TEXT,
  service_name TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  duration INTEGER NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','confirmed','cancelled','rescheduled','completed')),
  hold_expires_at INTEGER,
  token TEXT NOT NULL UNIQUE,
  client_name TEXT NOT NULL,
  client_phone TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'link',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bookings_user_date ON bookings(user_id, date);
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  provider TEXT NOT NULL DEFAULT 'manual',
  provider_ref TEXT NOT NULL DEFAULT '',
  started_at INTEGER NOT NULL,
  renews_at INTEGER
);
CREATE TABLE IF NOT EXISTS error_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  route TEXT,
  message TEXT,
  stack TEXT
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS images (
  path TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  mime TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`;

async function initSchema() {
  if (MODE === 'turso') {
    await pipeline(TURSO_URL, null, [{ type: 'sequence', sql: SCHEMA }, { type: 'close' }]);
  } else local.exec(SCHEMA);
}

/* ---------- Senhas ---------- */
const hashPassword = (pw) => {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 64);
  return 's1$' + salt.toString('hex') + '$' + h.toString('hex');
};
const checkPassword = (pw, stored) => {
  const [v, s, h] = String(stored).split('$');
  if (v !== 's1') return false;
  const calc = crypto.scryptSync(pw, Buffer.from(s, 'hex'), 64);
  const real = Buffer.from(h, 'hex');
  return calc.length === real.length && crypto.timingSafeEqual(calc, real);
};
const DUMMY_HASH = hashPassword('dummy-password-for-timing');

/* ---------- Seeds ---------- */
const seedPlans = async () => {
  if ((await get('SELECT COUNT(*) n FROM plans')).n) return;
  let i = 0;
  for (const p of HB.DEFAULT_PLANS) {
    const { id, name, priceCents, active, ...rest } = p;
    await run('INSERT INTO plans (id,name,price_cents,active,position,data) VALUES (?,?,?,?,?,?)', id, name, priceCents, active ? 1 : 0, i++, JSON.stringify(rest));
  }
};
const DEFAULT_SETTINGS = { siteName: 'Hora Bela', registrationOpen: '1', supportWhatsapp: '', baseUrl: '' };
const getSettings = async () => {
  const s = { ...DEFAULT_SETTINGS };
  for (const r of await all('SELECT key,value FROM settings')) s[r.key] = r.value;
  return s;
};
const setSetting = (k, v) => run('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', k, String(v));

const seedAdmin = async () => {
  if (await get("SELECT id FROM users WHERE role='admin'")) return null;
  const email = (process.env.ADMIN_EMAIL || 'admin@horabela.local').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  await run("INSERT INTO users (id,email,pass_hash,role,created_at) VALUES (?,?,?,'admin',?)", HB.uid('usr'), email, hashPassword(password), Date.now());
  return { email, password, generated: !process.env.ADMIN_PASSWORD };
};

const logError = async (route, err) => {
  try { await run('INSERT INTO error_logs (at,route,message,stack) VALUES (?,?,?,?)', Date.now(), route, String(err && err.message || err).slice(0, 500), String(err && err.stack || '').slice(0, 3000)); } catch (_) { /* ignore */ }
};

const init = async () => { await initSchema(); await seedPlans(); };

module.exports = { MODE, init, all, get, run, tx, hashPassword, checkPassword, DUMMY_HASH, getSettings, setSetting, seedAdmin, logError, DATA_DIR };
