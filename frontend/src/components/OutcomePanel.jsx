import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";

const TERMINAL_STATUSES = new Set([
    "authorised",
    "failed",
    "cancelled",
    "cancellation_failed",
    "expired",
    "captured",
    "capture_failed",
    "refunded",
    "refund_failed",
    "chargeback"
]);

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 120000;

// Shows the Drop-in's immediate resultCode alongside the webhook-confirmed order
// status. They can disagree for a few seconds — that gap is the point.
export default function OutcomePanel({ event }) {
    const [order, setOrder] = useState(null);
    const pollTimer = useRef(null);

    useEffect(() => {
        setOrder(null);
        if (pollTimer.current) clearInterval(pollTimer.current);
        if (!event?.reference) return;

        const startedAt = Date.now();
        const poll = async () => {
            try {
                const latest = await api.getOrder(event.reference);
                setOrder(latest);
                if (TERMINAL_STATUSES.has(latest.status) || Date.now() - startedAt > POLL_TIMEOUT_MS) {
                    clearInterval(pollTimer.current);
                }
            } catch {
                // Order not created yet, or a transient network error - keep polling until timeout.
            }
        };

        poll();
        pollTimer.current = setInterval(poll, POLL_INTERVAL_MS);
        return () => clearInterval(pollTimer.current);
    }, [event?.reference]);

    if (!event) return null;

    return (
        <div className="outcome-panel">
            <h2>Payment lifecycle</h2>
            <dl>
                <dt>Merchant reference</dt>
                <dd>
                    <code>{event.reference}</code>
                </dd>

                <dt>Drop-in client-side event</dt>
                <dd>{describeClientEvent(event)}</dd>

                <dt>Backend order status (from webhook)</dt>
                <dd>
                    {order ? (
                        <span className={`status-pill status-pill--${order.status}`}>{order.status}</span>
                    ) : (
                        <span className="status-pill status-pill--pending">waiting for webhook…</span>
                    )}
                </dd>
            </dl>
        </div>
    );
}

function describeClientEvent(event) {
    switch (event.type) {
        case "session_created":
            return "Session created, awaiting shopper input";
        case "completed":
            return `resultCode: ${event.result?.resultCode ?? "unknown"}`;
        case "failed":
            return `resultCode: ${event.result?.resultCode ?? "refused/cancelled"}`;
        case "error":
            return `client error: ${event.error?.message ?? "unknown error"}`;
        default:
            return "—";
    }
}
