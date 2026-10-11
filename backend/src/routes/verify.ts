import { Router } from "express";
import { gateView } from "../gate";
import { requireRole } from "../middleware/auth";

export const verifyRouter = Router();

// GET /verify/:qrToken — gate staff (the space's owner or one of its
// attendants) check the QR code on a customer's receipt. See gateView().
verifyRouter.get("/:qrToken", requireRole("owner", "attendant"), async (req, res) => {
  res.json(await gateView(String(req.params.qrToken), req.user!));
});
