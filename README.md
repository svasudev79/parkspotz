# parkspotz
Parking app repository

ParkSpotZ is a web app for finding and booking car parking in Bangalore. Customers search near a destination, book a slot, pay and get a receipt with a QR code; space owners list their parking, check QR codes at the entrance and track usage and revenue. The design is in [Solution-outline.md](Solution-outline.md) and the requirements in [Goal-spec.md](Goal-spec.md).

This runs on your own computer. It is not deployed anywhere yet; [DEPLOY.md](DEPLOY.md) describes how to deploy it (Vercel, Google Cloud Run, Neon).

## Layout

| Folder | What it is |
|--------|------------|
| `frontend/` | Next.js (App Router) + Tailwind web app, port 3000 |
| `backend/` | Express + TypeScript API, port 8080 |
| `backend/schema.sql` | Postgres schema |
| `backend/test/` | API tests |

The browser only talks to the frontend. Next.js forwards `/api/*` to the Express API (for example `/api/auth/login` reaches the API's `/auth/login`).

## Run locally

You need Node.js 24 and PostgreSQL 14 or newer. The steps below assume [Postgres.app](https://postgresapp.com), whose tools are in `/Applications/Postgres.app/Contents/Versions/latest/bin`.

### 1. Database (first time only)

The app keeps its own private Postgres inside this repo, in `.localdb/` (ignored by git), on port 5433 so it does not clash with another Postgres on 5432. Create it once, from the repo root:

```bash
export PATH=/Applications/Postgres.app/Contents/Versions/latest/bin:$PATH
initdb -D .localdb/data -U parkspotz --auth=trust -E UTF8
printf "port = 5433\nlisten_addresses = '127.0.0.1'\nunix_socket_directories = ''\n" >> .localdb/data/postgresql.conf
pg_ctl -D .localdb/data -l .localdb/postgres.log -w start
createdb -h 127.0.0.1 -p 5433 -U parkspotz parkspotz
createdb -h 127.0.0.1 -p 5433 -U parkspotz parkspotz_test
```

It accepts connections from this computer only, without a password, so use it for development data only. If `.localdb/` already exists, skip this step.

To use a different Postgres instead, create the two databases there and put its address in `DATABASE_URL` (step 2).

### 2. API (first time only: install and settings)

```bash
cd backend
npm install
cp .env.example .env      # then set JWT_SECRET (the file explains how)
```

### 3. Frontend (first time only: install and settings)

```bash
cd frontend
npm install
cp .env.example .env.local
```

### 4. Start everything

```bash
cd backend
npm run db:start          # start the repo-local Postgres
npm run db:setup          # create the tables; safe to run again
npm run db:seed           # add demo accounts, parking spaces and rental tiers; safe to run again
npm run admin:create      # create the platform admin from ADMIN_USERNAME / ADMIN_PASSWORD in .env
npm run dev               # API on http://localhost:8080
```

In a second terminal:

```bash
cd frontend
npm run dev               # web app on http://localhost:3000
```

Open http://localhost:3000. It opens on the search screen: you can search, book and pay as a guest without logging in. Or log in with a demo account:

| Role | Username | Password |
|------|----------|----------|
| Customer | `demo_customer` | `parkspotz-demo` |
| Space owner | `demo_owner` | `parkspotz-demo` |
| Gate attendant (at MG Road Metro Parking) | `demo_attendant` | `parkspotz-demo` |
| Platform admin | `admin` | in `backend/.env` as `ADMIN_PASSWORD` (see Platform admin below) |

These accounts exist only in your local database. You can also sign up new accounts.

Things to try: as the customer, search **MG Road Metro** within 1 km, open a space, book it and press **Pay** on the test payment screen to get a receipt. As the owner (use a private browser window to stay logged in as both), open **My spaces** and **Stats**, and open the link inside a receipt's QR code to check the booking.

To check that the frontend reaches the API and the database, open http://localhost:3000/api/health; it should show `{"status":"ok","db":"ok"}`.

### 5. Stop

Press Ctrl+C in both terminals, then:

```bash
cd backend
npm run db:stop
```

`db:start` and `db:stop` call Postgres.app's `pg_ctl`; edit them in `backend/package.json` if your Postgres tools live elsewhere.

## Seed data

`npm run db:seed` (in `backend/`) adds the demo accounts (owner, customer, and a gate attendant attached to MG Road Metro Parking) and ten parking spaces owned by `demo_owner`: four near MG Road Metro at different distances, and one each near Cubbon Park, Indiranagar, Koramangala Forum Mall, Majestic, Jayanagar 4th Block and Whitefield ITPL. It also adds the default rental tiers (Small 1–20 slots ₹500, Medium 21–100 ₹1,500, Large 101+ ₹3,000 per month) if there are none, and dates the ten demo spaces to last month so that they have rental invoices to look at (a space's first month is free). Apart from that one date on the demo spaces, it only adds what is missing and never changes or removes existing data.

## Settings

| File | Setting | Purpose |
|------|---------|---------|
| `backend/.env` | `DATABASE_URL` | Postgres connection string |
| `backend/.env` | `JWT_SECRET` | Signs the login cookie; any long random string |
| `backend/.env` | `PORT` | API port, default 8080 |
| `backend/.env` | `BOOKING_HOLD_MINUTES` | How long an unpaid booking keeps its slot, default 10 |
| `backend/.env` | `APP_BASE_URL` | Public address of the frontend, default `http://localhost:3000`. Receipt QR codes link to `<APP_BASE_URL>/verify/<token>` |
| `backend/.env` | `ENTRY_GRACE_MINUTES` | How many minutes before a booking starts its entry can be recorded at the gate, default 15 |
| `backend/.env` | `OVERSTAY_GRACE_MINUTES` | Free minutes after a booking's end before an overstay charge applies, default 10 |
| `backend/.env` | `OVERSTAY_BLOCK_MINUTES` | Overstay is billed in started blocks of this many minutes, default 30 |
| `backend/.env` | `OVERSTAY_RATE_PERCENT` | Overstay rate as a percentage of the space's hourly price, default 100 |
| `backend/.env` | `UPLOADS_DIR` | Folder for entry photos, default `backend/uploads` |
| `backend/.env` | `GUEST_MAX_PENDING` | How many unpaid bookings a guest browser, an IP address, and a mobile number may each hold at once, default 2 |
| `backend/.env` | `TRUST_PROXY_HOPS` | How many proxies in front of the API are trusted for the caller's address, default 1 (the Next.js `/api` forwarding) |
| `backend/.env` | `RENTAL_DUE_DAY` | Day of the month a rental invoice falls due, default 7 |
| `backend/.env` | `ADMIN_USERNAME`, `ADMIN_PASSWORD` | The platform admin login, read only by `npm run admin:create` |
| `backend/.env` | `DEMO_PASSWORD` | Password for the demo accounts made by `npm run db:seed`. Empty locally means the default below. If set and different, `db:seed` updates the existing demo accounts to it. A public deployment must set a long random one |
| `backend/.env` | `SEED_DEMO_DATA` | `false` makes `db:seed` add only the rental tiers, with no demo accounts or spaces. Default `true` |
| `backend/.env` | `PG_POOL_MAX` | Database connections kept open, default 5 |
| `backend/.env` | `PAYMENT_MODE` | `mock` or `razorpay` (see Payments) |
| `backend/.env` | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Razorpay test keys; only needed for `razorpay` mode |
| `frontend/.env.local` | `API_URL` | Where `/api/*` is forwarded, default `http://localhost:8080` |
| `frontend/.env.local` | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Maps key; may be left empty (see Google Maps key) |

Restart the API after changing `backend/.env`, and the frontend after changing `frontend/.env.local`.

`backend/.env` and `frontend/.env.local` hold secrets and are ignored by git. Never commit them.

### Google Maps key

The app works without a key: search results show as a list, and destinations and space locations are chosen from a built-in list of Bangalore landmarks (owners can also type latitude and longitude).

To turn the map on:

1. In Google Cloud Console, create an API key and enable **Maps JavaScript API** and **Places API (New)** for its project.
2. Put the key in `frontend/.env.local` as `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...`.
3. Restart the frontend.

The search screen then shows a map with a pin per parking space, the destination box becomes Google Places search, and the add-space form gets address search and a draggable pin. This key is visible to browsers by design, so restrict it in Google Cloud to your site's address.

### Payments

`PAYMENT_MODE` in `backend/.env` chooses how bookings are paid:

- `mock` (the default when no Razorpay keys are set): the app shows its own "Test payment" screen with **Pay** and **Fail the payment** buttons. No payment provider is contacted.
- `razorpay`: the API creates a Razorpay order and the browser opens Razorpay Checkout.

To use Razorpay in test mode:

1. In the Razorpay dashboard, switch to **Test mode** and generate an API key.
2. In `backend/.env` set `PAYMENT_MODE=razorpay`, `RAZORPAY_KEY_ID=rzp_test_...` and `RAZORPAY_KEY_SECRET=...`.
3. Restart the API. Pay with the test cards or test UPI IDs listed in Razorpay's documentation; no real money moves.

The key secret stays on the server; the API checks each payment's signature before confirming a booking.

Both modes use the same steps: booking a space holds a slot for `BOOKING_HOLD_MINUTES` as "awaiting payment", a verified payment confirms it, and a failed mock payment cancels it. A booking that is not paid within the hold time expires and its slot becomes free again.

### Platform admin

The admin is the person who runs ParkSpotZ. It is a separate login from a space owner and there is exactly one way to create it:

1. In `backend/.env` set `ADMIN_USERNAME` (for example `admin`) and `ADMIN_PASSWORD` to a long random value of at least 12 characters. One way to make one: `node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))"`.
2. Run `npm run admin:create` in `backend/`.

Run the same command again after changing `ADMIN_PASSWORD` to change the password. The script refuses short or guessable passwords and never prints the password. Nobody can sign up as an admin, and nothing in the app can turn another account into one.

### Monthly rental

Space owners pay ParkSpotZ a monthly fee for each listed space, set by its number of slots:

- **Tiers** are kept in the database and edited by the admin under Rental. They must start at 1 slot and continue without gaps or overlaps, and the last one has no upper limit.
- **Invoices.** Each listed space gets one invoice per calendar month (IST), for the fee of the tier its slot count is in when the invoice is made. Later tier changes do not alter existing invoices. The month a space is created in is free. An invoice falls due on the 7th (`RENTAL_DUE_DAY`); after that an unpaid invoice shows as overdue.
- **No background job.** Missing invoices are created whenever the admin dashboard or a rental page is opened, and by `npm run rental:generate`. Running it twice does nothing the second time.
- **Paying.** Owners pay from their Rental page with the same payment setup as bookings (`PAYMENT_MODE`), and get a receipt. Rental payments are stored separately from booking payments.
- **Non-payment is only flagged.** Overdue invoices are highlighted for the admin and the owner. Nothing is hidden, unlisted or blocked.

### Running the scripts against another database

`db:setup`, `db:seed`, `admin:create` and `rental:generate` work on whatever `DATABASE_URL` points at, and a value given on the command line wins over `backend/.env`. Each one first prints the host and database name it is about to change. If the host is not this computer it stops unless `CONFIRM_REMOTE=yes` is set, and the admin and demo passwords must then be given on the command line too, so a local password is never reused by accident. [DEPLOY.md](DEPLOY.md) shows the exact commands.

### Production safety checks

When `NODE_ENV=production` the API refuses to start if payments would be in `mock` mode, if `JWT_SECRET` is shorter than 32 characters, or if `APP_BASE_URL` is not an `https://` address. `GET /api/admin/diagnostics` (admin login needed) shows what a running deployment is using: payment mode, the caller's address as the API sees it, whether the photo folder is writable, and so on. It shows no secrets.

## Tests and checks

```bash
cd backend
npm test          # API tests (needs the database running: npm run db:start)
npm run build     # type-checks and compiles the API

cd frontend
npm run lint
npm run build
```

`npm test` runs the real API against the `parkspotz_test` database and checks the two booking rules most likely to break silently: two customers racing for the last slot (exactly one wins), and overlapping time windows (10:00–12:00 booked means 11:00–13:00 is refused and 12:00–14:00 is free). The tests empty the test database each run. They refuse to start unless the database name ends in `_test`, so they cannot touch your main data. Set `TEST_DATABASE_URL` to use a different test database.

## What the app does

- **Accounts.** Sign up as a customer or a space owner, log in, log out (username and password; the session is an httpOnly cookie). Each role is kept out of the other role's pages.
- **Guest mode.** The first screen is the search screen, with no login. Anyone can search, open a space, book and pay without an account by giving a name and an Indian mobile number at the confirm step (no OTP). The guest then lands on a private receipt link (`/receipt/<long random token>`) with the QR code, which works on any device without logging in and is kept out of search engines and referrers. The same browser lists its guest bookings under My bookings. All booking rules are the same as for customers.
- **Guest to customer.** When someone signs up or logs in as a customer in a browser that holds guest bookings, those bookings move to that account at that moment and appear under its My bookings. The old receipt links keep working.
- **Guests and the gate.** Owners and attendants see a guest's name with a "Guest" tag wherever a customer name appears. The guest's phone number is shown only on the check screen for that booking, to the space's owner and attendants. The admin sees only how many bookings came from guests.
- **Limits on guests.** A guest browser, an IP address, and a mobile number can each hold at most 2 unpaid bookings at a time (`GUEST_MAX_PENDING`); paying, cancelling or letting a hold expire frees a place. Logged-in customers are not limited.
- **Owners: spaces.** Add and edit parking spaces: name, address, location, type, ownership, number of slots, price per hour, opening hours, and whether the space is listed.
- **Customers: search.** Search near a destination within 500 m, 1 km or 2 km for a date, start time and duration. Results are sorted by distance and show the price and how many slots are free for that time. A space that is closed for the chosen time is still shown, marked "Closed at this time". The search is kept in the page address, so going back to it or reloading shows the same results.
- **Customers: booking and payment.** Book a space for the searched time (30 minutes to 24 hours, inside the space's opening hours, starting in the future) and pay. Two customers cannot take the same last slot.
- **Customers: receipt.** After payment the customer gets a receipt with a QR code, which can be printed or saved as a PDF. My bookings lists every booking with its status and receipt.
- **Checking a booking.** The QR code holds a link to `/verify/...`. Opened by the space's owner or one of its attendants, it shows whether the booking is valid (paid, and for their space) and whether its time is upcoming, current or over. A QR code only opens on a phone if `APP_BASE_URL` is an address the phone can reach; on one computer, copy the link instead.
- **Owners: usage and revenue.** Stats shows paid bookings, hours booked and revenue per space with a total, for a day, week (Monday to Sunday) or month. A booking is counted in the period its start time falls in, so a booking made today for tomorrow appears under tomorrow. Overstay charges collected at the gate (cash and UPI) are shown in their own column and are not part of booking revenue; waived charges are mentioned separately and not counted. My spaces also lists the paid bookings that start today.
- **Owners: gate attendants.** On a space's edit page the owner creates attendant logins for that space (username and password) and removes them. Attendants cannot sign up themselves. Removing an attendant deactivates the account, so it can no longer log in, while the vehicle log keeps showing who recorded each entry and exit.
- **Attendants: one space, no revenue.** An attendant sees only the one space they were created for: vehicles inside now, bookings expected today, and the vehicle history. They never see what customers paid, revenue or totals. The only amount they see is an individual vehicle's overstay charge, because they have to collect it.
- **Gate: entry and exit.** The receipt QR opens the check screen for the space's owner or its attendants (a booking can also be found by its `PSZ-…` reference). There they record the vehicle's entry, optionally with its number and a photo taken with the phone's camera, and later its exit. Entry can be recorded from 15 minutes before the booking starts until it ends, and only once per booking.
- **Gate: time left and overstay.** A vehicle that is inside shows a live countdown to its booked end time. After the end, the first 10 minutes are free; beyond that the whole overstay is billed from the booked end in started 30-minute blocks at the space's hourly price (₹40/hour: 11 to 30 minutes late costs ₹20, 31 to 60 minutes ₹40). The API works the charge out from its own clock when exit is recorded. If a charge is due, the attendant must say how it was settled (cash, UPI, or waived with a reason) before the exit is saved. There is no online collection of overstay.
- **Vehicle history.** Attendants (for their space) and owners (for each of their spaces) see the incoming and outgoing log by day: vehicle number, entry and exit times, who recorded them, any overstay and how it was settled, and the entry photo.
- **Customers: after the visit.** Once the vehicle has left, the receipt and My bookings show the entry and exit times and any overstay charge.
- **Entry photos.** Photos are shrunk in the browser (longest side 1600 px, JPEG) before upload, limited to 5 MB, accepted only if the file really is a JPEG, PNG or WebP, stored in `backend/uploads/` (ignored by git) under random names, and shown only to the space's owner and attendants.
- **Owners: rental.** A Rental page lists the monthly invoices for the owner's spaces with a Pay button and receipts, and My spaces shows a notice when something is due or overdue.
- **Admin: dashboard.** One login for the person running ParkSpotZ: how many spaces are onboarded (listed, not listed, added this month), how many owners, attendants and customers, slots managed in total and by rental tier, vehicles inside and slots booked right now, utilisation and bookings for today, this week and this month, and this month's rental invoiced, collected and outstanding.
- **Admin: spaces and rental.** A sortable table of every space (owner, slots, tier, bookings and utilisation this month, rental status), the rental tier editor, and the invoice list by month and status with overdue invoices highlighted.
- **Utilisation** is booked slot-hours divided by available slot-hours. Available = slots × daily opening hours × days in the period, for listed spaces, counted from the day a space was added. Booked = hours of paid bookings that fall inside the period.
- All times are entered and shown in IST.

## Known limitations

- **Not everything has been run with real keys.** Google Maps and Razorpay test payments were verified with real keys for customer bookings. Razorpay has not been run for rental invoices or for guest bookings (only the mock mode has), and the camera capture, QR scanning and printing have not been tried on a real phone.
- **Mock payment trusts the browser.** In `mock` mode anyone logged in as a customer can mark their own booking paid. Never use `mock` mode on a public deployment.
- **Bookings must start and end on the same IST day**, within the space's opening hours. Overnight bookings are not supported.
- **No background job for expiry.** An unpaid booking simply stops counting once it is older than the hold time; it stays in the database as an expired booking.
- **No payment webhook.** A Razorpay payment is confirmed only when the customer's browser returns from checkout.
- **No cancellations or refunds.**
- **Entry photos live on local disk** (`backend/uploads/`). A cloud deployment will need object storage instead, because most hosts do not keep local files between restarts.
- **Number plates and vehicle photos are personal data.** There is no retention policy yet: nothing deletes old visits or photos. Decide how long to keep them before using this with real customers.
- **Overstay is collected at the gate only** (cash or UPI, recorded by the attendant). The app does not take overstay payments online and does not check that the money was actually received.
- **A removed attendant's username stays taken**, because the account is deactivated and not deleted.
- **Guest phone numbers are not verified.** There is no OTP, so a guest can type any number.
- **A lost guest receipt link cannot be recovered** except from the browser that made the booking (My bookings), and only while that browser keeps its cookie (30 days). There is no way to look a guest booking up by phone number.
- **Guest names and phone numbers are personal data** with no retention policy yet, like number plates and photos.
- **Guest limits can be worked around.** Unpaid guest holds are capped per browser, per IP address and per mobile number. Clearing cookies avoids the first, and typing a different (unverified) number avoids the third. The IP limit depends on the proxies in front of the API: it takes the caller's address from `X-Forwarded-For`, trusting `TRUST_PROXY_HOPS` entries. Run locally with nothing in front of Next.js, a caller can forge that header. For a deployment, see the proxy section of [DEPLOY.md](DEPLOY.md).
- **No password reset and no login rate limiting.**
- **Rental has no auto-debit and no reminders.** Owners pay each invoice themselves; nobody is emailed or messaged.
- **Rental non-payment is flag-only.** An overdue invoice changes nothing about how the space works.
- **The admin cannot mark an invoice paid, cancel it or change its amount.**
- **No hosting-cost view yet.** Comparing rental income with what the platform costs to run is left for when it is deployed.
- **Spaces that are not listed are not invoiced**, so unlisting a space before the month starts avoids that month's fee.
- **Not deployed yet.** Everything runs locally; a phone can only use it if it can reach your computer. [DEPLOY.md](DEPLOY.md) is the runbook for putting it online; it has not been run.
