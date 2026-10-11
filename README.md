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

It accepts connections from this computer only, without a password, so use it for development data only. Start and stop it with:

```bash
pg_ctl -D .localdb/data -l .localdb/postgres.log -w start
pg_ctl -D .localdb/data stop
```

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
| `frontend/.env.local` | `API_URL` | Where `/api/*` is forwarded, default `http://localhost:8080`. Restart the frontend after changing it |
| `frontend/.env.local` | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Maps key; may be left empty |

`backend/.env` and `frontend/.env.local` hold secrets and are ignored by git. Never commit them.

### Checks

```bash
cd backend && npm run build                    # type-checks and compiles the API
cd frontend && npm run lint && npm run build   # lints and builds the web app
```
