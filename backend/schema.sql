-- ParkSpotZ Postgres schema (Solution-outline.md, section 3).
-- Safe to run repeatedly: `npm run db:setup` applies this file.
-- All timestamps are stored in UTC (timestamptz) and displayed in IST.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('customer', 'owner', 'attendant')),
  -- false once an owner removes an attendant: the account can no longer log in
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS parking_spaces (
  id             SERIAL PRIMARY KEY,
  owner_id       INTEGER NOT NULL REFERENCES users(id),
  name           TEXT NOT NULL,
  address        TEXT NOT NULL,
  lat            DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng            DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
  space_type     TEXT NOT NULL CHECK (space_type IN ('basement', 'multilevel', 'surface')),
  ownership      TEXT NOT NULL CHECK (ownership IN ('public', 'private', 'metro')),
  total_slots    INTEGER NOT NULL CHECK (total_slots > 0),
  price_per_hour NUMERIC(10, 2) NOT NULL CHECK (price_per_hour >= 0),
  -- Daily opening hours, as IST wall-clock times.
  open_time      TIME NOT NULL,
  close_time     TIME NOT NULL,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (close_time > open_time)
);

CREATE INDEX IF NOT EXISTS idx_parking_spaces_owner ON parking_spaces (owner_id);

CREATE TABLE IF NOT EXISTS bookings (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  space_id   INTEGER NOT NULL REFERENCES parking_spaces(id),
  start_time TIMESTAMPTZ NOT NULL,
  end_time   TIMESTAMPTZ NOT NULL,
  amount     NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  qr_token   TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_bookings_space_time ON bookings (space_id, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings (user_id);

CREATE TABLE IF NOT EXISTS payments (
  id                  SERIAL PRIMARY KEY,
  booking_id          INTEGER NOT NULL REFERENCES bookings(id),
  provider_order_id   TEXT UNIQUE NOT NULL,
  provider_payment_id TEXT,
  amount              NUMERIC(10, 2) NOT NULL,
  status              TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments (booking_id);

-- ---------------------------------------------------------------------------
-- Gate attendants and the vehicle log.
-- Everything below is additive, so it also upgrades a database created by an
-- earlier version of this file without touching existing rows.
-- ---------------------------------------------------------------------------

-- Allow the 'attendant' role on databases whose users table predates it.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('customer', 'owner', 'attendant'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- An attendant works at exactly one parking space; a space may have several.
CREATE TABLE IF NOT EXISTS space_attendants (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  space_id   INTEGER NOT NULL REFERENCES parking_spaces(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_space_attendants_space ON space_attendants (space_id);

-- One row per vehicle visit. A booking can be used for one visit only
-- (booking_id is unique), which also makes recording entry race-safe.
CREATE TABLE IF NOT EXISTS visits (
  id             SERIAL PRIMARY KEY,
  space_id       INTEGER NOT NULL REFERENCES parking_spaces(id),
  booking_id     INTEGER NOT NULL UNIQUE REFERENCES bookings(id),
  vehicle_number TEXT,
  entry_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  entry_by       INTEGER NOT NULL REFERENCES users(id),
  -- File name of the entry photo inside the uploads folder, if one was taken.
  entry_photo    TEXT,
  exit_at        TIMESTAMPTZ,
  exit_by        INTEGER REFERENCES users(id),
  CHECK (exit_at IS NULL OR exit_at >= entry_at)
);

CREATE INDEX IF NOT EXISTS idx_visits_space_entry ON visits (space_id, entry_at);
