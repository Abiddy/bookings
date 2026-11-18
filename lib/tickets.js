"use strict";
/*
 * Email tickets: the guest fills in the quote form, the company gets an email with every detail
 * (Reply goes straight to the guest) plus one-click links to report what happened.
 * Those reports are how Marée tracks bookings and commission without in-app messaging.
 */
const crypto = require("crypto");
const { CATS, OPTIONS, FIELDS } = require("../public/catalog.js");
const S = require("./store");
const svc = require("./services");

const optById = Object.fromEntries(OPTIONS.map((o) => [o.id, o]));
const catById = Object.fromEntries(CATS.map((c) => [c.id, c]));
const LANG_CODES = Object.keys(svc.LANGS);
const fail = (status, message) => Object.assign(new Error(message), { status });
const str = (v, max) => String(v ?? "").trim().slice(0, max);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* English labels for the email (companies read tickets in English unless translation is on) */
const LABEL = {
  date: "Date", dates: "Dates", time: "Time of day", guests: "Guests", duration: "How long", level: "Experience", pickup: "Pickup location",
  carType: "Type of car", occasion: "Occasion", budget: "Budget", qty: "How many", delivery: "Delivery"
};
const CHOICE = {
  morning: "Morning", afternoon: "Afternoon", sunset: "Sunset", evening: "Evening", flexible: "Flexible",
  d2: "2 hours", d3: "3 hours", d4: "4+ hours", dday: "Full day", unsure: "Not sure",
  first: "First time", some: "Some experience", confident: "Confident", hotel: "Hotel lobby", lax: "LAX airport", other: "Other",
  convertible: "Convertible", suv: "SUV", luxury: "Luxury", electric: "Electric", any: "No preference",
  birthday: "Birthday", anniversary: "Anniversary", proposal: "Proposal", family: "Family", business: "Business",
  b1: "Under $200", b2: "$200–500", b3: "$500–1,000", b4: "$1,000+", deliver: "Deliver to the hotel", shop: "Customer picks up"
};
const PREF = { call: "Call", text: "Text message", email: "Email" };
const fmtDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }); };
function fieldPairs(fields) {
  const out = [];
  for (const k of Object.keys(LABEL)) {
    const v = fields[k]; if (v === undefined || v === null || v === "") continue;
    let val = k === "date" ? fmtDate(v) : k === "dates" ? fmtDate(v.from) + (v.to && v.to !== v.from ? " to " + fmtDate(v.to) : "") : typeof v === "number" ? String(v) : CHOICE[v] || v;
    out.push([LABEL[k], val]);
  }
  return out;
}

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

const vendorsFor = (optionId) => S.vendors.all().filter((v) => v.active && v.options.includes(optionId));

function create(body) {
  const o = optById[body.optionId]; if (!o) throw fail(400, "That option isn't available.");
  const cat = catById[o.cat];
  const name = str(body.name, 80), email = str(body.email, 120).toLowerCase(), phone = str(body.phone, 30);
  const pref = PREF[body.contactPref] ? body.contactPref : (phone ? "call" : "email");
  if (!name) throw fail(400, "Please add your name.");
  if (!email && !phone) throw fail(400, "Please add an email or phone number.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, "That email doesn't look right.");
  if ((pref === "call" || pref === "text") && !phone) throw fail(400, "Add a phone number so they can call or text you.");
  if (pref === "email" && !email) throw fail(400, "Add an email so they can write to you.");
  const lang = LANG_CODES.includes(body.lang) ? body.lang : "en";
  let vendor = null;
  if (body.vendorId) vendor = vendorsFor(o.id).find((v) => v.id === Number(body.vendorId)) || null;
  if (!vendor) vendor = vendorsFor(o.id)[0] || null;
  const t = S.threads.create({ option_id: o.id, cat_id: o.cat, vendor_id: vendor ? vendor.id : null, guest_token: S.token(), guest_name: name, guest_email: email, guest_phone: phone, guest_lang: lang, fields: cleanFields(cat, body.fields) });
  const notes = str(body.notes, 2000);
  const source = /^[a-z0-9-]{1,40}$/.test(String(body.source || "")) ? body.source : "maree";
  S.threads.set(t.id, { notes, contact_pref: pref, source, outcome_token: crypto.randomBytes(18).toString("base64url") });
  S.messages.add(t.id, { sender: "guest", kind: "request", body: notes, lang, data: { fields: t.fields } });
  return S.threads.byId(t.id);
}

/* ---------- emails ---------- */
function btn(href, label, dark) {
  return `<a href="${esc(href)}" style="display:inline-block;padding:12px 20px;margin:4px 8px 4px 0;border-radius:999px;text-decoration:none;font-weight:700;font-size:14px;${dark ? "background:#111;color:#fff" : "background:#fff;color:#111;border:1px solid #ccc"}">${esc(label)}</a>`;
}
function wrap(inner) {
  return `<div style="background:#f2f2f3;padding:24px 12px"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:18px;padding:26px;font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#111;font-size:15px;line-height:1.5">
    <div style="font-weight:800;letter-spacing:.06em;font-size:14px;margin-bottom:18px">MARÉE</div>${inner}</div></div>`;
}
async function vendorEmail(t, base) {
  const o = optById[t.option_id], v = t.vendor_id ? S.vendors.byId(t.vendor_id) : null;
  const to = v ? v.email : process.env.ADMIN_EMAIL || "";
  if (!to) return { ok: false, reason: v ? "This company has no email on file." : "No company covers this option and ADMIN_EMAIL isn't set." };
  let notes = t.notes, notesTr = null;
  const vLang = v ? v.lang : "en";
  if (notes && t.guest_lang !== vLang && svc.hasAI) { try { notesTr = await svc.translateText(notes, t.guest_lang, vLang); } catch (e) { console.error("translate:", e.message); } }
  const link = (r) => `${base}/outcome?c=${t.code}&k=${t.outcome_token}${r ? "&r=" + r : ""}`;
  const rows = fieldPairs(t.fields);
  const contact = [["Name", t.guest_name], ["Phone", t.guest_phone || "—"], ["Email", t.guest_email || "—"], ["Prefers", PREF[t.contact_pref] || "—"]];
  const langName = svc.LANGS[t.guest_lang] || "English";
  const table = (pairs) => `<table style="border-collapse:collapse;width:100%;font-size:14.5px">${pairs.map(([k, val]) => `<tr><td style="padding:6px 12px 6px 0;color:#666;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;font-weight:600">${esc(val)}</td></tr>`).join("")}</table>`;
  const html = wrap(`
    <h1 style="font-size:21px;margin:0 0 4px">New quote request: ${esc(o.title)}</h1>
    <p style="margin:0 0 18px;color:#666">Ref <b style="color:#111">${t.code}</b>${t.source && t.source !== "maree" ? " · via " + esc(t.source) : ""}${v ? "" : " · No partner covers this yet, so it came to you"}</p>
    <h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#666;margin:0 0 6px">Customer</h2>${table(contact)}
    ${t.guest_lang !== "en" ? `<p style="font-size:13px;color:#666;margin:6px 0 0">Speaks ${esc(langName)}.</p>` : ""}
    <h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#666;margin:20px 0 6px">Request</h2>${table(rows)}
    ${notes ? `<div style="margin-top:12px;padding:12px 14px;background:#f4f4f5;border-radius:12px;white-space:pre-wrap">${esc(notesTr || notes)}${notesTr ? `<div style="margin-top:8px;font-size:12.5px;color:#666">Translated from ${esc(langName)}. Original: ${esc(notes)}</div>` : ""}</div>` : ""}
    <p style="margin:22px 0 8px"><b>Please ${esc((PREF[t.contact_pref] || "contact").toLowerCase())} ${esc(t.guest_name.split(" ")[0])} with your quote.</b> Replying to this email goes straight to them.</p>
    <p style="margin:18px 0 6px;font-size:14px;color:#444">When you know how it went, tap one:</p>
    <div>${btn(link("booked"), "Booked ✓", true)}${btn(link("contacted"), "Contacted, still deciding")}${btn(link("lost"), "Didn't book")}</div>
    <p style="font-size:12px;color:#888;margin-top:22px">Sent by Marée, Marina del Rey. Bookings from this request are covered by your Marée partner agreement.</p>`);
  const text = `New quote request: ${o.title} (Ref ${t.code})\n\nCustomer\n${contact.map(([k, x]) => `${k}: ${x}`).join("\n")}\n\nRequest\n${rows.map(([k, x]) => `${k}: ${x}`).join("\n")}${notes ? `\n\nNotes: ${notesTr || notes}` : ""}\n\nPlease contact them with your quote. Replying to this email goes to the customer.\n\nBooked: ${link("booked")}\nContacted, still deciding: ${link("contacted")}\nDidn't book: ${link("lost")}`;
  await svc.sendEmail(to, `Quote request: ${o.title} · ${t.guest_name.split(" ")[0]} · Ref ${t.code}`, text, { html, replyTo: t.guest_email || undefined });
  return { ok: true, to };
}
async function guestEmail(t) {
  if (!t.guest_email) return;
  const o = optById[t.option_id], v = t.vendor_id ? S.vendors.byId(t.vendor_id) : null;
  const who = v ? v.name : "A local company";
  const how = { call: "call you", text: "text you", email: "email you" }[t.contact_pref] || "contact you";
  const rows = fieldPairs(t.fields);
  const html = wrap(`<h1 style="font-size:21px;margin:0 0 6px">We sent your request</h1>
    <p style="margin:0 0 16px">${esc(who)} will ${esc(how)} about <b>${esc(o.title)}</b>, usually within a few hours.</p>
    <p style="margin:0 0 16px;color:#666">Your reference: <b style="color:#111">${t.code}</b></p>
    <table style="border-collapse:collapse;width:100%;font-size:14.5px">${rows.map(([k, x]) => `<tr><td style="padding:5px 12px 5px 0;color:#666">${esc(k)}</td><td style="padding:5px 0;font-weight:600">${esc(x)}</td></tr>`).join("")}</table>
    <p style="font-size:12px;color:#888;margin-top:22px">Marée · Marina del Rey</p>`);
  await svc.sendEmail(t.guest_email, `Your request: ${o.title} (Ref ${t.code})`, `We sent your request for ${o.title}. ${who} will ${how}, usually within a few hours.\n\nReference: ${t.code}`, { html });
}
async function dispatch(t, base) {
  if (!svc.hasMail) { S.threads.set(t.id, { email_status: "off" }); return { ok: false, reason: "Email isn't set up yet." }; }
  try {
    const r = await vendorEmail(t, base);
    S.threads.set(t.id, { email_status: r.ok ? "sent " + r.to : "failed: " + r.reason });
    guestEmail(t).catch((e) => console.error("guest email:", e.message));
    return r;
  } catch (e) {
    console.error("vendor email:", e.message);
    S.threads.set(t.id, { email_status: "failed: " + e.message.slice(0, 120) });
    return { ok: false, reason: "The email service refused the message." };
  }
}

/* ---------- outcomes (from the company's email links) ---------- */
function byLink(code, key) {
  const t = S.threads.byCode(str(code, 12).toUpperCase());
  if (!t || !t.outcome_token || !key) throw fail(404, "This link isn't valid.");
  const a = Buffer.from(String(key)), b = Buffer.from(t.outcome_token);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw fail(404, "This link isn't valid.");
  return t;
}
function setOutcome(t, result, amount, by) {
  const ts = S.now(), patch = { outcome_at: ts };
  if (!t.first_reply_at) patch.first_reply_at = ts;
  if (result === "contacted") { patch.status = "contacted"; patch.contacted_at = t.contacted_at || ts; patch.booked_amount = null; patch.booked_at = null; }
  else if (result === "booked") {
    const n = Math.round(Number(amount) * 100) / 100;
    if (!(n > 0 && n < 1e7)) throw fail(400, "Add the total the customer is paying.");
    Object.assign(patch, { status: "booked", booked_amount: n, booked_at: t.booked_at || ts, contacted_at: t.contacted_at || ts });
  } else if (result === "lost") { Object.assign(patch, { status: "lost", booked_amount: null, booked_at: null }); }
  else if (result === "new" && by === "admin") { Object.assign(patch, { status: "new", booked_amount: null, booked_at: null, outcome_at: null }); }
  else throw fail(400, "Pick what happened.");
  const nt = S.threads.set(t.id, patch);
  S.messages.add(t.id, { sender: "system", kind: "system", body: "outcome:" + nt.status + ":" + by, data: { amount: nt.booked_amount } });
  return nt;
}
function publicView(t) {
  const o = optById[t.option_id], v = t.vendor_id ? S.vendors.byId(t.vendor_id) : null;
  return { code: t.code, option: o ? o.title : t.option_id, vendor: v ? v.name : null, guestFirstName: t.guest_name.split(" ")[0], details: fieldPairs(t.fields), status: t.status, amount: t.booked_amount, createdAt: t.created_at };
}
function adminView(t) {
  const o = optById[t.option_id], v = t.vendor_id ? S.vendors.byId(t.vendor_id) : null;
  return {
    id: t.id, code: t.code, optionId: t.option_id, option: o ? o.title : t.option_id, cat: t.cat_id,
    vendor: v ? { id: v.id, name: v.name } : null,
    guest: { name: t.guest_name, email: t.guest_email, phone: t.guest_phone, lang: t.guest_lang, pref: t.contact_pref },
    details: fieldPairs(t.fields), notes: t.notes, status: t.status, amount: t.booked_amount,
    source: t.source || "maree", createdAt: t.created_at, contactedAt: t.contacted_at, outcomeAt: t.outcome_at, bookedAt: t.booked_at, emailStatus: t.email_status
  };
}

module.exports = { create, dispatch, byLink, setOutcome, publicView, adminView, vendorsFor, optById };
