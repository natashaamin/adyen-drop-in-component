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

    if (!event || event.type === "session_created") return null;

    return (
        <div className="outcome-panel">
            <h2>Payment lifecycle</h2>
            <dl>
                <dt>Order reference</dt>
                <dd>
                    <code>{event.reference}</code>
                </dd>

                {event.type !== "resolving" && (
                    <>
                        <dt>Drop-in result (client-side)</dt>
                        <dd>{describeClientEvent(event)}</dd>
                    </>
                )}

                <dt>Webhook-confirmed status</dt>
                <dd>
                    {order ? (
                        <span className={`status-pill status-pill--${order.status}`}>{order.status}</span>
                    ) : (
                        <span className="status-pill status-pill--pending">awaiting webhook…</span>
                    )}
                </dd>

                {order?.history?.length > 0 && (
                    <>
                        <dt>Lifecycle events</dt>
                        <dd>
                            <ol className="outcome-history">
                                {order.history.map((h, i) => (
                                    <li key={i}>
                                        <span className={`status-pill status-pill--${h.status}`}>{h.status}</span>
                                        <span className="outcome-history-source"> via {h.source}</span>
                                    </li>
                                ))}
                            </ol>
                        </dd>
                    </>
                )}
            </dl>
        </div>
    );
}

function describeClientEvent(event) {
    switch (event.type) {
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
