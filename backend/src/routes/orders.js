import { Router } from "express";
import { getOrder, listOrders, applyWebhookEvent } from "../services/orderStore.js";
import { isDuplicate, markProcessed } from "../services/idempotencyStore.js";

export const ordersRouter = Router();

// Polled by the result page while the shopper waits for the webhook-driven
// status update, and by the "recent orders" panel in the demo UI.
ordersRouter.get("/orders/:reference", (req, res) => {
    const order = getOrder(req.params.reference);
    if (!order) return res.status(404).json({ error: "Unknown reference" });
    res.json(order);
});

ordersRouter.get("/orders", (_req, res) => {
    res.json(listOrders().slice(0, 25));
});

ordersRouter.post("/orders/:reference/replay", (req, res) => {
    const order = getOrder(req.params.reference);
    if (!order) return res.status(404).json({ error: "Unknown reference" });

    const lastWebhook = [...order.history].reverse().find((e) => e.source?.startsWith("webhook:"));
    if (!lastWebhook) return res.status(400).json({ error: "No webhook event to replay" });

    const eventCode = lastWebhook.source.replace("webhook:", "");
    const item = {
        eventCode,
        pspReference: order.pspReference,
        success: String(lastWebhook.success),
        merchantReference: order.reference,
        amount: order.amount
    };

    if (isDuplicate(item)) {
        return res.json({ duplicate: true, order });
    }

    const updated = applyWebhookEvent(item);
    markProcessed(item);
    res.json({ duplicate: false, order: updated });
});
