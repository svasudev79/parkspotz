import { Router } from "express";
import { config } from "../config";
import { pool } from "../db";
import { requireRole } from "../middleware/auth";
import { createOrder, isValidRazorpaySignature, paymentInfo } from "../payments";
import { generateInvoices, INVOICE_SELECT, loadTiers, toInvoice } from "../rental";
import { parseId } from "../spaces";

// /owner/rental — a space owner's rental invoices and paying them.
// Owners only ever reach invoices for their own spaces; anything else is 404.
export const rentalRouter = Router();

rentalRouter.use(requireRole("owner"));

async function findInvoice(id: number | null, ownerId: number) {
  if (!id) return null;
  const { rows } = await pool.query(`${INVOICE_SELECT} WHERE i.id = $1 AND s.owner_id = $2`, [id, ownerId]);
  return rows[0] ?? null;
}

// GET /owner/rental — the fee tiers, and every invoice for the owner's spaces,
// newest month first.
rentalRouter.get("/", async (req, res) => {
  await generateInvoices();
  const { rows } = await pool.query(
    `${INVOICE_SELECT} WHERE s.owner_id = $1 ORDER BY i.month DESC, s.name, i.id`,
    [req.user!.id]
  );
  const unpaid = rows.filter((row) => row.status === "due");
  res.json({
    tiers: await loadTiers(),
    due_day: config.rentalDueDay,
    invoices: rows.map(toInvoice),
    summary: {
      due_count: unpaid.length,
      overdue_count: unpaid.filter((row) => row.overdue).length,
      due_amount: Math.round(unpaid.reduce((sum, row) => sum + row.amount, 0) * 100) / 100,
    },
  });
});

// GET /owner/rental/invoices/:id — one invoice (also its receipt once paid).
rentalRouter.get("/invoices/:id", async (req, res) => {
  const invoice = await findInvoice(parseId(req.params.id), req.user!.id);
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });
  res.json({ invoice: toInvoice(invoice), payment: paymentInfo(null) });
});

// POST /owner/rental/invoices/:id/pay — start a payment: creates the provider
// order and returns what the browser needs to pay it.
rentalRouter.post("/invoices/:id/pay", async (req, res) => {
  const invoice = await findInvoice(parseId(req.params.id), req.user!.id);
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });
  if (invoice.status === "paid") return res.status(409).json({ error: "This invoice is already paid" });

  let orderId: string;
  try {
    orderId = await createOrder(`rental_${invoice.id}`, invoice.amount);
  } catch (err) {
    console.error(err instanceof Error ? err.message : "Payment order failed");
    return res.status(502).json({ error: "Could not start the payment. Please try again." });
  }
  await pool.query(
    "INSERT INTO rental_payments (invoice_id, provider_order_id, amount, status) VALUES ($1, $2, $3, 'created')",
    [invoice.id, orderId, invoice.amount]
  );
  res.status(201).json({ invoice: toInvoice(invoice), payment: paymentInfo(orderId) });
});

// POST /owner/rental/invoices/:id/confirm — check the payment and mark the
// invoice paid. Same rules as for bookings:
//   mock mode:     { mock_payment_id }
//   razorpay mode: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
// Confirming an already paid invoice returns it unchanged.
rentalRouter.post("/invoices/:id/confirm", async (req, res) => {
  const ownerId = req.user!.id;
  const invoice = await findInvoice(parseId(req.params.id), ownerId);
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });
  if (invoice.status === "paid") return res.json({ invoice: toInvoice(invoice) });

  let orderId: string;
  let paymentId: string;
  if (config.paymentMode === "mock") {
    const { mock_payment_id } = req.body ?? {};
    if (typeof mock_payment_id !== "string" || !/^mock_pay_[A-Za-z0-9]{1,40}$/.test(mock_payment_id)) {
      return res.status(400).json({ error: "mock_payment_id is required" });
    }
    const latest = await pool.query(
      "SELECT provider_order_id FROM rental_payments WHERE invoice_id = $1 AND status = 'created' ORDER BY id DESC LIMIT 1",
      [invoice.id]
    );
    if (latest.rows.length === 0) return res.status(400).json({ error: "Start the payment first" });
    orderId = latest.rows[0].provider_order_id;
    paymentId = mock_payment_id;
  } else {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body ?? {};
    if (
      typeof razorpay_order_id !== "string" ||
      typeof razorpay_payment_id !== "string" ||
      typeof razorpay_signature !== "string"
    ) {
      return res.status(400).json({ error: "Payment details are missing" });
    }
    // The order must be one we created for this very invoice.
    const known = await pool.query(
      "SELECT 1 FROM rental_payments WHERE invoice_id = $1 AND provider_order_id = $2",
      [invoice.id, razorpay_order_id]
    );
    if (
      known.rows.length === 0 ||
      !isValidRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)
    ) {
      return res.status(400).json({ error: "Payment could not be verified" });
    }
    orderId = razorpay_order_id;
    paymentId = razorpay_payment_id;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(
      "UPDATE rental_invoices SET status = 'paid', paid_at = now() WHERE id = $1 AND status = 'due'",
      [invoice.id]
    );
    if (updated.rowCount === 1) {
      await client.query(
        "UPDATE rental_payments SET status = 'paid', provider_payment_id = $2 WHERE invoice_id = $1 AND provider_order_id = $3",
        [invoice.id, paymentId, orderId]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  res.json({ invoice: toInvoice(await findInvoice(invoice.id, ownerId)) });
});

// POST /owner/rental/invoices/:id/fail — a payment attempt failed (mock mode's
// Fail button). The attempt is recorded; the invoice simply stays due.
rentalRouter.post("/invoices/:id/fail", async (req, res) => {
  const invoice = await findInvoice(parseId(req.params.id), req.user!.id);
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });
  await pool.query("UPDATE rental_payments SET status = 'failed' WHERE invoice_id = $1 AND status = 'created'", [
    invoice.id,
  ]);
  res.json({ invoice: toInvoice(invoice) });
});
