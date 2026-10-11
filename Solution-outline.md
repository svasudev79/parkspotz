# ParkSpotZ — Draft Solution Outline (Phase 1)

Draft based on [Goal-spec.md](Goal-spec.md). Scope is Phase 1 only: car parking, owner-managed spaces, responsive web, one developer, built in a single day (the spec allows two weekends).

## 1. What Phase 1 delivers

Two roles using one responsive web app:

| Role | Can do |
|------|--------|
| Driver | Sign up / log in, search a destination, see nearby parking spaces on a map and in a list with slots available, book a date/time/duration, pay, get a receipt with a QR code |
| Owner | Sign up / log in, onboard a parking space (slots, price, opening hours), see bookings, verify a QR code at entry, view day/week/month usage and revenue |

## 2. Architecture

```
Browser (desktop + mobile)
   │
   ▼
Next.js frontend (Vercel) ── Google Maps JS + Places Autocomplete
   │  REST / JSON, session cookie
   ▼
Express API (TypeScript, GCP Cloud Run)
   │                    │
   ▼                    ▼
Postgres (Cloud SQL)   Razorpay (test mode)
```

This is the same shape as the earlier scaffold (Next.js + Express + Postgres), so that code can be restored and extended rather than rewritten.

| Concern | Choice | Why |
|---------|--------|-----|
| Frontend | Next.js + Tailwind | Already scaffolded; responsive by default |
| Map and destination search | Google Maps JavaScript API + Places Autocomplete | Spec's success metric names a Google map view; Places turns a typed destination into lat/lng |
| API | Express + TypeScript | Already scaffolded |
| Database | Postgres | Relational data, transactional booking |
| Auth | Username + password, hashed with bcrypt, httpOnly session cookie (JWT) | Spec asks for username + password; avoids a third-party auth dependency |
| Payments | Razorpay in test mode | Supports UPI and cards in India; no real money moves in Phase 1 |
| QR code | `qrcode` npm package, rendered on the receipt page | No external service needed |

## 3. Data model

```
users
  id, username (unique), password_hash, role ('driver' | 'owner'), created_at

parking_spaces
  id, owner_id → users, name, address, lat, lng,
  space_type ('basement' | 'multilevel' | 'surface'),
  ownership  ('public' | 'private' | 'metro'),
  total_slots, price_per_hour, open_time, close_time,
  is_active, created_at

bookings
  id, user_id → users, space_id → parking_spaces,
  start_time, end_time, amount,
  status ('pending' | 'confirmed' | 'cancelled'),
  qr_token (unique, random), created_at

payments
  id, booking_id → bookings, provider_order_id, provider_payment_id,
  amount, status, created_at
```

Key design decisions:

- **Slots are a count, not individual records.** A space has `total_slots`; a booking reserves any one slot. Numbered slots can come in Phase 2.
- **Availability** for a time window = `total_slots` − bookings in `pending` or `confirmed` status whose time range overlaps the window.
- **No double booking.** Creating a booking runs in a transaction that locks the parking space row, recounts overlapping bookings, and inserts only if a slot is free.
- **Unpaid bookings expire.** A `pending` booking holds a slot for 10 minutes; after that it stops counting against availability, which releases the slot.
- **Times** are stored in UTC and displayed in IST.

## 4. Key flows

**Search**
1. Driver types a destination; Places Autocomplete returns its lat/lng.
2. Driver picks a radius (e.g. 500 m, 1 km, 2 km) and a date/time/duration.
3. API returns active spaces within the radius (Haversine distance in SQL), each with distance, price and slots available for that window.
4. Results are shown as map pins and as a list sorted by distance; the two views stay in sync.

**Book and pay**
1. Driver selects a space and confirms the time window; the API creates a `pending` booking and a Razorpay order.
2. Razorpay Checkout opens in the browser.
3. On success the API verifies the payment signature, then marks the booking `confirmed`.
4. Driver lands on the receipt page.

**Receipt and QR**
- Receipt shows space name, address, date, time window, amount, booking reference and a QR code.
- The QR encodes a verification URL containing the booking's random `qr_token`.
- The receipt is saved by the browser's print-to-PDF; it also stays available under "My bookings".

**Owner onboarding and operations**
1. Owner fills a form: name, address (Places Autocomplete, with a draggable map pin), type, ownership, number of slots, price per hour, opening and closing time.
2. Owner dashboard lists their spaces and today's bookings.
3. At entry the owner scans the driver's QR with a phone camera; it opens the verify page, which shows whether the booking is valid for that space and time.
4. Stats page shows bookings, hours booked and revenue by day, week and month.

## 5. API outline

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/auth/signup`, `/auth/login`, `/auth/logout` | Account and session |
| GET | `/auth/me` | Current user |
| GET | `/spaces?lat&lng&radius&start&end` | Nearby spaces with availability |
| GET | `/spaces/:id` | Space details |
| POST | `/spaces` | Owner creates a space |
| PATCH | `/spaces/:id` | Owner edits a space |
| GET | `/owner/spaces` | Owner's own spaces |
| GET | `/owner/stats?spaceId&period` | Usage and revenue |
| POST | `/bookings` | Create pending booking + payment order |
| POST | `/bookings/:id/confirm` | Verify payment, confirm booking |
| GET | `/bookings` | Driver's bookings |
| GET | `/bookings/:id` | Receipt data |
| GET | `/verify/:qrToken` | Owner checks a QR code |

Deferred from the one-day build: `POST /verify/:qrToken/check-in` (owner marks arrival) and `POST /webhooks/razorpay` (payment status backup).

## 6. Screens

- Login / Sign up (with driver or owner choice)
- Search: destination box, radius, time window, map + list
- Space details and booking form
- Payment (Razorpay Checkout overlay)
- Receipt with QR code
- My bookings
- Owner: my spaces, add / edit space
- Owner: QR verify
- Owner: usage and revenue stats

## 7. Build plan

Single-day build, about 10 hours of focused work. Each block is a time box: when it runs out, move on and come back only if there is time left at the end.

| # | Block | Time box | Done when |
|---|-------|----------|-----------|
| 0 | Setup: restore the scaffold, apply the new schema to a local Postgres, get a Google Maps API key and Razorpay test keys | 45 min | Frontend and API run locally and talk to each other |
| 1 | Auth: sign up, log in, log out, session cookie, driver/owner routing | 1 h | Both roles can log in and land on their own home screen |
| 2 | Owner onboarding: add-space form with address autocomplete, "my spaces" list | 1 h | An owner can list a space with slots, price and hours |
| 3 | Search: API with radius and availability; screen with destination box, map pins and list | 2 h | A driver sees nearby spaces with slots available on map and list |
| | **Checkpoint — every success metric in the spec is met (about 4 h 45 min in)** | | |
| 4 | Booking: space details, booking form, slot locking | 1 h 15 min | Booking the last slot twice is refused |
| 5 | Payment: Razorpay test checkout and confirmation | 1 h 15 min | A test payment turns a booking `confirmed` |
| 6 | Receipt with QR code; "My bookings" | 45 min | Receipt opens after payment and can be saved as PDF |
| 7 | Owner side: QR verify page and stats table (day / week / month) | 1 h | Owner sees revenue and can validate a QR |
| 8 | Mobile layout pass, seed a few Bangalore spaces, deploy | 1 h | App is reachable at a public URL on a phone |

Simplifications that make one day realistic:

- **No payment webhook.** Confirmation relies on the signature check when the driver returns from checkout.
- **No background job for expiry.** A `pending` booking older than 10 minutes is simply ignored when counting availability.
- **Stats as a plain table**, no charts.
- **QR verify shows valid / invalid only**; marking check-in is dropped.
- **Deploy last.** Everything is built and tested locally first, so a deployment problem cannot block feature work.

If the day runs short, cut from the bottom: deploy (demo locally), then block 7, then block 5 (mark bookings confirmed without payment). Blocks 0–3 are the part that must not slip, since they cover the spec's success metrics.

## 8. Proposed out of scope for Phase 1

The spec's "Out of Scope" section is empty; suggested entries:

- Bike parking, ParkSpotZ-managed spaces, native mobile app (already Phase 2)
- Real payouts to owners (test-mode payments only)
- Cancellations and refunds
- Extending a booking, overstay charges, dynamic pricing
- Individually numbered slots
- Owner identity or property verification
- Ratings, reviews, notifications (SMS / email / push)
- Password reset

## 9. Open questions

1. **Owner use case is cut off.** Section 3 of the spec ends at "…run day to day operations like being able to charge". What should owners be able to charge or do?
2. **Payments in Phase 1:** is test mode enough, or must real money be collected? Real collection needs a registered Razorpay account and a plan for paying owners.
3. **Pricing model:** flat price per hour only, or also daily rates and minimum durations?
4. **Booking rules:** how far ahead can a driver book, and is there a minimum or maximum duration?
5. **Can one account be both driver and owner?** The outline assumes a single role per account.
6. **Who can list a space?** The glossary mentions public and metro ownership; in Phase 1, is every listing created by a private owner, or will some be seeded by you?
7. **Hosting:** keep Vercel + Cloud Run + Cloud SQL from the earlier scaffold, or is a cheaper single-service setup acceptable?
