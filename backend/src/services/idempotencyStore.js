/**
 * De-duplicates webhook notifications.
 *
 * Adyen delivers webhooks at-least-once and retries (with backoff, for up to ~24h)
 * whenever it doesn't receive a 200/"[accepted]" response in time, so the same
 * notificationItem can legitimately arrive more than once. There's no single
 * unique event id on the payload, so the documented approach is to derive an
 * idempotency key from pspReference + eventCode + success and skip processing
 * (while still acknowledging with 200) if that key was already handled.
 */
const SEEN_TTL_MS = 24 * 60 * 60 * 1000;

const seen = new Map();

function key({ pspReference, eventCode, success }) {
    return `${eventCode}:${pspReference}:${success}`;
}

function sweep() {
    const cutoff = Date.now() - SEEN_TTL_MS;
    for (const [k, seenAt] of seen) {
        if (seenAt < cutoff) seen.delete(k);
    }
}

export function isDuplicate(notificationItem) {
    sweep();
    return seen.has(key(notificationItem));
}

export function markProcessed(notificationItem) {
    seen.set(key(notificationItem), Date.now());
}
