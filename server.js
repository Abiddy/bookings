"use strict";
/*
 * Marée server
 * - Guest app (/), vendor portal (/vendor), admin desk (/admin) from /public
 * - Inquiries open a conversation between a guest and a vendor
 * - Live messaging over WebSockets (/ws); REST for everything that changes data
 * - SQLite storage on a Railway volume (DATA_DIR)
 * - Optional: Claude translation (ANTHROPIC_API_KEY), email via Resend (RESEND_API_KEY + EMAIL_FROM)
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");
const { CATS, OPTIONS, FIELDS } = require("./public/catalog.js");
const S = require("./lib/store");
const svc = require("./lib/services");

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.PARTNER_PASSWORD || "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";
const BASE_URL = (process.env.PUBLIC_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? "https://" + process.env.RAILWAY_PUBLIC_DOMAIN : "")).replace(/\/$/, "");

const optById = Object.fromEntries(OPTIONS.map((o) => [o.id, o]));
const catById = Object.fromEntries(CATS.map((c) => [c.id, c]));
const LANG_CODES = Object.keys(svc.LANGS);

/* ---------- helpers ---------- */
const fail = (status, message) => Object.assign(new Error(message), { status });
const str = (v, max) => String(v ?? "").trim().slice(0, max);
function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => { size += c.length; if (size > 64 * 1024) { reject(fail(413, "That's too long.")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); } catch { reject(fail(400, "Invalid request.")); } });
    req.on("error", reject);
  });
}
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const hits = new Map();
function limited(key, max, windowMs) {
  const t = Date.now(), arr = (hits.get(key) || []).filter((x) => t - x < windowMs);
  arr.push(t); hits.set(key, arr);
  return arr.length > max;
}
setInterval(() => hits.clear(), 60 * 60 * 1000).unref();
const ipOf = (req) => (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();

/* ---------- who is asking ---------- */
function actorFrom({ admin, vendorKey, guestToken }) {
  if (admin && ADMIN_PASSWORD && safeEq(admin, ADMIN_PASSWORD)) return { role: "admin", id: "admin" };
  if (vendorKey) { const v = S.vendors.byKey(String(vendorKey)); if (v) return { role: "vendor", id: "v" + v.id, vendor: v }; }
  if (guestToken && /^[A-Za-z0-9_-]{20,64}$/.test(guestToken)) return { role: "guest", id: "g" + guestToken, token: guestToken };
  return null;
}
function actorOf(req) {
  const h = req.headers.authorization || "";
  return actorFrom({ admin: h.startsWith("Bearer ") ? h.slice(7) : "", vendorKey: req.headers["x-vendor-key"], guestToken: req.headers["x-guest-token"] });
}
function canSee(actor, t) {
  if (!actor || !t) return false;
  if (actor.role === "admin") return true;
  if (actor.role === "vendor") return t.vendor_id === actor.vendor.id;
  return t.guest_token === actor.token;
}
function need(actor, ...roles) { if (!actor || !roles.includes(actor.role)) throw fail(401, "Please sign in again."); }

/* ---------- privacy: hide contact details until a booking is confirmed ---------- */
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?:\+?\d[\d\s().-]{6,}\d)/g;
const HANDLE_RE = /(?:instagram|insta|whatsapp|wa\.me|telegram|ig)\s*[:@]?\s*@?[\w.]{3,}/gi;
const mask = (s) => String(s).replace(EMAIL_RE, "•••").replace(PHONE_RE, "•••").replace(HANDLE_RE, "•••");
const isOpen = (t) => t.status === "booked";

/* ---------- views: what each person sees ---------- */
const vendorLang = (t) => (t.vendor_id ? (S.vendors.byId(t.vendor_id) || {}).lang : "en") || "en";
function messageView(m, t, role) {
  const own = m.sender === role; // people always see their own words
  const hide = role !== "admin" && !own && S.getSettings().maskContacts && !isOpen(t);
  const body = hide && m.kind !== "system" ? mask(m.body) : m.body;
  const tr = {};
  for (const [k, v] of Object.entries(m.tr || {})) tr[k] = hide ? mask(v) : v;
  return { id: m.id, threadId: m.thread_id, sender: m.sender, kind: m.kind, body, lang: m.lang, tr, data: m.data, createdAt: m.created_at, masked: hide && body !== m.body };
}
function threadView(t, role) {
  const o = optById[t.option_id] || {}, v = t.vendor_id ? S.vendors.byId(t.vendor_id) : null;
  const last = S.threads.lastMessage(t.id);
  const readKey = role === "admin" ? "admin_read" : role === "vendor" ? "vendor_read" : "guest_read";
  const out = {
    id: t.id, code: t.code, optionId: t.option_id, catId: t.cat_id, optionTitle: o.title || t.option_id,
    photo: o.photos && o.photos[0] ? o.photos[0].src : "",
    status: t.status, createdAt: t.created_at, updatedAt: t.updated_at, firstReplyAt: t.first_reply_at,
    guestName: role === "vendor" && !isOpen(t) ? t.guest_name.split(/\s+/)[0] : t.guest_name,
    guestLang: t.guest_lang, fields: t.fields,
    vendor: v ? { id: v.id, name: v.name, lang: v.lang } : null,
    bookedAmount: t.booked_amount, bookedAt: t.booked_at,
    reads: { guest: t.guest_read, vendor: role === "admin" ? t.vendor_read : Math.max(t.vendor_read, t.admin_read), admin: t.admin_read },
    unread: S.threads.unread(t.id, t[readKey], role === "admin" ? "admin" : role),
    last: last ? messageView(last, t, role) : null
  };
  if (role === "admin" || (role === "vendor" && isOpen(t))) out.guestContact = { email: t.guest_email, phone: t.guest_phone };
  if ((role === "guest" && isOpen(t)) || role === "admin") out.vendorContact = v ? { email: v.email, phone: v.phone } : null;
  return out;
}

/* ---------- live connections ---------- */
const sockets = new Set();
function pushThread(t, extra) {
  for (const ws of sockets) {
    if (!ws.actor || !canSee(ws.actor, t)) continue;
    const role = ws.actor.role;
    const payload = { type: "thread", thread: threadView(t, role) };
    if (extra && extra.message) payload.message = messageView(extra.message, t, role);
    try { ws.send(JSON.stringify(payload)); } catch {}
  }
}
function isLive(t, role) {
  for (const ws of sockets) if (ws.actor && ws.actor.role === role && canSee(ws.actor, t) && ws.viewing === t.id) return true;
  return false;
}

/* ---------- translation & notifications (background) ---------- */
async function translateMessage(m, t) {
  if (!svc.hasAI || !m.body || m.kind === "system") return;
  const targets = new Set([t.guest_lang, vendorLang(t), "en"]);
  targets.delete(m.lang);
  const tr = { ...m.tr };
  for (const to of targets) {
    try { const out = await svc.translateText(m.body, m.lang, to); if (out) tr[to] = out; }
    catch (e) { console.error("translate:", e.message); }
  }
  if (Object.keys(tr).length) { const upd = S.messages.setTr(m.id, tr); pushThread(S.threads.byId(t.id), { message: upd }); }
}
const MIN_GAP = 10 * 60 * 1000;
async function notify(t, m) {
  if (!svc.hasMail) return;
  const o = optById[t.option_id] || {};
  const tasks = [];
  const recent = (iso) => iso && Date.now() - Date.parse(iso) < MIN_GAP;
  if (m.sender === "guest") {
    const v = t.vendor_id ? S.vendors.byId(t.vendor_id) : null;
    const to = v ? v.email : ADMIN_EMAIL;
    const link = v ? `${BASE_URL}/vendor?k=${v.key}#t-${t.id}` : `${BASE_URL}/admin#t-${t.id}`;
    if (to && !recent(t.vendor_notified_at) && !isLive(t, v ? "vendor" : "admin")) {
      const isNew = m.kind === "request";
      tasks.push(svc.sendEmail(to, isNew ? `New request: ${o.title} (${t.code})` : `New message from ${t.guest_name.split(" ")[0]} (${t.code})`,
        `${isNew ? "A guest sent a new request through Marée." : "You have a new message on Marée."}\n\n${o.title} · ref ${t.code}\n\nOpen the conversation: ${link}\n\nReply in Marée so the guest sees it right away.`)
        .then(() => S.threads.set(t.id, { vendor_notified_at: S.now() })));
    }
  } else if (t.guest_email && !recent(t.guest_notified_at) && !isLive(t, "guest")) {
    const link = `${BASE_URL}/?g=${t.guest_token}#t-${t.id}`;
    tasks.push(svc.sendEmail(t.guest_email, `Reply about your ${o.title} request (${t.code})`,
      `Hi ${t.guest_name.split(" ")[0]},\n\nYou have a new reply about your ${o.title} request.\n\nRead and reply here: ${link}\n\nMarée · Marina del Rey`)
      .then(() => S.threads.set(t.id, { guest_notified_at: S.now() })));
  }
  for (const p of tasks) p.catch((e) => console.error("email:", e.message));
}
function afterMessage(t, m) {
  const fresh = S.threads.byId(t.id);
  pushThread(fresh, { message: m });
  translateMessage(m, fresh);
  notify(fresh, m);
}

/* ---------- catalog translation (cached) ---------- */
const catalogCache = new Map();
async function catalogFor(lang) {
  if (lang === "en" || !svc.hasAI || !LANG_CODES.includes(lang)) return null;
  if (catalogCache.has(lang)) return catalogCache.get(lang);
  const src = {};
  for (const o of OPTIONS) { src[o.id + ".title"] = o.title; src[o.id + ".blurb"] = o.blurb; o.incl.forEach((x, i) => (src[o.id + ".incl." + i] = x)); }
  const hash = crypto.createHash("sha1").update(JSON.stringify(src)).digest("hex").slice(0, 10);
  const cached = S.kvGet(`catalog:${lang}:${hash}`);
  if (cached) { const v = JSON.parse(cached); catalogCache.set(lang, v); return v; }
  const p = svc.translateMap(src, lang).then((out) => {
    if (out) { S.kvSet(`catalog:${lang}:${hash}`, JSON.stringify(out)); catalogCache.set(lang, out); }
    else catalogCache.delete(lang);
    return out;
  }).catch((e) => { console.error("catalog translate:", e.message); catalogCache.delete(lang); return null; });
  catalogCache.set(lang, p);
  return p;
}

/* ---------- inquiry ---------- */
function cleanFields(cat, input) {
  const out = {};
  for (const key of cat.fields) {
    const f = FIELDS[key], v = input ? input[key] : undefined;
    if (f.type === "date") { const d = str(v, 10); if (/^\d{4}-\d{2}-\d{2}$/.test(d)) out[key] = d; }
    else if (f.type === "daterange") { const a = str(v && v.from, 10), b = str(v && v.to, 10); if (/^\d{4}-\d{2}-\d{2}$/.test(a)) out[key] = { from: a, to: /^\d{4}-\d{2}-\d{2}$/.test(b) ? b : a }; }
    else if (f.type === "stepper") { const n = Math.floor(Number(v)); if (n >= f.min && n <= f.max) out[key] = n; }
    else if (f.type === "chips") { if (f.choices.includes(v)) out[key] = v; }
    if (f.required && out[key] === undefined) throw fail(400, "Please choose a date.");
  }
  return out;
}
function createInquiry(body, ip) {
  if (limited("inq:" + ip, 20, 60 * 60 * 1000)) throw fail(429, "Too many requests from this device. Please try again later.");
  const o = optById[body.optionId]; if (!o) throw fail(400, "That option isn't available.");
  const cat = catById[o.cat];
  const name = str(body.name, 80), email = str(body.email, 120).toLowerCase(), phone = str(body.phone, 30);
  if (!name) throw fail(400, "Please add your name.");
  if (!email && !phone) throw fail(400, "Please add an email or phone number.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, "That email doesn't look right.");
  const lang = LANG_CODES.includes(body.lang) ? body.lang : "en";
  let tok = str(body.guestToken, 64);
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(tok)) tok = S.token();
  const v = S.vendors.forOption(o.id);
  const t = S.threads.create({ option_id: o.id, cat_id: o.cat, vendor_id: v ? v.id : null, guest_token: tok, guest_name: name, guest_email: email, guest_phone: phone, guest_lang: lang, fields: cleanFields(cat, body.fields) });
  const m = S.messages.add(t.id, { sender: "guest", kind: "request", body: str(body.notes, 2000), lang, data: { fields: t.fields } });
  S.threads.set(t.id, { guest_read: m.id });
  afterMessage(t, m);
  if (svc.hasMail && email) {
    svc.sendEmail(email, `We sent your request: ${o.title} (${t.code})`,
      `Hi ${name.split(" ")[0]},\n\nYour request for ${o.title} is on its way. You'll get a reply in Marée, usually within a few hours.\n\nOpen your messages: ${BASE_URL}/?g=${tok}#t-${t.id}\n\nReference: ${t.code}\nMarée · Marina del Rey`)
      .catch((e) => console.error("email:", e.message));
  }
  return { guestToken: tok, thread: threadView(S.threads.byId(t.id), "guest") };
}

/* ---------- thread actions ---------- */
function senderFor(actor) { return actor.role === "admin" ? "admin" : actor.role; }
function langFor(actor, t) { return actor.role === "guest" ? t.guest_lang : actor.role === "vendor" ? actor.vendor.lang : "en"; }
function postMessage(actor, t, body) {
  if (limited("msg:" + actor.id, 40, 60 * 1000)) throw fail(429, "You're sending messages too quickly.");
  const text = str(body.body, 2000); if (!text) throw fail(400, "Write a message first.");
  if (["closed"].includes(t.status) && actor.role === "guest") throw fail(400, "This request is closed. Send a new request to start again.");
  const m = S.messages.add(t.id, { sender: senderFor(actor), body: text, lang: langFor(actor, t) });
  const patch = { [actor.role === "admin" ? "admin_read" : actor.role + "_read"]: m.id };
  if (actor.role !== "guest") { if (!t.first_reply_at) patch.first_reply_at = m.created_at; if (t.status === "new") patch.status = "replied"; }
  S.threads.set(t.id, patch);
  afterMessage(t, m);
  return messageView(m, S.threads.byId(t.id), actor.role);
}
function sendQuote(actor, t, body) {
  need(actor, "vendor", "admin");
  const price = Math.round(Number(body.price) * 100) / 100;
  if (!(price > 0 && price < 1e6)) throw fail(400, "Add a price for the quote.");
  const details = str(body.details, 1000);
  const m = S.messages.add(t.id, { sender: senderFor(actor), kind: "quote", body: details, lang: langFor(actor, t), data: { price, date: str(body.date, 40), status: "pending" } });
  const patch = { status: "quoted", [actor.role === "admin" ? "admin_read" : "vendor_read"]: m.id };
  if (!t.first_reply_at) patch.first_reply_at = m.created_at;
  S.threads.set(t.id, patch);
  afterMessage(t, m);
  return messageView(m, S.threads.byId(t.id), actor.role);
}
function respondQuote(actor, t, msgId, accept) {
  need(actor, "guest");
  const q = S.messages.byId(msgId);
  if (!q || q.thread_id !== t.id || q.kind !== "quote") throw fail(404, "Quote not found.");
  if (q.data.status !== "pending") throw fail(400, "You already answered this quote.");
  S.messages.setData(q.id, { ...q.data, status: accept ? "accepted" : "declined" });
  S.threads.set(t.id, { status: accept ? "accepted" : "replied" });
  const ev = S.messages.add(t.id, { sender: "system", kind: "system", body: accept ? "quote_accepted" : "quote_declined", data: { quoteId: q.id, price: q.data.price } });
  afterMessage(t, ev);
  pushThread(S.threads.byId(t.id), { message: S.messages.byId(q.id) });
  return threadView(S.threads.byId(t.id), "guest");
}
function setStatus(actor, t, body) {
  need(actor, "vendor", "admin");
  const status = body.status;
  if (status === "booked") {
    const amount = Math.round(Number(body.amount) * 100) / 100;
    if (!(amount > 0 && amount < 1e7)) throw fail(400, "Add the final booking amount.");
    S.threads.set(t.id, { status: "booked", booked_amount: amount, booked_at: S.now() });
    afterMessage(t, S.messages.add(t.id, { sender: "system", kind: "system", body: "booked", data: { amount } }));
  } else if (status === "closed" || status === "reopen") {
    const next = status === "closed" ? "closed" : (t.first_reply_at ? "replied" : "new");
    S.threads.set(t.id, { status: next, ...(status === "reopen" ? { booked_amount: null, booked_at: null } : {}) });
    afterMessage(t, S.messages.add(t.id, { sender: "system", kind: "system", body: status === "closed" ? "closed" : "reopened" }));
  } else throw fail(400, "Unknown status.");
  return threadView(S.threads.byId(t.id), actor.role);
}

/* ---------- admin summary ---------- */
function summary() {
  const st = S.getSettings(), all = S.threads.all();
  const booked = all.filter((t) => t.status === "booked");
  const replied = all.filter((t) => t.first_reply_at);
  const mins = replied.map((t) => (Date.parse(t.first_reply_at) - Date.parse(t.created_at)) / 60000).sort((a, b) => a - b);
  const median = mins.length ? mins[Math.floor(mins.length / 2)] : null;
  const byVendor = {};
  for (const t of booked) {
    const k = t.vendor_id || 0;
    byVendor[k] = byVendor[k] || { vendorId: t.vendor_id, name: t.vendor_id ? (S.vendors.byId(t.vendor_id) || {}).name : "Handled by Marée", bookings: 0, gross: 0 };
    byVendor[k].bookings++; byVendor[k].gross += t.booked_amount || 0;
  }
  const gross = booked.reduce((s, t) => s + (t.booked_amount || 0), 0);
  const commission = gross * st.commission / 100, hotel = commission * st.hotelShare / 100;
  return {
    settings: st,
    counts: { requests: all.length, open: all.filter((t) => !["booked", "closed"].includes(t.status)).length, waiting: all.filter((t) => t.status === "new").length, booked: booked.length, unassigned: all.filter((t) => !t.vendor_id).length },
    replyRate: all.length ? replied.length / all.length : 0, medianReplyMinutes: median,
    conversion: all.length ? booked.length / all.length : 0,
    money: { gross, commission, hotel, net: commission - hotel },
    byVendor: Object.values(byVendor).map((x) => ({ ...x, commission: x.gross * st.commission / 100 })),
    services: { translation: svc.hasAI, email: svc.hasMail }
  };
}
const vendorAdminView = (v) => ({ ...v, link: (BASE_URL || "") + "/vendor?k=" + v.key });

/* ---------- static ---------- */
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json", ".webmanifest": "application/manifest+json" };
const PAGES = { "/": "index.html", "/vendor": "vendor.html", "/admin": "admin.html" };
const CSP = "default-src 'self'; img-src 'self' data: https://images.unsplash.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'self'";
function serveStatic(req, res, pathname) {
  let rel = PAGES[pathname] ? "/" + PAGES[pathname] : decodeURIComponent(pathname);
  if (!path.extname(rel)) rel = "/index.html";
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("Not found"); return; }
    const ext = path.extname(file);
    res.writeHead(200, { "Content-Type": TYPES[ext] || "application/octet-stream", "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=120",
      "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin", "Content-Security-Policy": CSP });
    res.end(req.method === "HEAD" ? undefined : buf);
  });
}

/* ---------- routes ---------- */
async function api(req, res, url) {
  const p = url.pathname, method = req.method, actor = actorOf(req);
  let m;
  if (p === "/api/health") return send(res, 200, { ok: true });
  if (p === "/api/config") return send(res, 200, { translation: svc.hasAI, langs: svc.LANGS });
  if (p === "/api/catalog" && method === "GET") {
    const lang = str(url.searchParams.get("lang"), 5);
    return send(res, 200, { lang, strings: (await catalogFor(lang)) || null });
  }
  if (p === "/api/inquiries" && method === "POST") return send(res, 201, createInquiry(await readBody(req), ipOf(req)));

  if (p === "/api/threads" && method === "GET") {
    need(actor, "guest", "vendor", "admin");
    const list = actor.role === "admin" ? S.threads.all() : actor.role === "vendor" ? S.threads.forVendor(actor.vendor.id) : S.threads.forGuest(actor.token);
    return send(res, 200, { threads: list.map((t) => threadView(t, actor.role)), me: actor.role === "vendor" ? { name: actor.vendor.name, lang: actor.vendor.lang } : null });
  }
  if ((m = /^\/api\/threads\/(\d+)(\/.*)?$/.exec(p))) {
    const t = S.threads.byId(Number(m[1]));
    if (!canSee(actor, t)) throw fail(404, "Conversation not found.");
    const sub = m[2] || "";
    if (!sub && method === "GET") return send(res, 200, { thread: threadView(t, actor.role), messages: S.messages.forThread(t.id).map((x) => messageView(x, t, actor.role)) });
    if (sub === "/messages" && method === "POST") return send(res, 201, { message: postMessage(actor, t, await readBody(req)) });
    if (sub === "/quote" && method === "POST") return send(res, 201, { message: sendQuote(actor, t, await readBody(req)) });
    if (sub === "/status" && method === "POST") return send(res, 200, { thread: setStatus(actor, t, await readBody(req)) });
    if (sub === "/read" && method === "POST") {
      const b = await readBody(req), id = Math.floor(Number(b.upTo)) || 0;
      const col = actor.role === "admin" ? "admin_read" : actor.role + "_read";
      if (id > t[col]) { const nt = S.threads.set(t.id, { [col]: id }); pushThread(nt); }
      return send(res, 200, { ok: true });
    }
    const q = /^\/quote\/(\d+)\/(accept|decline)$/.exec(sub);
    if (q && method === "POST") return send(res, 200, { thread: respondQuote(actor, t, Number(q[1]), q[2] === "accept") });
    if (sub === "/assign" && method === "POST") {
      need(actor, "admin");
      const b = await readBody(req), vid = b.vendorId ? Number(b.vendorId) : null;
      if (vid && !S.vendors.byId(vid)) throw fail(400, "Vendor not found.");
      const nt = S.threads.set(t.id, { vendor_id: vid });
      const v = vid ? S.vendors.byId(vid) : null;
      const ev = S.messages.add(t.id, { sender: "system", kind: "system", body: "assigned", data: { vendor: v ? v.name : null } });
      afterMessage(nt, ev);
      if (v && v.email && svc.hasMail) svc.sendEmail(v.email, `New request: ${(optById[t.option_id] || {}).title} (${t.code})`, `A guest request was sent to you on Marée.\n\nOpen it: ${BASE_URL}/vendor?k=${v.key}#t-${t.id}`).catch((e) => console.error("email:", e.message));
      return send(res, 200, { thread: threadView(S.threads.byId(t.id), "admin") });
    }
    throw fail(404, "Not found.");
  }

  if (p === "/api/vendor/me") {
    need(actor, "vendor");
    if (method === "PATCH") { const b = await readBody(req); const lang = LANG_CODES.includes(b.lang) ? b.lang : actor.vendor.lang; const v = S.vendors.update(actor.vendor.id, { lang }); return send(res, 200, { me: { name: v.name, lang: v.lang } }); }
    return send(res, 200, { me: { name: actor.vendor.name, lang: actor.vendor.lang } });
  }

  if (p.startsWith("/api/admin/")) {
    if (limited("adm:" + ipOf(req), 600, 15 * 60 * 1000)) throw fail(429, "Too many attempts. Wait a few minutes.");
    if (!ADMIN_PASSWORD) throw fail(401, "Set ADMIN_PASSWORD on the server to open the admin desk.");
    need(actor, "admin");
    if (p === "/api/admin/summary") return send(res, 200, summary());
    if (p === "/api/admin/settings" && method === "PUT") {
      const b = await readBody(req), patch = {};
      if (b.commission !== undefined) { const n = Number(b.commission); if (n >= 0 && n <= 60) patch.commission = Math.round(n); }
      if (b.hotelShare !== undefined) { const n = Number(b.hotelShare); if (n >= 0 && n <= 100) patch.hotelShare = Math.round(n); }
      if (b.maskContacts !== undefined) patch.maskContacts = !!b.maskContacts;
      return send(res, 200, { settings: S.setSettings(patch) });
    }
    if (p === "/api/admin/vendors" && method === "GET") return send(res, 200, { vendors: S.vendors.all().map(vendorAdminView) });
    const cleanVendor = (b) => {
      const o = {};
      if (b.name !== undefined) { o.name = str(b.name, 80); if (!o.name) throw fail(400, "Add the company name."); }
      if (b.email !== undefined) o.email = str(b.email, 120).toLowerCase();
      if (b.phone !== undefined) o.phone = str(b.phone, 30);
      if (b.lang !== undefined) o.lang = LANG_CODES.includes(b.lang) ? b.lang : "en";
      if (b.options !== undefined) o.options = (Array.isArray(b.options) ? b.options : []).filter((x) => optById[x]);
      if (b.active !== undefined) o.active = !!b.active;
      return o;
    };
    if (p === "/api/admin/vendors" && method === "POST") { const b = cleanVendor(await readBody(req)); if (!b.name) throw fail(400, "Add the company name."); return send(res, 201, { vendor: vendorAdminView(S.vendors.create(b)) }); }
    if ((m = /^\/api\/admin\/vendors\/(\d+)(\/rotate)?$/.exec(p))) {
      const id = Number(m[1]); if (!S.vendors.byId(id)) throw fail(404, "Vendor not found.");
      if (m[2] && method === "POST") return send(res, 200, { vendor: vendorAdminView(S.vendors.rotateKey(id)) });
      if (method === "PATCH") return send(res, 200, { vendor: vendorAdminView(S.vendors.update(id, cleanVendor(await readBody(req)))) });
    }
    throw fail(404, "Not found.");
  }
  throw fail(404, "Not found.");
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); res.end(); return; }
    serveStatic(req, res, url.pathname);
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    send(res, status, { error: status === 500 ? "Something went wrong. Please try again." : e.message });
  }
});

/* ---------- WebSockets: live updates, typing, presence ---------- */
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 16 * 1024 });
wss.on("connection", (ws, req) => {
  ws.isAlive = true; ws.actor = null; ws.viewing = null;
  sockets.add(ws);
  ws.on("pong", () => { ws.isAlive = true; });
  const authTimer = setTimeout(() => { if (!ws.actor) ws.close(4001, "auth timeout"); }, 10000);
  ws.on("message", (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === "auth") {
      ws.actor = actorFrom(msg);
      clearTimeout(authTimer);
      if (!ws.actor) { ws.send(JSON.stringify({ type: "error", error: "unauthorized" })); ws.close(4003, "unauthorized"); return; }
      ws.send(JSON.stringify({ type: "ready", role: ws.actor.role }));
      return;
    }
    if (!ws.actor) return;
    if (msg.type === "view") { ws.viewing = Number(msg.threadId) || null; return; }
    if (msg.type === "typing") {
      const t = S.threads.byId(Number(msg.threadId));
      if (!canSee(ws.actor, t) || limited("typ:" + ws.actor.id, 30, 60000)) return;
      const out = JSON.stringify({ type: "typing", threadId: t.id, from: ws.actor.role });
      for (const o of sockets) if (o !== ws && o.actor && o.actor.id !== ws.actor.id && canSee(o.actor, t)) { try { o.send(out); } catch {} }
    }
  });
  ws.on("close", () => { sockets.delete(ws); clearTimeout(authTimer); });
  ws.on("error", () => {});
});
const beat = setInterval(() => {
  for (const ws of sockets) { if (!ws.isAlive) { ws.terminate(); sockets.delete(ws); continue; } ws.isAlive = false; try { ws.ping(); } catch {} }
}, 25000);
wss.on("close", () => clearInterval(beat));

server.listen(PORT, () => {
  console.log(`Marée running on port ${PORT}`);
  console.log(`Translation: ${svc.hasAI ? "on" : "off (set ANTHROPIC_API_KEY)"} · Email: ${svc.hasMail ? "on" : "off (set RESEND_API_KEY and EMAIL_FROM)"}`);
  if (!ADMIN_PASSWORD) console.warn("ADMIN_PASSWORD is not set: the admin desk will stay locked.");
});
