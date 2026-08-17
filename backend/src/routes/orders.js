import { Router } from "express";
import { getOrder, listOrders } from "../services/orderStore.js";

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
