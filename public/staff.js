/* Inbox shared by the vendor portal and the admin desk: conversation list + live chat, with alerts for new guest messages. */
(function (root) {
"use strict";
const { esc, money, img, api, Chat, makeT, toast } = root.M;
const { OPTIONS } = root.MAREE_CATALOG;
const optById = Object.fromEntries(OPTIONS.map((o) => [o.id, o]));
const t = makeT("en");
const STATUS_LABEL = { new: "New", replied: "Replied", quoted: "Quoted", accepted: "Quote accepted", booked: "Booked", closed: "Closed" };
const pill = (s) => `<span class="pill ${s}">${STATUS_LABEL[s] || s}</span>`;
const ago = (iso) => {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return "now"; if (s < 3600) return Math.floor(s / 60) + "m"; if (s < 86400) return Math.floor(s / 3600) + "h";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
const FILTERS = { open: (x) => !["booked", "closed"].includes(x.status), new: (x) => x.status === "new", booked: (x) => x.status === "booked", closed: (x) => x.status === "closed", all: () => true };

function lastLine(x, role) {
  const m = x.last; if (!m) return "";
  if (m.kind === "system") return ({ quote_accepted: "Guest accepted the quote", quote_declined: "Guest declined the quote", booked: "Marked as booked", closed: "Closed", reopened: "Reopened", assigned: "Assigned" })[m.body] || m.body;
  if (m.kind === "quote") return "Quote · " + money(m.data.price, 2);
  const mine = (role === "admin" && m.sender === "admin") || (role === "vendor" && m.sender === "vendor");
  const txt = m.lang !== "en" && m.tr && m.tr.en ? m.tr.en : m.body;
  return (mine ? "You: " : "") + (m.kind === "request" ? (txt ? "Request: " + txt : "New request") : txt);
}

/*
 * Inbox(el, {role, auth, live, lang, extraHeader(thread) -> html, extraItem(thread) -> html, afterLoad})
 */
function Inbox(el, opts) {
  const { role, auth, live } = opts;
  const st = { threads: [], filter: "open", openId: null, chat: null, lang: opts.lang || "en", title: document.title, alerts: false };
  el.innerHTML = `<div class="split" data-split>
    <aside class="list" aria-label="Conversations">
      <div class="list-h pad"><h1>${opts.title || "Inbox"}</h1>
        <div class="filters" role="group" aria-label="Filter">${[["open", "Open"], ["new", "New"], ["booked", "Booked"], ["closed", "Closed"], ["all", "All"]].map(([k, l]) => `<button class="chip" type="button" data-filter="${k}" aria-pressed="${k === st.filter}">${l}</button>`).join("")}</div>
      </div>
      <div class="items" data-items></div>
    </aside>
    <section class="pane" data-pane><div class="pane-empty">Pick a conversation to reply.</div></section>
  </div>`;
  const $ = (s) => el.querySelector(s);

  function renderList() {
    const list = st.threads.filter(FILTERS[st.filter]).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    $("[data-items]").innerHTML = list.length ? list.map((x) => `
      <a class="item ${x.unread ? "unread" : ""}" href="#t-${x.id}" aria-current="${x.id === st.openId}">
        <div class="th ph-fallback">${img(x.photo, 100)}</div>
        <div class="tx"><div class="l1"><b>${esc(x.guestName)} · ${esc(x.optionTitle)}</b><time datetime="${x.updatedAt}">${ago(x.updatedAt)}</time></div>
          <div class="l2">${esc(lastLine(x, role))}</div>
          <div class="l3">${pill(x.status)}${opts.extraItem ? opts.extraItem(x) : ""}${x.unread ? '<span class="udot" aria-label="unread"></span>' : ""}</div></div>
      </a>`).join("") : `<div class="pane-empty">Nothing here yet.</div>`;
    const n = st.threads.reduce((s, x) => s + (x.unread || 0), 0);
    document.title = (n ? `(${n}) ` : "") + st.title;
  }
  async function loadList() {
    const r = await api("/api/threads", { auth });
    st.threads = r.threads; renderList();
    opts.afterLoad && opts.afterLoad(r);
  }
  function open(id) {
    st.openId = id;
    $("[data-split]").classList.toggle("viewing", !!id);
    document.querySelector(".shell").classList.toggle("chatting", !!id);
    if (st.chat) { st.chat.destroy(); st.chat = null; }
    if (!id) { $("[data-pane]").innerHTML = `<div class="pane-empty">Pick a conversation to reply.</div>`; renderList(); return; }
    $("[data-pane]").innerHTML = "";
    st.chat = Chat($("[data-pane]"), {
      role, lang: st.lang, t, auth, live,
      header: (th) => `<a class="bk" href="#" aria-label="Back to inbox">${root.M.ICON.back}</a>
        <div class="th ph-fallback">${img(th.photo, 100)}</div>
        <div class="ti"><b>${esc(th.guestName)} · ${esc(th.optionTitle)}</b><span>${pill(th.status)} Ref ${esc(th.code)} · guest writes in ${esc(root.MAREE_I18N.langNameIn(th.guestLang, "en"))}${opts.extraHeader ? opts.extraHeader(th) : ""}</span></div>`,
      onThread: (th) => { const i = st.threads.findIndex((x) => x.id === th.id); if (i >= 0) st.threads[i] = { ...th, unread: 0 }; renderList(); }
    });
    st.chat.load(id).catch(() => { toast("That conversation couldn't be opened."); location.hash = ""; });
    renderList();
  }
  // alerts
  let ctx;
  function chime() { try { ctx = ctx || new AudioContext(); const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 880; g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35); o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.4); } catch {} }
  const onLiveThread = (ev) => {
    const i = st.threads.findIndex((x) => x.id === ev.thread.id);
    const fromGuest = ev.message && ev.message.sender === "guest" && (i < 0 || ev.message.id > ((st.threads[i].last || {}).id || 0));
    if (i >= 0) st.threads[i] = ev.thread; else st.threads.unshift(ev.thread);
    if (ev.thread.id === st.openId && !document.hidden) st.threads[st.threads.findIndex((x) => x.id === ev.thread.id)].unread = 0;
    renderList();
    if (fromGuest && (document.hidden || ev.thread.id !== st.openId)) {
      chime();
      if (st.alerts && "Notification" in window && Notification.permission === "granted") {
        try { new Notification(`${ev.thread.guestName} · ${ev.thread.optionTitle}`, { body: ev.message.kind === "request" ? "New request" : (ev.message.tr.en || ev.message.body).slice(0, 140), tag: "t" + ev.thread.id }); } catch {}
      }
    }
  };
  const onLiveReady = () => loadList().catch(() => {});
  live.on("thread", onLiveThread);
  live.on("ready", onLiveReady);

  el.addEventListener("click", (e) => {
    const f = e.target.closest("[data-filter]");
    if (f) { st.filter = f.dataset.filter; el.querySelectorAll("[data-filter]").forEach((b) => b.setAttribute("aria-pressed", b === f)); renderList(); }
  });
  const onHash = () => { const m = /^#t-(\d+)$/.exec(location.hash); open(m ? Number(m[1]) : null); };
  window.addEventListener("hashchange", onHash);

  return {
    start: async () => { await loadList(); onHash(); },
    enableAlerts: async () => { if (!("Notification" in window)) { toast("This browser doesn't support alerts."); return false; } const p = await Notification.requestPermission(); st.alerts = p === "granted"; if (!st.alerts) toast("Alerts are blocked in this browser's settings."); return st.alerts; },
    setLang: (l) => { st.lang = l; if (st.chat) st.chat.setLang(l, t); },
    reload: loadList,
    get threads() { return st.threads; },
    destroy: () => {
      window.removeEventListener("hashchange", onHash);
      if (st.chat) st.chat.destroy();
      live.h.thread = (live.h.thread || []).filter((f) => f !== onLiveThread);
      live.h.ready = (live.h.ready || []).filter((f) => f !== onLiveReady);
      document.title = st.title;
    }
  };
}
root.Staff = { Inbox, pill, STATUS_LABEL, optById, ago };
})(window);
