# ParkSpotZ walkthrough video

`parkspotz-walkthrough.mp4` is a 3 minute 23 second tour of the app (1920×1080, no sound). Each chapter has a caption bar at the bottom of the screen. Phone-sized chapters are shown centred on a dark background.

It was recorded on a developer's computer, not on the live site, in **test-payment mode**: no real money is involved, and the "Test payment" screen stands in for Razorpay. All the people, bookings, number plates and the car picture are made up.

The video files are not kept in git (they are large). This folder holds them locally after running the recording script.

## Chapters

| Starts at | Length | Chapter | What it shows |
|-----------|--------|---------|---------------|
| 0:00 | 41 s | 1 · A guest books parking (phone) | No login. Search near Brigade Road with Google place search, results on a map and in a list, open MG Road Metro Parking, book as a guest with a name and mobile number, pay on the test-payment screen, and land on the receipt with its QR code and the "save this page" prompt |
| 0:41 | 51 s | 2 · The attendant at the gate (phone) | `demo_attendant` logs in and sees the guest under Expected today, finds the booking by its reference, records entry with a vehicle number and a photo, and sees it under Inside now with the time left. Then the vehicle is 50 minutes late: the red overstay notice with ₹30 due, Record exit, "Collected — cash", and the vehicle history |
| 1:31 | 18 s | 3 · A customer with an account (phone) | `demo_customer` opens My bookings and a receipt showing entry and exit times and an overstay charge paid by UPI |
| 1:49 | 52 s | 4 · The parking space owner (desktop) | `demo_owner`: My spaces and today's bookings, creating an attendant for a space, the vehicle history with the entry photo, usage and revenue with overstay in its own column, the Rental page with the monthly fees and invoices, and paying one invoice to get a receipt |
| 2:42 | 41 s | 5 · The platform admin (desktop) | The dashboard (spaces onboarded, slots managed, in use now, utilisation, bookings by customers and by guests, rental totals), the table of all spaces sorted by slots, and the rental invoices with overdue ones highlighted, then the rental tiers |

The same chapters are also saved separately, as recorded: `clip-1-guest-booking.webm`, `clip-2-attendant-gate.webm`, `clip-3-customer.webm` (phone size, 390×844) and `clip-4-owner.webm`, `clip-5-admin.webm` (1280×800).

## What was arranged off camera

- The customer's finished visit in chapter 3 was made by booking normally and then moving the booking into the past and adding the visit directly in the database, because the app only takes bookings for future times.
- In chapter 2, after entry was recorded, the booking's times were moved back in the database so that it had ended 50 minutes earlier. Nothing else about the overstay was faked: the app worked out the ₹30 itself.

## Recording it again

`tools/record_demo.mjs` records the whole thing; the comment at the top of that file explains how to run it. It needs a throwaway database and the app running locally in test-payment mode, and it refuses to run against anything that is not local.
