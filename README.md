# Marée · Marina del Rey guest experiences

Guests pick what they want (boats, tours, beach and water, car rental, catering, celebrations), fill in a short quote request, and chat live with the local company that handles it. No payment happens in the app: the company sends a quote in the chat, the guest accepts, and the company marks the request as booked. Marée tracks every booking so commission can be invoiced.

Three apps, one server:

| URL | Who | What |
| --- | --- | --- |
| `/` | Guests | Browse categories, request a quote, chat in their own language |
| `/vendor?k=…` | Partner companies | Private inbox: reply, send quotes, mark booked |
| `/admin` | You | Every request, assign partners, partner links, commission and settings |

## Run it locally

```bash
npm install
ADMIN_PASSWORD=dev npm start
# guest app: http://localhost:3000
# admin desk: http://localhost:3000/admin  (password: dev)
```

## Railway variables

| Variable | Needed | What it does |
| --- | --- | --- |
| `DATA_DIR` | yes | Where the database lives. Set to `/data` with a volume mounted there |
| `ADMIN_PASSWORD` | yes | Admin desk password (`PARTNER_PASSWORD` also works) |
| `ANTHROPIC_API_KEY` | for translation | Translates chat messages and listing text with Claude |
| `RESEND_API_KEY`, `EMAIL_FROM` | for email | Emails partners about new requests and guests about replies |
| `ADMIN_EMAIL` | optional | Where unassigned requests are emailed |
| `PUBLIC_URL` | optional | Link base for emails. Defaults to Railway's domain |

## How it works

- **Live messaging:** WebSockets (`/ws`). The browser authenticates over the socket, the server pushes new messages, read receipts and typing indicators, and the client reconnects with backoff and refetches anything it missed. Messages are sent over HTTPS so each one is stored before it's delivered.
- **Storage:** SQLite (`better-sqlite3`) in `DATA_DIR/maree.db`.
- **Privacy and commission:** phone numbers, emails and social handles in messages are hidden from the other side until the request is booked (toggle in Admin → Earnings). Guest contact details are shown to the partner once booked.
- **Translation:** guests choose a language (English, Spanish, French, Chinese, Japanese, Korean). The interface is translated in `public/i18n.js`. Messages and listings are translated by Claude when `ANTHROPIC_API_KEY` is set; each message shows "Translated from … · Show original".
- **Routing:** each partner is assigned options in Admin → Partners. New requests for those options go to them; everything else lands in the admin inbox, where you can reply as the Marée concierge or reassign.

| File | |
| --- | --- |
| `server.js` | HTTP API, WebSocket server, routing, masking, notifications |
| `lib/store.js` | Database schema and queries |
| `lib/services.js` | Claude translation and Resend email |
| `public/catalog.js` | Categories, options, form questions, photos. Edit this to change what's offered |
| `public/shared.js` | API client, live connection, chat view |
| `public/staff.js` | Inbox shared by the partner portal and admin desk |
