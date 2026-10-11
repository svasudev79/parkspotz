// Adds demo accounts and Bangalore parking spaces to the database in
// DATABASE_URL. Safe to run repeatedly: it only inserts what is missing and
// never changes or deletes existing rows.
import bcrypt from "bcryptjs";
import { pool } from "../db";

// Local demo logins, documented in the README. Not for a public deployment.
const DEMO_PASSWORD = "parkspotz-demo";
const DEMO_USERS = [
  { username: "demo_owner", role: "owner" },
  { username: "demo_customer", role: "customer" },
  { username: "demo_attendant", role: "attendant" },
];
// The demo attendant works the gate at this seeded space.
const ATTENDANT_SPACE = "MG Road Metro Parking";

// name, address, lat, lng, type, ownership, slots, price per hour, opens, closes
const SPACES: [string, string, number, number, string, string, number, number, string, string][] = [
  // Near MG Road Metro (12.9755, 77.6068): about 50 m, 250 m, 400 m and 850 m away.
  ["MG Road Metro Parking", "MG Road Metro Station, MG Road, Bengaluru", 12.9758, 77.6072, "multilevel", "metro", 60, 30, "06:00", "23:00"],
  ["Church Street Basement Parking", "Church Street, Shanthala Nagar, Bengaluru", 12.9748, 77.6045, "basement", "private", 20, 50, "08:00", "22:00"],
  ["Brigade Road Multilevel Parking", "Brigade Road, Ashok Nagar, Bengaluru", 12.9722, 77.6075, "multilevel", "public", 100, 40, "07:00", "23:00"],
  ["Trinity Circle Surface Lot", "Trinity Circle, MG Road, Bengaluru", 12.9728, 77.614, "surface", "public", 15, 20, "06:00", "22:00"],
  // Around other landmarks.
  ["Cubbon Park Gate Parking", "Kasturba Road, near Cubbon Park, Bengaluru", 12.977, 77.595, "surface", "public", 40, 25, "06:00", "20:00"],
  ["Indiranagar 100 Feet Road Parking", "100 Feet Road, Indiranagar, Bengaluru", 12.979, 77.64, "surface", "private", 8, 40, "09:00", "21:00"],
  ["Forum Mall Basement Parking", "Hosur Road, Koramangala, Bengaluru", 12.9349, 77.611, "basement", "private", 150, 60, "10:00", "22:00"],
  ["Majestic Bus Stand Parking", "Kempegowda Bus Station, Majestic, Bengaluru", 12.9772, 77.572, "multilevel", "public", 200, 20, "05:00", "23:30"],
  ["Jayanagar 4th Block Complex Parking", "Jayanagar Shopping Complex, 4th Block, Bengaluru", 12.9295, 77.583, "basement", "public", 80, 20, "08:00", "22:00"],
  ["ITPL Visitor Parking", "ITPL Main Road, Whitefield, Bengaluru", 12.986, 77.737, "multilevel", "private", 120, 35, "07:00", "22:00"],
];

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  let usersAdded = 0;
  for (const user of DEMO_USERS) {
    const result = await pool.query(
      `INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)
       ON CONFLICT (username) DO NOTHING`,
      [user.username, passwordHash, user.role]
    );
    usersAdded += result.rowCount ?? 0;
  }

  const owner = (await pool.query("SELECT id, role FROM users WHERE username = 'demo_owner'")).rows[0];
  if (owner.role !== "owner") throw new Error("demo_owner exists but is not an owner; not seeding spaces");

  let spacesAdded = 0;
  for (const [name, address, lat, lng, type, ownership, slots, price, opens, closes] of SPACES) {
    const result = await pool.query(
      `INSERT INTO parking_spaces
         (owner_id, name, address, lat, lng, space_type, ownership, total_slots, price_per_hour, open_time, close_time)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
       WHERE NOT EXISTS (SELECT 1 FROM parking_spaces WHERE owner_id = $1 AND name = $2)`,
      [owner.id, name, address, lat, lng, type, ownership, slots, price, opens, closes]
    );
    spacesAdded += result.rowCount ?? 0;
  }

  // Rental tiers: add the defaults only if there are none yet.
  const tiersAdded = await pool.query(
    `INSERT INTO rental_tiers (name, min_slots, max_slots, monthly_fee)
     SELECT * FROM (VALUES ('Small', 1, 20, 500), ('Medium', 21, 100, 1500), ('Large', 101, NULL, 3000))
       AS defaults (name, min_slots, max_slots, monthly_fee)
     WHERE NOT EXISTS (SELECT 1 FROM rental_tiers)`
  );
  if (tiersAdded.rowCount) console.log("Added the default rental tiers: Small, Medium, Large.");

  // A space's first month is rent-free, so brand-new demo spaces would have no
  // invoices to look at. Move the creation date of the seeded demo spaces
  // (only those: the demo owner's spaces with the seeded names) into last
  // month, unless they are already older than this month.
  const backdated = await pool.query(
    `UPDATE parking_spaces
     SET created_at = date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata' - interval '15 days'
     WHERE owner_id = $1 AND name = ANY($2::text[])
       AND created_at >= date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'`,
    [owner.id, SPACES.map((space) => space[0])]
  );
  if (backdated.rowCount) console.log(`Dated ${backdated.rowCount} demo space(s) to last month so they have rental invoices.`);

  // Attach the demo attendant to its space, unless it is already attached somewhere.
  const attached = await pool.query(
    `INSERT INTO space_attendants (user_id, space_id)
     SELECT u.id, s.id FROM users u, parking_spaces s
     WHERE u.username = 'demo_attendant' AND u.role = 'attendant'
       AND s.owner_id = $1 AND s.name = $2
     ON CONFLICT (user_id) DO NOTHING`,
    [owner.id, ATTENDANT_SPACE]
  );
  if (attached.rowCount) console.log(`demo_attendant now works at ${ATTENDANT_SPACE}.`);

  console.log(`Seed done. Added ${usersAdded} demo account(s) and ${spacesAdded} parking space(s).`);
  console.log(`Demo logins (password ${DEMO_PASSWORD}): demo_owner, demo_customer, demo_attendant`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
