// In-memory order ledger keyed by merchantReference.
// In production this would be a real database; the interface (createOrder /
// applyWebhookEvent / getOrder) is shaped to swap without touching the routes.
const orders = new Map();

// Maps Adyen (eventCode, success) pairs onto the order lifecycle.
// `success` can arrive as a boolean or the strings "true"/"false", so it's
// normalised to a real boolean in applyWebhookEvent.
const LIFECYCLE_RULES = {
    AUTHORISATION: (success) => (success ? "authorised" : "failed"),
    CANCELLATION: (success) => (success ? "cancelled" : "cancellation_failed"),
    CANCEL_OR_REFUND: (success) => (success ? "cancelled" : "cancellation_failed"),
    EXPIRE: () => "expired",
    CAPTURE: (success) => (success ? "captured" : "capture_failed"),
    CAPTURE_FAILED: () => "capture_failed",
    REFUND: (success) => (success ? "refunded" : "refund_failed"),
    REFUND_FAILED: () => "refund_failed",
    REFUNDED_REVERSED: () => "authorised",
    CHARGEBACK: () => "chargeback",
    CHARGEBACK_REVERSED: () => "chargeback_reversed",
    NOTIFICATION_OF_CHARGEBACK: () => "chargeback_pending"
};

export function createOrder(reference, data) {
    orders.set(reference, {
        reference,
        status: "pending",
        pspReference: null,
        amount: data.amount,
        countryCode: data.countryCode,
        shopperLocale: data.shopperLocale,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        history: [{ status: "pending", at: new Date().toISOString(), source: "session_created" }]
    });
    return orders.get(reference);
}

export function getOrder(reference) {
    return orders.get(reference) ?? null;
}

export function applyWebhookEvent(notificationItem) {
    const { merchantReference, eventCode, pspReference } = notificationItem;
    const success = String(notificationItem.success) === "true";

    const order = orders.get(merchantReference);
    if (!order) {
        console.log(`[orderStore] ignoring webhook for unknown reference ${merchantReference}`);
        return null;
    }

    const resolve = LIFECYCLE_RULES[eventCode];
    const nextStatus = resolve ? resolve(success) : order.status;

    order.status = nextStatus;
    order.pspReference = pspReference;
    order.updatedAt = new Date().toISOString();
    order.history.push({
        status: nextStatus,
        at: order.updatedAt,
        source: `webhook:${eventCode}`,
        success
    });

    orders.set(merchantReference, order);
    return order;
}

export function listOrders() {
    return Array.from(orders.values()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
