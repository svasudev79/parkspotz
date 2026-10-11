# parkspotz
Parking app repository

ParkSpotZ is a web app for finding and booking car parking in Bangalore. Drivers search near a destination, book a slot and pay; space owners list their parking and track usage. The design is in [Solution-outline.md](Solution-outline.md) and the requirements in [Goal-spec.md](Goal-spec.md).

## Layout

| Folder | What it is |
|--------|------------|
| `frontend/` | Next.js (App Router) + Tailwind web app, port 3000 |
| `backend/` | Express + TypeScript API, port 8080 |
| `backend/schema.sql` | Postgres schema |

The browser only talks to the frontend. Next.js forwards `/api/*` to the Express API (for example `/api/auth/login` reaches the API's `/auth/login`).

## Run locally

You need Node.js 24 and PostgreSQL 14 or newer.

### 1. Database

The app needs one Postgres database it can log in to. Either use your own Postgres, or start a private one inside this repo (kept in `.localdb/`, which git ignores). With Postgres.app installed, its tools are in `/Applications/Postgres.app/Contents/Versions/latest/bin`; add that folder to your `PATH` first.

One-time creation of the repo-local Postgres, on port 5433 so it does not clash with another Postgres on 5432:

```bash
initdb -D .localdb/data -U parkspotz --auth=trust -E UTF8
printf "port = 5433\nlisten_addresses = '127.0.0.1'\nunix_socket_directories = ''\n" >> .localdb/data/postgresql.conf
pg_ctl -D .localdb/data -l .localdb/postgres.log -w start
createdb -h 127.0.0.1 -p 5433 -U parkspotz parkspotz
```

It accepts connections from this computer only, without a password, so use it for development data only. Start it before running the app and stop it when you are done:

```bash
cd backend
npm run db:start
npm run db:stop
```

These two scripts call Postgres.app's `pg_ctl` at `/Applications/Postgres.app/Contents/Versions/latest/bin`; edit them in `backend/package.json` if your Postgres tools live elsewhere.

### 2. API

```bash
cd backend
npm install
cp .env.example .env      # then set JWT_SECRET (the file explains how) and check DATABASE_URL
npm run db:setup          # creates the tables; safe to run again
npm run dev               # http://localhost:8080
```

### 3. Frontend

In a second terminal:

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev               # http://localhost:3000
```

Open http://localhost:3000. To check that the frontend reaches the API and the database, open http://localhost:3000/api/health; it should show `{"status":"ok","db":"ok"}`.

### Settings

| File | Setting | Purpose |
|------|---------|---------|
| `backend/.env` | `DATABASE_URL` | Postgres connection string |
| `backend/.env` | `JWT_SECRET` | Signs the login cookie; any long random string |
| `backend/.env` | `PORT` | API port, default 8080 |
| `backend/.env` | `BOOKING_HOLD_MINUTES` | How long an unpaid booking keeps its slot, default 10 |
| `frontend/.env.local` | `API_URL` | Where `/api/*` is forwarded, default `http://localhost:8080`. Restart the frontend after changing it |
| `frontend/.env.local` | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Maps key; may be left empty (see below). Restart the frontend after changing it |

`backend/.env` and `frontend/.env.local` hold secrets and are ignored by git. Never commit them.

### Checks

```bash
cd backend && npm run build                    # type-checks and compiles the API
cd frontend && npm run lint && npm run build   # lints and builds the web app
```

### Google Maps key

The app works without a key: search results show as a list, and destinations and space locations are chosen from a built-in list of Bangalore landmarks (owners can also type latitude and longitude).

With a key in `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, the search screen shows a map with a pin per parking space, the destination box becomes Google Places search, and the add-space form gets address search and a draggable pin. In Google Cloud the key needs **Maps JavaScript API** and **Places API (New)** enabled.

## What works so far

- Sign up as a driver or a space owner, log in, log out (username and password; the session is an httpOnly cookie).
- Drivers land on Find parking (`/search`), owners on My spaces (`/owner/spaces`). Visitors who are not logged in are sent to the login page, and each role is kept out of the other role's pages.
- Owners add and edit parking spaces: name, address, location, type, ownership, number of slots, price per hour, opening hours, and whether the space is listed.
- Drivers search near a destination within 500 m, 1 km or 2 km for a date, start time and duration. Results are sorted by distance and show the price and how many slots are free for that time. A space that is closed for the chosen time is still shown, marked "Closed at this time".
- Each result opens a space details page. Booking and payment are not built yet.
- All times are entered and shown in IST.
