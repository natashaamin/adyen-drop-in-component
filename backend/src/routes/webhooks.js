import { Router } from "express";
import adyenApi from "@adyen/api-library";
import { config } from "../config.js";
import { applyWebhookEvent } from "../services/orderStore.js";
import { isDuplicate, markProcessed } from "../services/idempotencyStore.js";

const { hmacValidator: HmacValidator } = adyenApi;
const hmacValidator = new HmacValidator();

export const webhooksRouter = Router();

// Webhooks are the authoritative payment outcome. The Drop-in's onPaymentCompleted
// is a UX hint only — the browser can close or lose connectivity before it fires.
// Adyen delivers at-least-once, so processing must be HMAC-verified and idempotent.
webhooksRouter.post("/webhooks/notifications", async (req, res) => {
    const items = req.body?.notificationItems ?? [];

    if (items.length === 0) {
        return res.status(400).send("no notificationItems in payload");
    }

    for (const { NotificationRequestItem: item } of items) {
        if (!item) continue;

        if (config.adyen.hmacKey) {
            const isValid = hmacValidator.validateHMAC(item, config.adyen.hmacKey);
            if (!isValid) {
                console.error(`[webhooks] HMAC validation failed for pspReference=${item.pspReference}`);
                return res.status(401).send("invalid hmac signature");
            }
        } else {
            console.warn("[webhooks] ADYEN_HMAC_KEY not set — skipping signature verification. Do not do this in production.");
        }

        if (isDuplicate(item)) {
            console.log(`[webhooks] duplicate skipped: ${item.eventCode} / ${item.pspReference}`);
            continue;
        }

        const order = applyWebhookEvent(item);
        if (!order) continue;
        markProcessed(item);
        console.log(
            `[webhooks] ${item.eventCode} success=${item.success} -> order ${order.reference} is now "${order.status}"`
        );
    }

    res.status(200).send("[accepted]");
});
