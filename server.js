"use strict";
/*
 * Marée booking server.
 * - Serves the guest app from /public
 * - Stores bookings and commission rates in a JSON file (DATA_DIR, a Railway volume in production)
 * - Recomputes every price from the catalog so a guest can't change what they pay
 * - Protects the Partner desk API with PARTNER_PASSWORD
 * No dependencies: Node 18+ only.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { EXP } = require("./public/catalog.js");

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const PARTNER_PASSWORD = process.env.PARTNER_PASSWORD || "";

const byId = Object.fromEntries(EXP.map((e) => [e.id, e]));
const perGroup = (e) => !["person", "bike"].includes(e.unit);

/* ---------- storage ---------- */
fs.mkdirSync(DATA_DIR, { recursive: true });
let db = { bookings: {}, rates: { commission: 20, hotel: 30 } };
try {
  db = { ...db, ...JSON.parse(fs.readFileSync(DB_FILE, "utf8")) };
} catch (e) {
  if (e.code !== "ENOENT") console.error("Could not read", DB_FILE, e.message);
}
let writing = Promise.resolve();
function persist() {
  const snapshot = JSON.stringify(db);
  writing = writing.then(async () => {
    const tmp = DB_FILE + ".tmp";
    await fs.promises.writeFile(tmp, snapshot);
    await fs.promises.rename(tmp, DB_FILE);
  }).catch((e) => console.error("Write failed:", e.message));
  return writing;
}

/* ---------- helpers ---------- */
const CODE_CHARS = "ACDEFGHJKMNPQRTUVWXY3469";
function newCode() {
  let c;
  do {
    c = Array.from(crypto.randomBytes(6), (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
  } while (db.bookings[c]);
  return c;
}
const str = (v, max) => String(v ?? "").trim().slice(0, max);
function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0, chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > 32 * 1024) { reject(Object.assign(new Error("Body too large"), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); }
      catch { reject(Object.assign(new Error("Invalid JSON"), { status: 400 })); }
    });
    req.on("error", reject);
  });
}
function isPartner(req) {
  if (!PARTNER_PASSWORD) return false;
  const h = req.headers.authorization || "";
  const given = Buffer.from(h.startsWith("Bearer ") ? h.slice(7) : "");
  const want = Buffer.from(PARTNER_PASSWORD);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}
// Simple per-IP limiter for guest writes and password attempts
const hits = new Map();
function limited(req, key, max, windowMs) {
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  const k = key + ":" + ip, now = Date.now();
  const arr = (hits.get(k) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(k, arr);
  return arr.length > max;
}
setInterval(() => hits.clear(), 60 * 60 * 1000).unref();

/* ---------- booking logic ---------- */
function buildBooking(input) {
  const e = byId[input.expId];
  if (!e) throw Object.assign(new Error("That experience isn't available."), { status: 400 });
  const guests = Math.floor(Number(input.guests));
  if (!(guests >= 1 && guests <= 20)) throw Object.assign(new Error("Choose between 1 and 20 guests."), { status: 400 });
  const date = str(input.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Object.assign(new Error("Pick a day for the booking."), { status: 400 });
  const guestName = str(input.guestName, 80), room = str(input.room, 12);
  if (!guestName || !room) throw Object.assign(new Error("Add your name and room number so the front desk can match the booking."), { status: 400 });
  const ids = Array.isArray(input.addons) ? input.addons.map(String) : [];
  const addons = e.addons.filter((a) => ids.includes(a.id));
  const subtotal = (perGroup(e) ? e.price : e.price * guests) + addons.reduce((s, a) => s + a.price, 0);
  return {
    code: newCode(), expId: e.id, title: e.title, cat: e.cat, partner: e.partner,
    date, time: str(input.time, 20), guests, addons, subtotal,
    guestName, room, phone: str(input.phone, 30),
    pay: input.pay === "card" ? "card" : "room",
    status: "confirmed", createdAt: new Date().toISOString(), sample: false,
    ratesAtBooking: { ...db.rates },
  };
}
// What a guest gets back: their booking without other guests' data (they only ever see their own codes)
const guestView = (b) => b;

/* ---------- static files ---------- */
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".json": "application/json" };
function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === "/" || !path.extname(rel)) rel = "/index.html";
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("Not found"); return; }
    const ext = path.extname(file);
    res.writeHead(200, {
      "Content-Type": TYPES[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
    });
    res.end(req.method === "HEAD" ? undefined : buf);
  });
}

/* ---------- router ---------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;
  try {
    if (p === "/api/health") return send(res, 200, { ok: true });

    if (p === "/api/rates" && req.method === "GET") return send(res, 200, { rates: db.rates });

    if (p === "/api/rates" && req.method === "PUT") {
      if (!isPartner(req)) return send(res, 401, { error: "Partner password required." });
      const b = await readBody(req);
      const commission = Math.round(Number(b.commission)), hotel = Math.round(Number(b.hotel));
      if (!(commission >= 0 && commission <= 50 && hotel >= 0 && hotel <= 100)) return send(res, 400, { error: "Rates are out of range." });
      db.rates = { commission, hotel, updatedAt: new Date().toISOString() };
      await persist();
      return send(res, 200, { rates: db.rates });
    }

    if (p === "/api/bookings" && req.method === "POST") {
      if (limited(req, "book", 30, 60 * 60 * 1000)) return send(res, 429, { error: "Too many bookings from this device. Try again later." });
      const booking = buildBooking(await readBody(req));
      db.bookings[booking.code] = booking;
      await persist();
      return send(res, 201, { booking: guestView(booking) });
    }

    if (p === "/api/bookings" && req.method === "GET") {
      const codes = str(url.searchParams.get("codes"), 2000).split(",").map((c) => c.trim().toUpperCase()).filter(Boolean).slice(0, 50);
      return send(res, 200, { bookings: codes.map((c) => db.bookings[c]).filter(Boolean).map(guestView) });
    }

    const m = /^\/api\/bookings\/([A-Z0-9]{4,12})\/cancel$/.exec(p);
    if (m && req.method === "POST") {
      const b = db.bookings[m[1]];
      if (!b) return send(res, 404, { error: "Booking not found." });
      if (b.status !== "cancelled") { b.status = "cancelled"; b.cancelledAt = new Date().toISOString(); await persist(); }
      return send(res, 200, { booking: guestView(b) });
    }

    if (p === "/api/partner/bookings" && req.method === "GET") {
      if (limited(req, "partner", 300, 15 * 60 * 1000)) return send(res, 429, { error: "Too many attempts. Wait a few minutes." });
      if (!PARTNER_PASSWORD) return send(res, 401, { error: "Set PARTNER_PASSWORD on the server to open the Partner desk." });
      if (!isPartner(req)) return send(res, 401, { error: "Wrong password." });
      return send(res, 200, { bookings: Object.values(db.bookings) });
    }

    if (p.startsWith("/api/")) return send(res, 404, { error: "Not found." });
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); res.end(); return; }
    serveStatic(req, res, p);
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    send(res, status, { error: status === 500 ? "Something went wrong." : e.message });
  }
});

server.listen(PORT, () => {
  console.log(`Marée running on port ${PORT} · data in ${DB_FILE}`);
  if (!PARTNER_PASSWORD) console.warn("PARTNER_PASSWORD is not set: the Partner desk will stay locked.");
});
