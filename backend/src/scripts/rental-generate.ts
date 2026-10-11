// Creates any missing monthly rental invoices. Safe to run at any time.
import { pool } from "../db";
import { generateInvoices } from "../rental";

generateInvoices()
  .then((made) => console.log(`Rental invoices created: ${made}`))
  .catch((err) => {
    console.error("Could not generate invoices:", err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
