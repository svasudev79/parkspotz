# ParkSpotZ — Draft Solution Outline (Phase 1)

Draft based on [Goal-spec.md](Goal-spec.md). Scope is Phase 1 only: car parking, owner-managed spaces, a responsive web app that works in desktop and mobile browsers, one developer, built in a single day (the spec allows two weekends).

## 1. What Phase 1 delivers

Two roles using one responsive web app, usable in desktop and mobile browsers. Anything beyond opening and using the site in a phone's browser (installing it, location, offline use, a store app) is Phase 2, described in section 10.

| Role | Can do |
|------|--------|
| Customer | Sign up / log in, search a destination, see nearby parking spaces on a map and in a list with slots available, book a date/time/duration, pay, get a receipt with a QR code |
| Owner | Sign up / log in, onboard a parking space (slots, price, opening hours), see bookings, verify a QR code at entry, view day/week/month usage and revenue |

## 2. Architecture

```
Desktop browser · mobile browser
   │
   ▼
Next.js frontend (Vercel) ── Google Maps JS + Places Autocomplete
   │  /api/* forwarded by Next.js, so the browser only ever talks to one site
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
| API routing | Next.js rewrites `/api/*` to the Express API | Frontend and API live on different domains; iPhone Safari blocks login cookies across domains, so without this the site would not log in from an iPhone browser |

## 3. Data model

```
users
  id, username (unique), password_hash, role ('customer' | 'owner'), created_at

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
1. Customer types a destination; Places Autocomplete returns its lat/lng.
2. Customer picks a radius (e.g. 500 m, 1 km, 2 km) and a date/time/duration.
3. API returns active spaces within the radius (Haversine distance in SQL), each with distance, price and slots available for that window.
4. Results are shown as map pins and as a list sorted by distance; the two views stay in sync.

**Book and pay**
1. Customer selects a space and confirms the time window; the API creates a `pending` booking and a Razorpay order.
2. Razorpay Checkout opens in the browser.
3. On success the API verifies the payment signature, then marks the booking `confirmed`.
4. Customer lands on the receipt page.

**Receipt and QR**
- Receipt shows space name, address, date, time window, amount, booking reference and a QR code.
- The QR encodes a verification URL containing the booking's random `qr_token`.
- The receipt is saved by the browser's print-to-PDF; it also stays available under "My bookings".

**Owner onboarding and operations**
1. Owner fills a form: name, address (Places Autocomplete, with a draggable map pin), type, ownership, number of slots, price per hour, opening and closing time.
2. Owner dashboard lists their spaces and today's bookings.
3. At entry the owner scans the customer's QR with a phone camera; it opens the verify page, which shows whether the booking is valid for that space and time.
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
| GET | `/bookings` | Customer's bookings |
| GET | `/bookings/:id` | Receipt data |
| GET | `/verify/:qrToken` | Owner checks a QR code |

Deferred from the one-day build: `POST /verify/:qrToken/check-in` (owner marks arrival) and `POST /webhooks/razorpay` (payment status backup).

## 6. Screens

- Login / Sign up (with customer or owner choice)
- Search: destination box, radius, time window, map + list
- Space details and booking form
- Payment (Razorpay Checkout overlay)
- Receipt with QR code
- My bookings
- Owner: my spaces, add / edit space
- Owner: QR verify
- Owner: usage and revenue stats

Every screen is responsive: at phone width the layout becomes a single column, with the map above the results list on the search screen and controls large enough to tap.

## 7. Build plan

Single-day build, about 10 hours of focused work. Each block is a time box: when it runs out, move on and come back only if there is time left at the end.

| # | Block | Time box | Done when |
|---|-------|----------|-----------|
| 0 | Setup: restore the scaffold, apply the new schema to a local Postgres, get a Google Maps API key and Razorpay test keys | 45 min | Frontend and API run locally and talk to each other |
| 1 | Auth: sign up, log in, log out, session cookie, customer/owner routing | 1 h | Both roles can log in and land on their own home screen |
| 2 | Owner onboarding: add-space form with address autocomplete, "my spaces" list | 1 h | An owner can list a space with slots, price and hours |
| 3 | Search: API with radius and availability; screen with destination box, map pins and list | 2 h | A customer sees nearby spaces with slots available on map and list |
| | **Checkpoint — every success metric in the spec is met (about 4 h 45 min in)** | | |
| 4 | Booking: space details, booking form, slot locking | 1 h 15 min | Booking the last slot twice is refused |
| 5 | Payment: Razorpay test checkout and confirmation | 1 h 15 min | A test payment turns a booking `confirmed` |
| 6 | Receipt with QR code; "My bookings" | 45 min | Receipt opens after payment and can be saved as PDF |
| 7 | Owner side: QR verify page and stats table (day / week / month) | 1 h | Owner sees revenue and can validate a QR |
| 8 | Responsive pass at phone width, seed a few Bangalore spaces, deploy | 1 h | App opens and works in a phone's browser at its public URL |

Simplifications that make one day realistic:

- **No payment webhook.** Confirmation relies on the signature check when the customer returns from checkout.
- **No background job for expiry.** A `pending` booking older than 10 minutes is simply ignored when counting availability.
- **Stats as a plain table**, no charts.
- **QR verify shows valid / invalid only**; marking check-in is dropped.
- **Deploy last.** Everything is built and tested locally first, so a deployment problem cannot block feature work.

Check each screen at phone width as it is built, so block 8 is a tidy-up and not a rewrite.

If the day runs short, cut from the bottom: deploy (demo locally, using the browser's phone-width view), then block 7, then block 5 (mark bookings confirmed without payment). Blocks 0–3 are the part that must not slip, since they cover the spec's success metrics.

## 8. Test plan

Run after block 8 of the build plan, and run the walkthrough once more at the checkpoint after block 3 (steps 1-5 only).

### 8.1 End-to-end walkthrough

Use two browser windows, one normal and one private, to be logged in as an owner and a customer at the same time. Start from seed data: a few Bangalore parking spaces near one known destination (e.g. MG Road metro).

| # | As | Do | Expect |
|---|----|----|--------|
| 1 | Owner | Sign up, log in | Lands on owner home |
| 2 | Owner | Add a space near the destination: 2 slots, ₹40/hour, 08:00–22:00 | Appears in "my spaces" |
| 3 | Customer | Sign up, log in | Lands on search |
| 4 | Customer | Search the destination, 1 km radius, tomorrow 10:00 for 2 hours | New space shows on map and list with "2 slots available" |
| 5 | Customer | Shrink the radius to 500 m, then search a far-away destination | Space drops out when out of range |
| 6 | Customer | Book it and pay with a Razorpay test card or test UPI ID | Booking becomes `confirmed`; receipt opens showing ₹80 and a QR code |
| 7 | Customer | Repeat the same search | Now "1 slot available" |
| 8 | Customer | Save the receipt as PDF; open "My bookings" | Booking is listed and the receipt reopens |
| 9 | Owner | Open the QR's verify link | Booking shows as valid |
| 10 | Owner | Open stats | 1 booking, 2 hours, ₹80 for the day |

Steps 1–5 cover every success metric in the spec. Steps 6–10 cover booking and payment.

### 8.2 Targeted checks

| Rule | Test | Expect |
|------|------|--------|
| Last slot | Set a space to 1 slot; two customers book the same window | Second booking is refused |
| Overlap | With the slot booked 10:00–12:00, search 11:00–13:00, then 12:00–14:00 | 0 available, then 1 available |
| Abandoned payment | Start a booking and close the Razorpay window without paying | Slot is held, then free again after 10 minutes |
| Failed payment | Use Razorpay's test failure option | Booking does not become `confirmed` |
| Opening hours | Book outside 08:00–22:00 | Rejected |
| Mobile browser | Repeat walkthrough steps 3–8 in a phone's browser at the deployed URL (Android Chrome; iPhone Safari if available) | Pages load, login persists, no sideways scrolling, payment and receipt work |
| Access control | Customer opens an owner page; owner requests another owner's stats; open a made-up QR token | Refused, refused, shown as invalid |

### 8.3 Practical notes

- **Payments cost nothing.** In Razorpay test mode no real money moves; Razorpay's documentation lists the test card numbers and UPI IDs.
- **QR scanning needs a reachable URL.** The QR encodes a link and a phone cannot open `localhost`. Test scanning after deploying, or paste the verify link into the browser while running locally.
- **Time-dependent cases** such as the 10-minute hold are quicker to test with the hold temporarily set to 1 minute.

### 8.4 Automation

Given the one-day budget, automate only the two rules most likely to break silently later: the last-slot check and the overlap check, as API tests. The walkthrough stays manual (or is driven through the browser by Claude) and can become a Playwright test in Phase 2.

## 9. Proposed out of scope for Phase 1

The spec's "Out of Scope" section is empty; suggested entries:

- Bike parking and ParkSpotZ-managed spaces (already Phase 2)
- Everything in section 10: installing to the home screen, "use my location", "Navigate" button, offline receipt, phone-specific layouts, store-listed app
- In-app QR scanner
- Real payouts to owners (test-mode payments only)
- Cancellations and refunds
- Extending a booking, overstay charges, dynamic pricing
- Individually numbered slots
- Owner identity or property verification
- Ratings, reviews, notifications (SMS / email / push)
- Password reset

## 10. Phase 2: mobile

Not part of today's build. Phase 1 already opens and works in a phone's browser; this section is the plan for going further, in two steps: first make the site installable to the home screen as a progressive web app (PWA) with phone-specific features, then, if needed, a store-listed app (section 10.4).

### 10.1 What gets added to Phase 1

| Area | Change | Why it matters on a phone |
|------|--------|---------------------------|
| Layout | Search screen becomes a full-screen map with the results list in a pull-up sheet; bottom navigation bar; buttons and inputs at least 44 px tall | One-handed use; map and list cannot sit side by side on a narrow screen |
| Location | "Use my location" button next to the destination box (browser geolocation) | Most customers search for parking near where they are or are heading right now |
| Directions | "Navigate" button on the space details and receipt, opening Google Maps with the space as destination | Hands the customer to turn-by-turn navigation |
| Receipt offline | Service worker caches the receipt page and its QR code once viewed | Basement and multilevel parking often has no signal at the entry gate |
| Install | Web app manifest (name, icons, theme colour, standalone display) | Home-screen icon; opens without browser address bar |
| Payment | Razorpay Checkout's mobile flow, which can hand off to an installed UPI app | UPI is the default way to pay on a phone in India |

The data model does not change. The only API change is accepting the session token in a header as well as a cookie (section 10.4).

### 10.2 Screens on a phone

- **Search:** destination box and "use my location" at the top, map behind, results in a sheet that pulls up from the bottom; tapping a pin scrolls the sheet to that space.
- **Space details:** price, slots available and the booking form on one scrolling page, with the "Book and pay" button fixed at the bottom.
- **Receipt:** QR code large enough to scan from another phone, with "Navigate" below it.
- **Bottom bar:** Search and My bookings for customers; My spaces, Stats for owners.
- **Owner forms and stats:** single-column; the stats table scrolls sideways inside its own box.

### 10.3 Platform limits to know about

- **Android (Chrome):** shows an "Install app" prompt; everything above works.
- **iPhone (Safari):** installs through Share → "Add to Home Screen", with no automatic prompt. Geolocation, offline receipt and payment work.
- **HTTPS is required** for geolocation, installation and the service worker, which the Phase 1 deployment already provides.
- **Not available without a native app:** app store listing and reliable push notifications on every device.

### 10.4 Path to a store-listed app (Phase 2)

1. **Wrap the existing web app** with Capacitor (or a Trusted Web Activity on Android) to publish it on Google Play and the App Store. Lowest effort; reuses all Phase 1 screens.
2. **Rebuild the screens in React Native (Expo)** only if the wrapped app feels limiting. The Express API is reused unchanged.

To keep both options open, Phase 1 holds to one rule: all business logic stays in the API and never in page code. A native app will also need the API to accept the session token in an `Authorization` header, since native apps do not use browser cookies; that is added in Phase 2.

### 10.5 Mobile test plan

Run on a real phone against the deployed URL; Android Chrome first, iPhone Safari if one is available.

| Check | Test | Expect |
|-------|------|--------|
| Layout | Repeat walkthrough steps 3–8 (section 8.1) on the phone | No sideways scrolling; every button reachable with a thumb |
| Location allowed | Tap "use my location" and allow | Map centres on the current position and lists nearby spaces |
| Location refused | Tap "use my location" and deny | Clear message; typing a destination still works |
| Install | Install to the home screen and open from the icon | Opens full screen with the ParkSpotZ icon and name |
| Offline receipt | View a receipt, switch to airplane mode, reopen it from My bookings | Receipt and QR code still display |
| Navigate | Tap "Navigate" on a receipt | Google Maps opens with the space as destination |
| QR between phones | Show the receipt on one phone, scan it with another phone's camera | Verify page opens and shows the booking as valid |
| Payment | Pay using Razorpay's test UPI ID on the phone | Returns to the app with the booking confirmed |

## 11. Open questions

1. **Owner use case is cut off.** Section 3 of the spec ends at "…run day to day operations like being able to charge". What should owners be able to charge or do?
2. **Payments in Phase 1:** is test mode enough, or must real money be collected? Real collection needs a registered Razorpay account and a plan for paying owners.
3. **Pricing model:** flat price per hour only, or also daily rates and minimum durations?
4. **Booking rules:** how far ahead can a customer book, and is there a minimum or maximum duration?
5. **Can one account be both customer and owner?** The outline assumes a single role per account.
6. **Who can list a space?** The glossary mentions public and metro ownership; in Phase 1, is every listing created by a private owner, or will some be seeded by you?
7. **Mobile (Phase 2):** is an installable web app enough, or is a Play Store / App Store listing the goal?
8. **Hosting:** keep Vercel + Cloud Run + Cloud SQL from the earlier scaffold, or is a cheaper single-service setup acceptable?
