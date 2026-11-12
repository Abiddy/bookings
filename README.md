# Marée · Marina del Rey guest experiences

A phone-first booking app for hotel guests: browse things to do around the marina (sails, yacht charters, paddleboarding, bikes, picnics, flowers, dining), book a time and charge it to the room. A password-protected **Partner desk** shows gross bookings, your commission, the hotel's share and what's owed to each partner business.

## Run it locally

```bash
PARTNER_PASSWORD=dev npm start
# open http://localhost:3000
```

No dependencies to install. Node 18 or newer.

## Deploy on Railway

1. New project → Deploy from GitHub repo → this repo.
2. Add a **volume** mounted at `/data` so bookings survive redeploys.
3. Set variables:
   - `DATA_DIR=/data`
   - `PARTNER_PASSWORD=<choose a strong password>`
4. Settings → Networking → Generate domain.

## How it works

| Path | What it does |
| --- | --- |
| `public/index.html` | The guest app and Partner desk (single page) |
| `public/catalog.js` | Experiences, prices and add-ons. Edit this to add real partners |
| `server.js` | Serves the app and a small JSON API; stores data in `DATA_DIR/db.json` |

API:

- `POST /api/bookings`: create a booking. The server recalculates the price from the catalog.
- `GET /api/bookings?codes=A,B`: a guest's own bookings, by ticket code
- `POST /api/bookings/:code/cancel`: cancel
- `GET /api/partner/bookings`: all bookings (needs `Authorization: Bearer <PARTNER_PASSWORD>`)
- `GET /api/rates`, `PUT /api/rates`: commission rate and the hotel's share (PUT needs the password)

## Not built yet

- Real payments. "Card" is a placeholder; Stripe Connect would charge guests and split payouts between partner, operator and hotel.
- Text-message tickets, partner accounts, real photos.
