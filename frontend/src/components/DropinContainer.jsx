import { useEffect, useRef, useState } from "react";
import { AdyenCheckout, Dropin, Card, Redirect, PayPal, GooglePay, ApplePay, Klarna, SepaDirectDebit, Giftcard, WeChat } from "@adyen/adyen-web";
import "@adyen/adyen-web/styles/adyen.css";
import "../styles/override.css";
import { api } from "../lib/api.js";
import { applyTheme } from "../lib/themes.js";

const BRAND_LABELS = {
    visa: "Visa", mc: "Mastercard", amex: "American Express",
    discover: "Discover", maestro: "Maestro", cup: "UnionPay"
};

// All supported payment method components for Advanced flow.
// The Drop-in only renders the ones that match paymentMethodsResponse —
// extras are ignored. Sessions flow does not use this list.
const ADVANCED_FLOW_COMPONENTS = [
    Card, Redirect, PayPal, GooglePay, ApplePay,
    Klarna, SepaDirectDebit, Giftcard, WeChat
];


export default function DropinContainer({
    countryCode, amountValue, themeKey, openFirst, simulateRetry,
    shopperEmail, billingAddressRequired, flow, onOutcome
}) {
    const mountRef = useRef(null);
    const dropinRef = useRef(null);
    const submittedRef = useRef(false);
    const [status, setStatus] = useState("idle");
    const [errorMessage, setErrorMessage] = useState(null);
    const [retryDemo, setRetryDemo] = useState(null);
    const [binInfo, setBinInfo] = useState(null);

    useEffect(() => {
        let cancelled = false;
        submittedRef.current = false;
        setStatus("loading");
        setErrorMessage(null);
        setRetryDemo(null);
        setBinInfo(null);

        (async () => {
            try {
                let checkout;
                let reference;
                // clickToPayConfiguration.locale uses underscore (en_US), AdyenCheckout uses hyphen (en-US)
                let ctpLocale = "en_US";
                let shopperEmailForCtp;
                // Advanced flow: pass all supported components — Drop-in only renders
                // those matching paymentMethodsResponse, extras are ignored.
                // Sessions flow: null — the Drop-in resolves the list from sessionData.
                let resolvedComponents = null;

                if (flow === "advanced") {
                    // ── Advanced flow ────────────────────────────────────────────────
                    // Step 1: fetch payment methods and mint the order reference
                    const pmData = await api.getPaymentMethods({ countryCode, amountValue, shopperEmail });
                    if (cancelled) return;

                    resolvedComponents = ADVANCED_FLOW_COMPONENTS;

                    reference = pmData.reference;
                    ctpLocale = pmData.shopperLocale?.replace("-", "_") ?? "en_US";
                    shopperEmailForCtp = shopperEmail;
                    onOutcome({ type: "session_created", reference });

                    checkout = await AdyenCheckout({
                        environment: pmData.environment,
                        clientKey: pmData.clientKey,
                        paymentMethodsResponse: pmData.paymentMethodsResponse,
                        countryCode,
                        amount: pmData.amount,
                        // Step 2: shopper submits → forward encrypted data to /payments
                        onSubmit: async (state, _component, actions) => {
                            if (submittedRef.current) { actions.reject(); return; }
                            submittedRef.current = true;
                            try {
                                const result = await api.submitPayment({
                                    ...state.data,
                                    reference,
                                    countryCode,
                                    amountValue,
                                    shopperEmail,
                                    returnUrl: `${window.location.origin}/result?reference=${reference}`
                                });
                                // Passing the result back to the SDK — if result.action is present
                                // (e.g. 3DS challenge) the SDK handles it and fires onAdditionalDetails.
                                actions.resolve(result);
                            } catch (err) {
                                actions.reject();
                                onOutcome({ type: "error", reference, error: err });
                            }
                        },
                        // Step 3: additional details after 3DS or redirect → forward to /payments/details
                        onAdditionalDetails: async (state, _component, actions) => {
                            try {
                                const result = await api.submitDetails(state.data);
                                actions.resolve(result);
                            } catch (err) {
                                actions.reject();
                                onOutcome({ type: "error", reference, error: err });
                            }
                        },
                        onPaymentCompleted: (result) => {
                            onOutcome({ type: "completed", reference, result });
                        },
                        onPaymentFailed: (result) => {
                            onOutcome({ type: "failed", reference, result });
                        },
                        onError: (error) => {
                            console.error("[dropin] onError", error);
                            onOutcome({ type: "error", reference, error });
                        }
                    });
                } else {
                    // ── Sessions flow (default) ──────────────────────────────────────
                    const session = await api.createSession({ countryCode, amountValue, simulateRetry, shopperEmail });
                    if (session.retryDemo) setRetryDemo(session.retryDemo);
                    if (cancelled) return;

                    reference = session.reference;
                    ctpLocale = session.shopperLocale?.replace("-", "_") ?? "en_US";
                    shopperEmailForCtp = session.shopperEmail;
                    onOutcome({ type: "session_created", reference });

                    checkout = await AdyenCheckout({
                        environment: session.environment,
                        clientKey: session.clientKey,
                        session: {
                            id: session.sessionId,
                            sessionData: session.sessionData,
                            shopperEmail: session.shopperEmail
                        },
                        countryCode,
                        beforeSubmit: (data, _component, actions) => {
                            if (submittedRef.current) { actions.reject(); return; }
                            submittedRef.current = true;
                            actions.resolve(data);
                        },
                        onPaymentCompleted: (result) => {
                            onOutcome({ type: "completed", reference, result });
                        },
                        onPaymentFailed: (result) => {
                            onOutcome({ type: "failed", reference, result });
                        },
                        onError: (error) => {
                            console.error("[dropin] onError", error);
                            onOutcome({ type: "error", reference, error });
                        }
                    });
                }

                if (cancelled) return;

                const dropin = new Dropin(checkout, {
                    openFirstPaymentMethod: openFirst,
                    ...(resolvedComponents && { paymentMethodComponents: resolvedComponents }),
                    paymentMethodsConfiguration: {
                        card: {
                            hasHolderName: true,
                            holderNameRequired: true,
                            billingAddressRequired,
                            billingAddressMode: billingAddressRequired ? "partial" : undefined,
                            onBinLookup: (data) => {
                                if (!data.detectedBrands?.length) { setBinInfo(null); return; }
                                setBinInfo({
                                    brand: data.detectedBrands[0],
                                    issuingCountry: data.issuingCountryCode,
                                    supports3DS: data.brands?.[0]?.supported3DS ?? null
                                });
                            },
                            clickToPayConfiguration: shopperEmailForCtp ? {
                                shopperEmail: shopperEmailForCtp,
                                merchantDisplayName: "Adyen Drop-in Demo",
                                locale: ctpLocale,
                                disableOtpAutoFocus: false,
                                onReady: () => console.log("[ctp] ready"),
                                onTimeout: (err) => console.warn("[ctp] timeout", err)
                            } : undefined
                        }
                    }
                });
                dropin.mount(mountRef.current);
                dropinRef.current = dropin;
                applyTheme(mountRef.current, themeKey);
                setStatus("ready");
            } catch (error) {
                console.error("[dropin] failed to initialize", error);
                if (!cancelled) { setErrorMessage(error.message); setStatus("error"); }
            }
        })();

        return () => {
            cancelled = true;
            dropinRef.current?.unmount();
            dropinRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [countryCode, amountValue, billingAddressRequired]);

    useEffect(() => {
        if (mountRef.current) applyTheme(mountRef.current, themeKey);
    }, [themeKey]);

    useEffect(() => {
        dropinRef.current?.update({ openFirstPaymentMethod: openFirst });
    }, [openFirst]);

    return (
        <div className="dropin-panel">
            {status === "loading" && <p className="dropin-status">Loading payment methods…</p>}
            {status === "error" && <p className="dropin-status dropin-status--error">{errorMessage}</p>}
            {retryDemo && (
                <div className={`retry-demo retry-demo--${retryDemo.sameSession ? "match" : "mismatch"}`}>
                    <strong>Idempotency key demo</strong>
                    <dl>
                        <dt>1st call session ID</dt>
                        <dd><code>{retryDemo.firstCallId}</code></dd>
                        <dt>2nd call session ID</dt>
                        <dd><code>{retryDemo.secondCallId}</code></dd>
                        <dt>Result</dt>
                        <dd>
                            {retryDemo.sameSession
                                ? "Same session returned — no duplicate created"
                                : "Different sessions — idempotency key did not match"}
                        </dd>
                    </dl>
                </div>
            )}
            {binInfo && (
                <div className="bin-info">
                    <strong>Card detected</strong>
                    <dl>
                        <dt>Brand</dt>
                        <dd>{BRAND_LABELS[binInfo.brand] ?? binInfo.brand}</dd>
                        {binInfo.issuingCountry && <><dt>Issuing country</dt><dd>{binInfo.issuingCountry}</dd></>}
                        {binInfo.supports3DS !== null && (
                            <><dt>3D Secure</dt><dd>{binInfo.supports3DS ? "Supported" : "Not supported"}</dd></>
                        )}
                    </dl>
                </div>
            )}
            <div ref={mountRef} className="dropin-mount" />
        </div>
    );
}
