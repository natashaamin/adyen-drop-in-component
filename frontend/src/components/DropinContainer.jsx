import { useEffect, useRef, useState } from "react";
import { AdyenCheckout, Dropin, Card, Redirect, PayPal, GooglePay, ApplePay } from "@adyen/adyen-web";
import "@adyen/adyen-web/styles/adyen.css";
import "../styles/override.css";
import { api } from "../lib/api.js";
import { applyTheme } from "../lib/themes.js";

const BRAND_LABELS = {
    visa: "Visa", mc: "Mastercard", amex: "American Express",
    discover: "Discover", maestro: "Maestro", cup: "UnionPay"
};

export default function DropinContainer({
    countryCode, amountValue, themeKey, openFirst, simulateRetry,
    shopperEmail, billingAddressRequired, onOutcome
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
                const session = await api.createSession({ countryCode, amountValue, simulateRetry, shopperEmail });
                if (session.retryDemo) setRetryDemo(session.retryDemo);
                if (cancelled) return;

                onOutcome({ type: "session_created", reference: session.reference });

                // clickToPayConfiguration.locale uses underscore (en_US), AdyenCheckout uses hyphen (en-US)
                const ctpLocale = session.shopperLocale?.replace("-", "_") ?? "en_US";

                const checkout = await AdyenCheckout({
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
                        onOutcome({ type: "completed", reference: session.reference, result });
                    },
                    onPaymentFailed: (result) => {
                        onOutcome({ type: "failed", reference: session.reference, result });
                    },
                    onError: (error) => {
                        console.error("[dropin] onError", error);
                        onOutcome({ type: "error", reference: session.reference, error });
                    }
                });

                if (cancelled) return;

                const dropin = new Dropin(checkout, {
                    openFirstPaymentMethod: openFirst,
                    paymentMethodComponents: [Card, Redirect, PayPal, GooglePay, ApplePay],
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
                            clickToPayConfiguration: session.shopperEmail ? {
                                shopperEmail: session.shopperEmail,
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
