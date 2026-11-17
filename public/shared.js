/* Shared client code: API calls, the live WebSocket connection, and the chat view used by guests, vendors and the admin desk. */
(function (root) {
"use strict";
const { makeT, langNameIn } = root.MAREE_I18N;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n, d = 0) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const store = {
  get: (k, f) => { try { const v = localStorage.getItem(k); return v === null ? f : JSON.parse(v); } catch { return f; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} }
};
const img = (src, w, alt = "") => src ? `<img class="photo" src="${esc(src)}?auto=format&fit=crop&w=${w}&q=72" srcset="${esc(src)}?auto=format&fit=crop&w=${w * 2}&q=65 2x" alt="${esc(alt)}" loading="lazy" decoding="async" onerror="this.remove()">` : "";
function toast(msg) {
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), 2600);
}
const ICON = {
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>'
};

/* ---------- API ---------- */
function authHeaders(auth) {
  const h = {};
  if (auth.admin) h.Authorization = "Bearer " + auth.admin;
  if (auth.vendorKey) h["X-Vendor-Key"] = auth.vendorKey;
  if (auth.guestToken) h["X-Guest-Token"] = auth.guestToken;
  return h;
}
async function api(path, { method = "GET", body, auth = {} } = {}) {
  const res = await fetch(path, { method, headers: { "Content-Type": "application/json", ...authHeaders(auth) }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch {}
  if (!res.ok) { const e = new Error((data && data.error) || "Request failed"); e.status = res.status; throw e; }
  return data;
}

/* ---------- Live: WebSocket with auth, auto-reconnect and backoff ---------- */
class Live {
  constructor(auth) { this.auth = auth; this.h = {}; this.retry = 0; this.viewing = null; this.lastTyping = 0; this.stopped = false; this.connect();
    document.addEventListener("visibilitychange", () => { if (!document.hidden && (!this.ws || this.ws.readyState > 1)) this.connect(); });
    window.addEventListener("online", () => { if (!this.ws || this.ws.readyState > 1) this.connect(); });
  }
  connect() {
    if (this.stopped) return;
    clearTimeout(this.timer);
    const ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws");
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: "auth", admin: this.auth.admin, vendorKey: this.auth.vendorKey, guestToken: this.auth.guestToken }));
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.type === "ready") { this.retry = 0; this.up = true; if (this.viewing) this.send({ type: "view", threadId: this.viewing }); }
      this.emit(m.type, m);
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.up = false; this.emit("down");
      if (e.code === 4003) { this.stopped = true; this.emit("unauthorized"); return; }
      this.timer = setTimeout(() => this.connect(), Math.min(10000, 400 * 2 ** this.retry++) + Math.random() * 300);
    };
    ws.onerror = () => {};
  }
  send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  view(id) { this.viewing = id; this.send({ type: "view", threadId: id }); }
  typing(id) { const n = Date.now(); if (n - this.lastTyping > 2500) { this.lastTyping = n; this.send({ type: "typing", threadId: id }); } }
  on(t, f) { (this.h[t] = this.h[t] || []).push(f); }
  emit(t, a) { (this.h[t] || []).forEach((f) => { try { f(a); } catch (e) { console.error(e); } }); }
  close() { this.stopped = true; if (this.ws) this.ws.close(); }
}
function connBanner(live, t) {
  let el = document.getElementById("conn");
  if (!el) { el = document.createElement("div"); el.id = "conn"; el.className = "conn"; el.hidden = true; el.setAttribute("role", "status"); document.body.appendChild(el); }
  let timer;
  live.on("down", () => { clearTimeout(timer); timer = setTimeout(() => { el.textContent = t("reconnecting"); el.hidden = false; }, 1500); });
  live.on("ready", () => { clearTimeout(timer); el.hidden = true; });
}

/* ---------- Chat view ---------- */
const FIELD_ORDER = ["date", "dates", "time", "guests", "duration", "level", "carType", "pickup", "occasion", "budget"];
function fieldRows(fields, t, lang) {
  const fmtDate = (s) => { try { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString(lang, { weekday: "short", month: "short", day: "numeric" }); } catch { return s; } };
  const rows = [];
  for (const k of FIELD_ORDER) {
    const v = fields && fields[k]; if (v === undefined || v === null || v === "") continue;
    let val;
    if (k === "date") val = fmtDate(v);
    else if (k === "dates") val = fmtDate(v.from) + (v.to && v.to !== v.from ? " → " + fmtDate(v.to) : "");
    else if (k === "guests") val = String(v);
    else val = t("c_" + v);
    rows.push(`<dt>${esc(t("f_" + k))}</dt><dd>${esc(val)}</dd>`);
  }
  return rows.join("");
}
const dayKey = (iso) => { const d = new Date(iso); return d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate(); };
function dayText(iso, t, lang) {
  const d = new Date(iso), today = new Date(), y = new Date(); y.setDate(today.getDate() - 1);
  if (dayKey(iso) === dayKey(today.toISOString())) return t("today");
  if (dayKey(iso) === dayKey(y.toISOString())) return t("yesterday");
  return d.toLocaleDateString(lang, { weekday: "long", month: "short", day: "numeric" });
}
const timeText = (iso, lang) => new Date(iso).toLocaleTimeString(lang, { hour: "numeric", minute: "2-digit" });

/*
 * Chat(root, opts)
 *  opts.role: "guest" | "vendor" | "admin"
 *  opts.lang: viewer's language (what translations to show)
 *  opts.t: translate function
 *  opts.auth, opts.live
 *  opts.header(thread) -> html for the header bar
 *  opts.onThread(thread): called whenever the thread changes
 */
function Chat(rootEl, opts) {
  const { role, auth, live } = opts;
  let t = opts.t, lang = opts.lang;
  const me = role === "admin" ? "admin" : role;
  const st = { thread: null, msgs: new Map(), pending: [], original: new Set(), typingUntil: 0, typingFrom: "", panel: null, threadId: null, readSent: 0 };

  rootEl.innerHTML = `<div class="chat">
    <div class="chat-h pad" data-h></div>
    <div class="chat-body pad" data-body aria-live="polite"></div>
    <div class="typing pad" data-typing aria-live="polite"></div>
    ${role !== "guest" ? `<div class="pad" data-tools></div>` : ""}
    <form class="composer pad" data-form>
      <label class="sr" for="msg-${role}">${esc(t("msg_ph"))}</label>
      <div class="box"><textarea id="msg-${role}" rows="1" placeholder="${esc(t("msg_ph"))}" maxlength="2000" data-input></textarea></div>
      <button class="sendbtn" type="submit" aria-label="${esc(t("send"))}" data-send disabled>${ICON.send}</button>
    </form></div>`;
  const $ = (s) => rootEl.querySelector(s);
  const body = $("[data-body]"), input = $("[data-input]"), sendBtn = $("[data-send]");

  const nameOf = (sender) => sender === "guest" ? (st.thread && st.thread.guestName) || "Guest" : sender === "vendor" ? (st.thread && st.thread.vendor ? st.thread.vendor.name : "Partner") : t("concierge");
  const nearBottom = () => body.scrollHeight - body.scrollTop - body.clientHeight < 120;
  const toBottom = () => { body.scrollTop = body.scrollHeight; };

  function textOf(m) {
    const has = m.lang !== lang && m.tr && m.tr[lang];
    const showOrig = st.original.has(m.id);
    return { text: has && !showOrig ? m.tr[lang] : m.body, translated: has, showOrig };
  }
  function trLine(m, x) {
    if (!x.translated) return "";
    return `<span>${esc(t("translated", { lang: langNameIn(m.lang, lang) }))}</span><button type="button" data-orig="${m.id}">${esc(x.showOrig ? t("show_translation") : t("show_original"))}</button>`;
  }
  function sysText(m) {
    const d = m.data || {};
    if (m.body === "quote_accepted") return t("sys_quote_accepted", { price: money(d.price, 2) });
    if (m.body === "quote_declined") return t("sys_quote_declined");
    if (m.body === "booked") return t("sys_booked", { price: money(d.amount, 2) });
    if (m.body === "closed") return t("sys_closed");
    if (m.body === "reopened") return t("sys_reopened");
    if (m.body === "assigned") return d.vendor ? t("sys_assigned", { vendor: d.vendor }) : t("sys_assigned_none");
    return m.body;
  }
  function render() {
    const th = st.thread; if (!th) return;
    $("[data-h]").innerHTML = opts.header(th);
    const keep = nearBottom();
    const list = [...st.msgs.values()].sort((a, b) => a.id - b.id).concat(st.pending);
    const otherRead = role === "guest" ? th.reads.vendor : th.reads.guest;
    const myLast = [...list].reverse().find((m) => m.sender === me && !m.temp);
    let html = "", lastDay = "", lastSender = "", anyMasked = false;
    for (const m of list) {
      const dk = dayKey(m.createdAt);
      if (dk !== lastDay) { html += `<div class="day-sep">${esc(dayText(m.createdAt, t, lang))}</div>`; lastDay = dk; lastSender = ""; }
      if (m.kind === "system") { html += `<div class="sys ${m.body === "booked" || m.body === "quote_accepted" ? "ok" : ""}">${esc(sysText(m))}</div>`; lastSender = ""; continue; }
      const mine = m.sender === me;
      if (m.masked) anyMasked = true;
      if (m.sender !== lastSender) html += `<div class="who ${mine ? "me" : ""}">${esc(mine ? t("you") : nameOf(m.sender))}</div>`;
      lastSender = m.sender;
      const x = textOf(m);
      let inner;
      if (m.kind === "request") {
        inner = `<div class="card"><h4>${esc(role === "guest" ? t("request_details") : "Request details")}</h4><dl>${fieldRows(m.data.fields, t, lang)}</dl>${x.text ? `<div class="notes">${esc(x.text)}</div>` : ""}</div>`;
      } else if (m.kind === "quote") {
        const q = m.data || {};
        const state = q.status === "accepted" ? `<span class="pill booked">${esc(t("q_accepted"))}</span>` : q.status === "declined" ? `<span class="pill closed">${esc(t("q_declined"))}</span>` : `<span class="pill quoted">${esc(t("q_pending"))}</span>`;
        inner = `<div class="card"><h4>${esc(t("quote"))}</h4><div class="quote-price num">${money(q.price, 2)}</div>${q.date ? `<div class="note">${esc(q.date)}</div>` : ""}${x.text ? `<div class="notes">${esc(x.text)}</div>` : ""}<div>${state}</div>
          ${role === "guest" && q.status === "pending" && th.status !== "closed" ? `<div class="acts"><button class="btn btn-line" type="button" data-q="${m.id}:decline">${esc(t("decline"))}</button><button class="btn btn-ink" type="button" data-q="${m.id}:accept">${esc(t("accept"))}</button></div>` : ""}</div>`;
      } else {
        inner = `<div class="bubble">${esc(x.text)}</div>`;
      }
      let meta = "";
      if (m.temp) meta = m.failed ? `<span>${esc(t("not_sent"))}</span><button type="button" data-retry="${m.tempId}">${esc(t("retry"))}</button>` : "";
      else {
        const bits = [`<span>${esc(timeText(m.createdAt, lang))}</span>`, trLine(m, x)];
        if (mine && myLast && m.id === myLast.id) bits.push(`<span>${esc(otherRead >= m.id ? t("seen") : t("sent"))}</span>`);
        meta = bits.join("");
      }
      html += `<div class="row ${mine ? "me" : ""} ${m.temp ? (m.failed ? "failed" : "pending") : ""}">${inner}<div class="meta">${meta}</div></div>`;
    }
    if (anyMasked) html += `<p class="masknote">${esc(t("masked"))}</p>`;
    if (th.status === "closed" && role === "guest") html += `<p class="masknote">${esc(t("closed_note"))}</p>`;
    body.innerHTML = html;
    if (keep) toBottom();
    renderTools(); renderTyping(); markRead();
  }
  function renderTyping() {
    const el = $("[data-typing]");
    el.innerHTML = Date.now() < st.typingUntil ? `<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>${esc(t("typing", { name: nameOf(st.typingFrom === "admin" ? "admin" : st.typingFrom) }))}` : "";
  }
  function renderTools() {
    const el = $("[data-tools]"); if (!el) return;
    const th = st.thread;
    const lastQuote = [...st.msgs.values()].filter((m) => m.kind === "quote").sort((a, b) => b.id - a.id)[0];
    const acceptedQuote = [...st.msgs.values()].filter((m) => m.kind === "quote" && m.data.status === "accepted").sort((a, b) => b.id - a.id)[0];
    let panel = "";
    if (st.panel === "quote") panel = `<form class="panel" data-quote-form>
        <div class="f"><label for="qp">Price for the guest (USD)</label><div class="inp"><span>$</span><input id="qp" inputmode="decimal" placeholder="450" required></div></div>
        <div class="f"><label for="qd">Date and time</label><div class="inp"><input id="qd" placeholder="Sat Nov 21, 5:00 PM" maxlength="40"></div></div>
        <div class="f"><label for="qx">What's included</label><div class="inp"><textarea id="qx" rows="3" maxlength="1000" placeholder="2-hour private sail for 4, drinks included"></textarea></div></div>
        <div style="display:flex;gap:8px"><button class="btn btn-line btn-sm" type="button" data-panel="">Cancel</button><button class="btn btn-ink btn-sm" type="submit">Send quote</button></div></form>`;
    if (st.panel === "booked") panel = `<form class="panel" data-booked-form>
        <div class="f"><label for="ba">Final amount the guest is paying (USD)</label><div class="inp"><span>$</span><input id="ba" inputmode="decimal" value="${acceptedQuote ? acceptedQuote.data.price : lastQuote ? lastQuote.data.price : ""}" required></div></div>
        <p class="note">This marks the request as booked and shares contact details with both sides. Commission is calculated from this amount.</p>
        <div style="display:flex;gap:8px"><button class="btn btn-line btn-sm" type="button" data-panel="">Cancel</button><button class="btn btn-ink btn-sm" type="submit">Confirm booking</button></div></form>`;
    const closed = th.status === "closed", booked = th.status === "booked";
    el.innerHTML = `<div class="chat-tools">
      ${!closed && !booked ? `<button class="btn btn-line btn-sm" type="button" data-panel="quote">Send quote</button><button class="btn btn-line btn-sm" type="button" data-panel="booked">Mark booked</button><button class="btn btn-line btn-sm" type="button" data-status="closed">Close</button>` : `<button class="btn btn-line btn-sm" type="button" data-status="reopen">Reopen</button>`}
      ${th.guestContact ? `<span class="note" style="align-self:center">Guest: ${esc([th.guestContact.email, th.guestContact.phone].filter(Boolean).join(" · ") || "no contact given")}</span>` : ""}
    </div>${panel}`;
    const qp = el.querySelector("#qp"); if (qp) qp.focus();
  }
  let readTimer;
  function markRead() {
    clearTimeout(readTimer);
    readTimer = setTimeout(() => {
      if (document.hidden || !st.thread) return;
      const ids = [...st.msgs.keys()]; if (!ids.length) return;
      const top = Math.max(...ids);
      if (top > st.readSent) { st.readSent = top; api(`/api/threads/${st.thread.id}/read`, { method: "POST", body: { upTo: top }, auth }).catch(() => {}); }
    }, 400);
  }

  async function load(id) {
    st.threadId = id; st.msgs.clear(); st.pending = []; st.panel = null; st.readSent = 0;
    const r = await api(`/api/threads/${id}`, { auth });
    st.thread = r.thread; r.messages.forEach((m) => st.msgs.set(m.id, m));
    live.view(id);
    render(); toBottom();
    opts.onThread && opts.onThread(st.thread);
    setTimeout(() => input.focus({ preventScroll: true }), 50);
  }
  async function sendText(text, tempId) {
    const temp = tempId ? st.pending.find((p) => p.tempId === tempId) : { temp: true, tempId: "t" + Date.now() + Math.random(), sender: me, kind: "text", body: text, lang, tr: {}, createdAt: new Date().toISOString() };
    if (!tempId) st.pending.push(temp); else temp.failed = false;
    render(); toBottom();
    try {
      const r = await api(`/api/threads/${st.thread.id}/messages`, { method: "POST", body: { body: temp.body }, auth });
      st.pending = st.pending.filter((p) => p !== temp);
      st.msgs.set(r.message.id, r.message);
      render(); toBottom();
    } catch (e) {
      temp.failed = true; render();
      if (e.status && e.status !== 500) toast(e.message);
    }
  }

  // live events
  const onThread = (ev) => {
    if (!st.thread || ev.thread.id !== st.thread.id) return;
    const wasBooked = st.thread.status === "booked";
    st.thread = ev.thread;
    if (wasBooked !== (ev.thread.status === "booked")) { onReady(); return; } // contact details change visibility: refetch everything
    if (ev.message) { st.msgs.set(ev.message.id, ev.message); if (ev.message.sender !== me) st.typingUntil = 0; }
    render(); opts.onThread && opts.onThread(st.thread);
  };
  const onTyping = (ev) => { if (!st.thread || ev.threadId !== st.thread.id) return; st.typingUntil = Date.now() + 4000; st.typingFrom = ev.from; renderTyping(); setTimeout(renderTyping, 4100); };
  const onReady = () => { if (st.threadId) api(`/api/threads/${st.threadId}`, { auth }).then((r) => { st.thread = r.thread; r.messages.forEach((m) => st.msgs.set(m.id, m)); render(); }).catch(() => {}); };
  live.on("thread", onThread); live.on("typing", onTyping); live.on("ready", onReady);

  // input
  const grow = () => { input.style.height = "auto"; input.style.height = Math.min(140, input.scrollHeight) + "px"; sendBtn.disabled = !input.value.trim(); };
  input.addEventListener("input", () => { grow(); if (st.thread && input.value.trim()) live.typing(st.thread.id); });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing && window.matchMedia("(pointer:fine)").matches) { e.preventDefault(); $("[data-form]").requestSubmit(); } });
  $("[data-form]").addEventListener("submit", (e) => { e.preventDefault(); const v = input.value.trim(); if (!v || !st.thread) return; input.value = ""; grow(); sendText(v); input.focus(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) markRead(); });

  rootEl.addEventListener("click", async (e) => {
    const b = e.target.closest("button"); if (!b || !rootEl.contains(b)) return;
    if (b.dataset.orig) { const id = Number(b.dataset.orig); st.original.has(id) ? st.original.delete(id) : st.original.add(id); render(); return; }
    if (b.dataset.retry) { sendText(null, b.dataset.retry); return; }
    if (b.dataset.q) {
      const [id, act] = b.dataset.q.split(":"); b.disabled = true;
      try { await api(`/api/threads/${st.thread.id}/quote/${id}/${act}`, { method: "POST", auth }); } catch (err) { toast(err.message); b.disabled = false; }
      return;
    }
    if (b.dataset.panel !== undefined) { st.panel = b.dataset.panel || null; renderTools(); return; }
    if (b.dataset.status) {
      if (b.dataset.status === "closed" && b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Tap again to close"; setTimeout(() => { if (b.isConnected) { b.dataset.armed = ""; b.textContent = "Close"; } }, 3000); return; }
      try { const r = await api(`/api/threads/${st.thread.id}/status`, { method: "POST", body: { status: b.dataset.status }, auth }); st.thread = r.thread; render(); } catch (err) { toast(err.message); }
    }
  });
  rootEl.addEventListener("submit", async (e) => {
    if (e.target.matches("[data-quote-form]")) {
      e.preventDefault();
      const price = parseFloat(String(rootEl.querySelector("#qp").value).replace(/[^0-9.]/g, ""));
      if (!(price > 0)) { toast("Add a price for the quote."); return; }
      try { await api(`/api/threads/${st.thread.id}/quote`, { method: "POST", body: { price, date: rootEl.querySelector("#qd").value, details: rootEl.querySelector("#qx").value }, auth }); st.panel = null; render(); toBottom(); }
      catch (err) { toast(err.message); }
    }
    if (e.target.matches("[data-booked-form]")) {
      e.preventDefault();
      const amount = parseFloat(String(rootEl.querySelector("#ba").value).replace(/[^0-9.]/g, ""));
      if (!(amount > 0)) { toast("Add the final amount."); return; }
      try { const r = await api(`/api/threads/${st.thread.id}/status`, { method: "POST", body: { status: "booked", amount }, auth }); st.thread = r.thread; st.panel = null; render(); }
      catch (err) { toast(err.message); }
    }
  });

  return {
    load,
    get thread() { return st.thread; },
    setLang(l, tf) { lang = l; t = tf; render(); },
    destroy() {
      for (const [k, f] of [["thread", onThread], ["typing", onTyping], ["ready", onReady]]) live.h[k] = (live.h[k] || []).filter((x) => x !== f);
      live.view(null);
    }
  };
}

root.M = { esc, money, store, img, toast, ICON, api, Live, connBanner, Chat, fieldRows, makeT, langNameIn };
})(window);
