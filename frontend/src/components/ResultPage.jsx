import { useEffect, useState } from "react";
import { AdyenCheckout } from "@adyen/adyen-web";
import "@adyen/adyen-web/styles/adyen.css";
import { api } from "../lib/api.js";
import OutcomePanel from "./OutcomePanel.jsx";

/**
 * Adyen redirects the shopper back here after a redirect-based payment
 * method (e.g. iDEAL) completes at the issuer. The returnUrl we passed to
 * /sessions was `${FRONTEND_URL}/result?reference=<ours>`, and Adyen appends
 * its own `sessionId` (and, depending on the method, `redirectResult`)
 * query params on top of it.
 *
 * The webhook is still the authoritative source of truth here (it can race
 * ahead of or lag behind this page), so this component's only real job is
 * to resolve `reference` and hand it to OutcomePanel, which polls the
 * backend for the confirmed status. Resuming the session client-side is a
 * best-effort addition purely for a faster/nicer perceived result.
 */
export default function ResultPage() {
    const [event, setEvent] = useState(null);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const reference = params.get("reference");
        const sessionId = params.get("sessionId");           // Sessions flow
        const redirectResult = params.get("redirectResult"); // both flows

        if (!reference) return;

        // "resolving" lets OutcomePanel render immediately and start polling,
        // so the shopper sees the webhook-confirmed status as soon as it arrives
        // even before the client-side result is known.
        setEvent({ type: "resolving", reference });

        (async () => {
            try {
                if (redirectResult && !sessionId) {
                    // Advanced flow — submit redirect details directly to our backend
                    const result = await api.submitDetails({ details: { redirectResult } });
                    const isSuccess = ["Authorised", "Pending", "Received"].includes(result.resultCode);
                    setEvent({ type: isSuccess ? "completed" : "failed", reference, result });
                } else if (sessionId) {
                    // Sessions flow — let the SDK resume the session; it reads redirectResult
                    // from the URL automatically and fires onPaymentCompleted / onPaymentFailed
                    const { clientKey, environment } = await api.getConfig();
                    await AdyenCheckout({
                        environment,
                        clientKey,
                        session: { id: sessionId },
                        onPaymentCompleted: (result) => {
                            setEvent({ type: "completed", reference, result });
                        },
                        onPaymentFailed: (result) => {
                            setEvent({ type: "failed", reference, result });
                        },
                        onError: (error) => {
                            console.error("[result] session resume error", error);
                            // Leave event as "resolving" — OutcomePanel will still
                            // show the webhook-confirmed status via polling.
                        }
                    });
                }
            } catch (error) {
                console.error("[result] failed to process redirect result", error);
            }
        })();
    }, []);

    return (
        <main className="app-shell">
            <header>
                <h1>Payment result</h1>
                <a className="back-link" href="/">
                    ← Start another payment
                </a>
            </header>
            {event ? (
                <OutcomePanel event={event} />
            ) : (
                <p>No payment reference found in the URL.</p>
            )}
        </main>
    );
}
