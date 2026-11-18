"use strict";
/* SQLite storage (better-sqlite3). One file in DATA_DIR, kept on a Railway volume. */
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const Database = require("better-sqlite3");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, "maree.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  lang TEXT DEFAULT 'en',
  key TEXT UNIQUE NOT NULL,
  options TEXT DEFAULT '[]',
  active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS threads (
  id INTEGER PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  option_id TEXT NOT NULL,
  cat_id TEXT NOT NULL,
  vendor_id INTEGER REFERENCES vendors(id),
  guest_token TEXT NOT NULL,
  guest_name TEXT NOT NULL,
  guest_email TEXT DEFAULT '',
  guest_phone TEXT DEFAULT '',
  guest_lang TEXT DEFAULT 'en',
  fields TEXT DEFAULT '{}',
  status TEXT DEFAULT 'new',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  first_reply_at TEXT,
  booked_amount REAL,
  booked_at TEXT,
  guest_read INTEGER DEFAULT 0,
  vendor_read INTEGER DEFAULT 0,
  admin_read INTEGER DEFAULT 0,
  guest_notified_at TEXT,
  vendor_notified_at TEXT
);
CREATE INDEX IF NOT EXISTS threads_guest ON threads(guest_token);
CREATE INDEX IF NOT EXISTS threads_vendor ON threads(vendor_id);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  thread_id INTEGER NOT NULL REFERENCES threads(id),
  sender TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'text',
  body TEXT DEFAULT '',
  lang TEXT DEFAULT 'en',
  tr TEXT DEFAULT '{}',
  data TEXT DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_thread ON messages(thread_id, id);
CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
`);
/* columns added for email tickets */
for (const [col, type] of [["notes", "TEXT DEFAULT ''"], ["contact_pref", "TEXT DEFAULT ''"], ["outcome_token", "TEXT"], ["contacted_at", "TEXT"], ["outcome_at", "TEXT"], ["email_status", "TEXT DEFAULT ''"], ["source", "TEXT DEFAULT 'maree'"]]) {
  const has = db.prepare("SELECT 1 FROM pragma_table_info('threads') WHERE name=?").get(col);
  if (!has) db.exec(`ALTER TABLE threads ADD COLUMN ${col} ${type}`);
}

const now = () => new Date().toISOString();
const token = (n = 24) => crypto.randomBytes(n).toString("base64url");
const CODE_CHARS = "ACDEFGHJKMNPQRTUVWXY3469";
const code = () => Array.from(crypto.randomBytes(6), (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
const J = (s, d) => { try { return JSON.parse(s); } catch { return d; } };

/* settings */
const DEFAULTS = { commission: 20, hotelShare: 30, maskContacts: true };
function getSettings() {
  const row = db.prepare("SELECT v FROM kv WHERE k='settings'").get();
  return { ...DEFAULTS, ...(row ? J(row.v, {}) : {}) };
}
function setSettings(s) {
  const next = { ...getSettings(), ...s };
  db.prepare("INSERT INTO kv(k,v) VALUES('settings',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").run(JSON.stringify(next));
  return next;
}
const kvGet = (k) => { const r = db.prepare("SELECT v FROM kv WHERE k=?").get(k); return r ? r.v : null; };
const kvSet = (k, v) => db.prepare("INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").run(k, v);

/* vendors */
const vendorRow = (v) => v && { ...v, options: J(v.options, []), active: !!v.active };
const vendors = {
  all: () => db.prepare("SELECT * FROM vendors ORDER BY name").all().map(vendorRow),
  byId: (id) => vendorRow(db.prepare("SELECT * FROM vendors WHERE id=?").get(id)),
  byKey: (k) => vendorRow(db.prepare("SELECT * FROM vendors WHERE key=? AND active=1").get(k)),
  forOption: (optionId) => vendors.all().find((v) => v.active && v.options.includes(optionId)) || null,
  create: ({ name, email = "", phone = "", lang = "en", options = [] }) => {
    const info = db.prepare("INSERT INTO vendors(name,email,phone,lang,key,options,created_at) VALUES(?,?,?,?,?,?,?)")
      .run(name, email, phone, lang, token(), JSON.stringify(options), now());
    return vendors.byId(info.lastInsertRowid);
  },
  update: (id, patch) => {
    const v = vendors.byId(id); if (!v) return null;
    const n = { ...v, ...patch };
    db.prepare("UPDATE vendors SET name=?,email=?,phone=?,lang=?,options=?,active=? WHERE id=?")
      .run(n.name, n.email, n.phone, n.lang, JSON.stringify(n.options), n.active ? 1 : 0, id);
    return vendors.byId(id);
  },
  rotateKey: (id) => { db.prepare("UPDATE vendors SET key=? WHERE id=?").run(token(), id); return vendors.byId(id); }
};

/* threads */
const threadRow = (t) => t && { ...t, fields: J(t.fields, {}) };
const threads = {
  byId: (id) => threadRow(db.prepare("SELECT * FROM threads WHERE id=?").get(id)),
  byCode: (c) => threadRow(db.prepare("SELECT * FROM threads WHERE code=?").get(c)),
  forGuest: (tok) => db.prepare("SELECT * FROM threads WHERE guest_token=? ORDER BY updated_at DESC").all(tok).map(threadRow),
  forVendor: (vid) => db.prepare("SELECT * FROM threads WHERE vendor_id=? ORDER BY updated_at DESC").all(vid).map(threadRow),
  all: () => db.prepare("SELECT * FROM threads ORDER BY updated_at DESC").all().map(threadRow),
  create: (t) => {
    let c; do { c = code(); } while (db.prepare("SELECT 1 FROM threads WHERE code=?").get(c));
    const ts = now();
    const info = db.prepare(`INSERT INTO threads(code,option_id,cat_id,vendor_id,guest_token,guest_name,guest_email,guest_phone,guest_lang,fields,status,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(c, t.option_id, t.cat_id, t.vendor_id, t.guest_token, t.guest_name, t.guest_email, t.guest_phone, t.guest_lang, JSON.stringify(t.fields || {}), "new", ts, ts);
    return threads.byId(info.lastInsertRowid);
  },
  set: (id, patch) => {
    const keys = Object.keys(patch);
    if (!keys.length) return threads.byId(id);
    db.prepare(`UPDATE threads SET ${keys.map((k) => k + "=?").join(",")} WHERE id=?`).run(...keys.map((k) => patch[k]), id);
    return threads.byId(id);
  },
  lastMessage: (id) => messageRow(db.prepare("SELECT * FROM messages WHERE thread_id=? ORDER BY id DESC LIMIT 1").get(id)),
  unread: (id, after, notSender) => db.prepare("SELECT COUNT(*) n FROM messages WHERE thread_id=? AND id>? AND sender NOT IN (?, 'system')").get(id, after, notSender).n
};

/* messages */
const messageRow = (m) => m && { ...m, tr: J(m.tr, {}), data: J(m.data, {}) };
const messages = {
  forThread: (tid) => db.prepare("SELECT * FROM messages WHERE thread_id=? ORDER BY id").all(tid).map(messageRow),
  byId: (id) => messageRow(db.prepare("SELECT * FROM messages WHERE id=?").get(id)),
  add: (tid, { sender, kind = "text", body = "", lang = "en", data = {} }) => {
    const ts = now();
    const info = db.prepare("INSERT INTO messages(thread_id,sender,kind,body,lang,data,created_at) VALUES(?,?,?,?,?,?,?)")
      .run(tid, sender, kind, body, lang, JSON.stringify(data), ts);
    db.prepare("UPDATE threads SET updated_at=? WHERE id=?").run(ts, tid);
    return messages.byId(info.lastInsertRowid);
  },
  setTr: (id, tr) => { db.prepare("UPDATE messages SET tr=? WHERE id=?").run(JSON.stringify(tr), id); return messages.byId(id); },
  setData: (id, data) => { db.prepare("UPDATE messages SET data=? WHERE id=?").run(JSON.stringify(data), id); return messages.byId(id); }
};

module.exports = { db, now, token, getSettings, setSettings, kvGet, kvSet, vendors, threads, messages };
