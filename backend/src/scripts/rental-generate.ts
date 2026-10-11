// Creates any missing monthly rental invoices. Safe to run at any time.
import { config } from "../config";
import { pool } from "../db";
import { confirmDatabaseTarget } from "../safety";
import { generateInvoices } from "../rental";

Promise.resolve()
  .then(() => {
    console.log(confirmDatabaseTarget(config.databaseUrl, process.env.CONFIRM_REMOTE, "Generating rental invoices in"));
    return generateInvoices();
  })
  .then((made) => console.log(`Rental invoices created: ${made}`))
  .catch((err) => {
    console.error("Could not generate invoices:", err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
