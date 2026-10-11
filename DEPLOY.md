# Deploying ParkSpotZ

A runbook for putting ParkSpotZ on the public internet with this setup:

| Part | Where it runs |
|------|---------------|
| Website (`frontend/`, Next.js) | Vercel |
| API (`backend/`, Express, container from `backend/Dockerfile`) | Google Cloud Run |
| Database | Neon (hosted Postgres), reached with an ordinary `DATABASE_URL` |
| Entry photos | A Cloud Storage bucket, mounted into the API container as a folder |
| Payments | Razorpay, **test** keys |
| Map and place search | Google Maps Platform |

The browser only ever talks to the Vercel site. Vercel forwards `/api/*` to the Cloud Run service.

Nothing in this file has been run yet: it was written from the code and from how these services are documented to work. Follow the checklist in section 8 after deploying, and expect to adjust small things.

Placeholders are written like `<PROJECT_ID>`. Never put real keys or passwords in this file or anywhere in git.

**Steps marked 👤 need the account owner to sign in themselves** (creating accounts, accepting terms, adding a payment method, reading secrets). They cannot be done on your behalf.

---

## 1. Before you start

👤 You need accounts for: Google Cloud (with billing enabled on the project), Vercel, Neon, Razorpay, and GitHub access to this repository.

On your computer: Node.js 24, Docker Desktop (running), and the `gcloud` command line tool, signed in (`gcloud auth login`) with the project selected (`gcloud config set project <PROJECT_ID>`).

Choose now, and write down somewhere private (a password manager, not a file in this repo):

| Value | How to make it |
|-------|----------------|
| `JWT_SECRET` | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `ADMIN_PASSWORD` | `node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))"` |
| `DEMO_PASSWORD` | the same command again (a different value) |

The local demo password in the README is public. The production site must use its own `DEMO_PASSWORD`; the seed script refuses the public one for a remote database.

Suggested region for everything: Mumbai (`asia-south1` on Google Cloud; pick the nearest AWS region Neon offers).

---

## 2. Database (Neon)

1. 👤 In Neon, create a project and a database. Neon shows two connection strings:
   - the **direct** one (host like `ep-xxxx.<region>.aws.neon.tech`), and
   - the **pooled** one (host contains `-pooler`).

   Both end in `?sslmode=require`. Use the **direct** string for the one-off scripts below and the **pooled** string for the running API.

2. From `backend/` on your computer, create the tables and seed data. Put the connection string in the command's environment; do not edit `backend/.env`. Each script prints the host and database name it is about to change, and refuses a remote database without `CONFIRM_REMOTE=yes`.

   ```bash
   cd backend
   npm install

   # so the secrets do not end up in your shell history, read them in first:
   read -s DATABASE_URL    # paste the DIRECT Neon connection string, press Enter
   read -s DEMO_PASSWORD
   read -s ADMIN_PASSWORD
   export DATABASE_URL DEMO_PASSWORD ADMIN_PASSWORD

   CONFIRM_REMOTE=yes npm run db:setup          # creates the tables; safe to repeat
   CONFIRM_REMOTE=yes npm run db:seed           # demo accounts, ten demo spaces, rental tiers
   CONFIRM_REMOTE=yes ADMIN_USERNAME=admin npm run admin:create
   CONFIRM_REMOTE=yes npm run rental:generate   # optional; pages do this on demand

   unset DATABASE_URL DEMO_PASSWORD ADMIN_PASSWORD
   ```

   Check the first line each script prints: it must name the Neon host, not `127.0.0.1`.

   To start without demo data, run the seed as `SEED_DEMO_DATA=false CONFIRM_REMOTE=yes npm run db:seed` (rental tiers only; no `DEMO_PASSWORD` needed).

Notes:

- `sslmode=require` works as is. The database driver prints a notice that it treats `require` as full certificate verification; that is fine with Neon. Writing `sslmode=verify-full` silences the notice.
- The API uses no session-level database features (no `LISTEN`, advisory locks or `SET`), and its row and table locks are always inside one transaction, so the pooled endpoint is safe for it.
- The API keeps at most `PG_POOL_MAX` connections open (default 5).
- A free Neon database goes to sleep when idle. The first request afterwards takes a few seconds while it wakes.

---

## 3. Bucket for entry photos (Cloud Storage)

```bash
gcloud storage buckets create gs://<BUCKET_NAME> \
  --location=asia-south1 --uniform-bucket-level-access --public-access-prevention
```

Keep the bucket private (the command above enforces that). Photos are only ever served by the API after it has checked who is asking.

Create a service account for the API and let it read and write that bucket:

```bash
gcloud iam service-accounts create parkspotz-api --display-name="ParkSpotZ API"
gcloud storage buckets add-iam-policy-binding gs://<BUCKET_NAME> \
  --member="serviceAccount:parkspotz-api@<PROJECT_ID>.iam.gserviceaccount.com" \
  --role="roles/storage.objectUser"
```

---

## 4. API (Cloud Run)

### 4.1 Secrets

Store the secret values in Secret Manager, not as plain environment variables. 👤 You type or paste the values yourself:

```bash
gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com

for name in parkspotz-database-url parkspotz-jwt-secret parkspotz-razorpay-key-secret; do
  printf "Value for %s: " "$name"; read -s value; echo
  printf "%s" "$value" | gcloud secrets create "$name" --data-file=-
  gcloud secrets add-iam-policy-binding "$name" \
    --member="serviceAccount:parkspotz-api@<PROJECT_ID>.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
unset value
```

Use the **pooled** Neon connection string for `parkspotz-database-url`.

### 4.2 Build and push the image

Cloud Run needs a `linux/amd64` image (a Mac with Apple silicon builds `arm64` unless told otherwise):

```bash
gcloud artifacts repositories create parkspotz --repository-format=docker --location=asia-south1
gcloud auth configure-docker asia-south1-docker.pkg.dev

IMAGE=asia-south1-docker.pkg.dev/<PROJECT_ID>/parkspotz/api:$(git rev-parse --short HEAD)
docker build --platform linux/amd64 -t "$IMAGE" backend
docker push "$IMAGE"
```

The image contains the compiled API and its production dependencies. It has no `.env` file, no tests and no uploads, and it runs as a non-root user.

### 4.3 Deploy

The first deployment needs the website's address for `APP_BASE_URL`, which you do not have yet. Deploy with a placeholder such as `https://example.invalid`, then set the real one in step 6.

```bash
gcloud run deploy parkspotz-api \
  --image "$IMAGE" \
  --region asia-south1 \
  --allow-unauthenticated \
  --service-account parkspotz-api@<PROJECT_ID>.iam.gserviceaccount.com \
  --execution-environment gen2 \
  --add-volume name=uploads,type=cloud-storage,bucket=<BUCKET_NAME> \
  --add-volume-mount volume=uploads,mount-path=/mnt/uploads \
  --set-secrets DATABASE_URL=parkspotz-database-url:latest,JWT_SECRET=parkspotz-jwt-secret:latest,RAZORPAY_KEY_SECRET=parkspotz-razorpay-key-secret:latest \
  --set-env-vars PAYMENT_MODE=razorpay,RAZORPAY_KEY_ID=<RAZORPAY_TEST_KEY_ID>,APP_BASE_URL=https://example.invalid,UPLOADS_DIR=/mnt/uploads,TRUST_PROXY_HOPS=2,APP_VERSION=$(git rev-parse --short HEAD) \
  --min-instances 0 --max-instances 2 --memory 512Mi
```

`--allow-unauthenticated` is needed because Vercel calls the API over the public internet; the API does its own login checks. Note the service URL that the command prints (`https://parkspotz-api-xxxx.a.run.app`).

Every setting the API reads:

| Name | Purpose | Secret? | Example / placeholder |
|------|---------|---------|-----------------------|
| `DATABASE_URL` | Postgres connection string (Neon pooled endpoint) | **Yes** | `postgres://<user>:<password>@<host>-pooler.<region>.aws.neon.tech/<db>?sslmode=require` |
| `JWT_SECRET` | Signs login and guest cookies; at least 32 characters | **Yes** | 96 random hex characters |
| `RAZORPAY_KEY_SECRET` | Razorpay test key secret | **Yes** | from the Razorpay dashboard |
| `RAZORPAY_KEY_ID` | Razorpay test key id (sent to browsers by design) | No | `rzp_test_...` |
| `PAYMENT_MODE` | Must be `razorpay`. The API refuses to start in production with `mock` | No | `razorpay` |
| `APP_BASE_URL` | Public `https://` address of the website; receipt QR codes link to it | No | `https://<your-site>.vercel.app` |
| `UPLOADS_DIR` | Folder for entry photos; the bucket's mount path | No | `/mnt/uploads` |
| `TRUST_PROXY_HOPS` | Proxies in front of the API whose client address is trusted (section 7) | No | `2` |
| `PG_POOL_MAX` | Database connections kept open; default 5 | No | `5` |
| `APP_VERSION` | Label shown by the diagnostics page | No | a git commit |
| `BOOKING_HOLD_MINUTES` | Unpaid booking hold; default 10 | No | `10` |
| `ENTRY_GRACE_MINUTES` | Entry allowed this long before a booking starts; default 15 | No | `15` |
| `OVERSTAY_GRACE_MINUTES`, `OVERSTAY_BLOCK_MINUTES`, `OVERSTAY_RATE_PERCENT` | Overstay rule; defaults 10, 30, 100 | No | |
| `GUEST_MAX_PENDING` | Unpaid guest holds per browser, address and phone; default 2 | No | `2` |
| `RENTAL_DUE_DAY` | Day of the month rental falls due; default 7 | No | `7` |
| `NODE_ENV` | Set to `production` by the image. Do not override | No | |
| `PORT` | Set by Cloud Run. Do not set | No | |

`ADMIN_USERNAME`, `ADMIN_PASSWORD`, `DEMO_PASSWORD`, `SEED_DEMO_DATA` and `CONFIRM_REMOTE` are used only by the scripts in section 2. Do not give them to the Cloud Run service.

With `NODE_ENV=production` the API will not start if `PAYMENT_MODE` resolves to `mock`, if `JWT_SECRET` is shorter than 32 characters, or if `APP_BASE_URL` is not an `https://` address. If a deployment fails to become ready, read the service's logs; the reason is printed there.

Check it is up: open `https://<CLOUD_RUN_URL>/health`. It should show `{"status":"ok","db":"ok"}`.

---

## 5. Website (Vercel)

1. 👤 In Vercel, import the GitHub repository as a new project.
2. Set **Root Directory** to `frontend`. Framework: Next.js (detected). Leave the build and output settings alone.
3. Add these environment variables (Production, and Preview if you use previews) **before** the first build:

   | Name | Purpose | Secret? | Value |
   |------|---------|---------|-------|
   | `API_URL` | Where `/api/*` is forwarded and where server-rendered pages fetch data | No | `https://<CLOUD_RUN_URL>` (no trailing slash) |
   | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Maps key. It is visible to browsers by design; protect it with restrictions (section 6) | No, but restrict it | your key |

   These are the only two variables the website uses.
4. Deploy, and note the site address (`https://<your-site>.vercel.app` or your own domain).

Fixed at build time: the `/api/*` forwarding address (from `API_URL`) and the Maps key are baked in when the site is built. After changing either, **redeploy** the Vercel project.

Login cookies: the API sets them with `HttpOnly`, `Secure` (in production), `SameSite=Lax` and no `Domain`, and they travel through Vercel's forwarding, so the browser stores them for the Vercel site's own domain. Nothing needs configuring.

Vercel's free plan is for personal, non-commercial use; check its terms before taking real customers.

---

## 6. Join the pieces

1. Point the API at the real site address and redeploy it:

   ```bash
   gcloud run services update parkspotz-api --region asia-south1 \
     --update-env-vars APP_BASE_URL=https://<your-site>.vercel.app
   ```

2. 👤 **Google Maps key.** In Google Cloud Console → Google Maps Platform → Credentials, open the key and:
   - under *Application restrictions* choose **Websites** and add `https://<your-site>.vercel.app/*` (and your own domain if you have one; keep `http://localhost:3000/*` only on a separate key for development);
   - under *API restrictions* allow only **Maps JavaScript API** and **Places API (New)**, and make sure both are enabled for the project.

3. 👤 **Razorpay.** Keep the dashboard in **Test mode**. No webhook is used. Test cards and UPI IDs are listed in Razorpay's documentation.

---

## 7. The proxy chain and `TRUST_PROXY_HOPS`

The API limits how many unpaid bookings a guest can hold per IP address, so it needs the caller's real address. A request arrives through:

```
browser → Vercel (forwards /api/*) → Google's front end → Cloud Run container
```

The container sees an `X-Forwarded-For` header listing the addresses along the way, and `TRUST_PROXY_HOPS` says how many entries, counted from the right, were added by proxies we trust. The API uses the entry just beyond them as the caller's address.

- Locally there is one proxy (Next.js), so the default is `1`.
- In this deployment the expected chain is `client address, Vercel's address`: Vercel sets the client's address, and Google's front end appends the address of whoever connected to it (Vercel). That makes **`TRUST_PROXY_HOPS=2`**.

This is the expected behaviour, not something that has been observed. Verify it:

1. Log in to the site as the admin and open `https://<your-site>.vercel.app/api/admin/diagnostics`.
2. `client_ip` must be your own public IP address (compare with any "what is my IP" page), and `forwarded_for` shows the whole chain.
3. If `client_ip` is a Vercel or Google address, the number is too low; if it is something you could have typed into a header yourself, it is too high. Change it with `gcloud run services update parkspotz-api --region asia-south1 --update-env-vars TRUST_PROXY_HOPS=<n>` and check again.

Limit of this protection: the Cloud Run address is public, so someone who calls it directly, skipping Vercel, can put a made-up first entry in `X-Forwarded-For` and be counted as that address. The per-browser and per-phone-number limits still apply to them. Closing this fully needs a shared secret between Vercel and the API, or a load balancer in front of Cloud Run; neither is built.

---

## 8. Check the deployment

Do these in order on the public site. Stop at the first one that fails.

- [ ] `https://<your-site>.vercel.app/api/health` shows `{"status":"ok","db":"ok"}`.
- [ ] Log in as the admin (`admin` and the `ADMIN_PASSWORD` you chose). `/api/admin/diagnostics` shows `node_env: production`, `payment_mode: razorpay`, `secure_cookies: true`, `database: ok`, **`uploads_writable: true`**, the right `app_base_url`, and your own IP as `client_ip`.
- [ ] The demo logins work with your `DEMO_PASSWORD` and **not** with the public local password.
- [ ] Sign up a new customer account; you stay logged in after reloading the page.
- [ ] The search screen shows the map, and typing in the destination box suggests places.
- [ ] As a guest (not logged in), search MG Road Metro, book a space, and pay with a Razorpay **test card**. You land on the receipt with a QR code.
- [ ] Open that receipt link in a private window: it still shows.
- [ ] Scan the QR code with a phone: it opens the site's check screen (after logging in as `demo_attendant` or `demo_owner`).
- [ ] As `demo_attendant`, for a booking at MG Road Metro Parking whose time has come, record entry with a photo taken on the phone. The thumbnail appears; opening it shows the photo. In the Cloud Console the bucket now holds one file with a random name.
- [ ] Record exit. The history shows the row; the receipt shows entry and exit times.
- [ ] As `demo_owner`, open Rental and pay one invoice with a test card. (Razorpay has not been run for rental invoices or guest bookings before this; if it fails, note the message.)
- [ ] Open the Cloud Run URL's `/admin/diagnostics` without logging in: it must answer 401.

If `uploads_writable` is false, the container user cannot write to the mounted bucket. Check the service account's role on the bucket; if that is right, add mount options so the files belong to the container's user (`node`, uid and gid 1000): `--add-volume name=uploads,type=cloud-storage,bucket=<BUCKET_NAME>,mount-options="uid=1000;gid=1000"`.

---

## 9. Updating and rolling back

Update the API: build and push a new image (4.2), then `gcloud run deploy parkspotz-api --image "$IMAGE" --region asia-south1`. Settings carry over. Update the website: push to the branch Vercel deploys.

If a new version adds or changes tables, run `CONFIRM_REMOTE=yes npm run db:setup` against the direct Neon string **before** deploying the API. The schema file only ever adds things, so the old version keeps working.

Roll back:

- **API:** `gcloud run revisions list --service parkspotz-api --region asia-south1`, then `gcloud run services update-traffic parkspotz-api --region asia-south1 --to-revisions <REVISION>=100`.
- **Website:** in Vercel → Deployments, choose the previous deployment → *Promote to Production* (or *Instant Rollback*).
- **Database:** schema changes are additive and are not undone by a rollback. For data mistakes use Neon's point-in-time restore or branching (check what your plan keeps).

To take everything down: delete the Vercel project, the Cloud Run service, the Artifact Registry repository, the secrets, the bucket, and the Neon project.

---

## 10. What it costs

No prices are given here because they change; check each provider's current pricing page. By component:

| Component | How it is charged |
|-----------|-------------------|
| Vercel | Free plan for personal, non-commercial projects, with usage limits. Paid plan per member per month beyond that |
| Cloud Run | Usage-based (CPU and memory while handling requests, plus requests), with a monthly free allowance. With `--min-instances 0` it costs nothing while idle, at the price of a slow first request |
| Artifact Registry | Storage of images; small free allowance, then per GB. Delete old images |
| Secret Manager | Per secret version and per access; a small free allowance covers this app |
| Cloud Storage | Per GB stored and per operation; small amounts for photos shrunk to about 1600 px. Free allowances apply only in some US regions |
| Neon | Free plan with limits on storage, compute hours and sleep when idle. Paid plans are usage-based |
| Google Maps Platform | Usage-based per map load and per Places request, with a recurring free allowance. Restrict the key (section 6) so nobody else can spend it |
| Razorpay | Test mode is free. Live mode takes a percentage of each payment |

Set a budget alert on the Google Cloud project before going public.

---

## 11. Known gaps for a public site

- Mock payments are impossible in production, but Razorpay is in **test** mode: no real money is collected.
- Photos, number plates and guest phone numbers are personal data and nothing deletes them yet.
- No password reset, no login rate limiting, no payment webhook.
- The guest per-IP limit can be sidestepped by calling the Cloud Run address directly (section 7).
- A photo upload passes through Vercel on its way to the API. Photos are shrunk in the browser to well under 1 MB; an unusually large upload may be refused by Vercel before it reaches the API's own 5 MB limit.
