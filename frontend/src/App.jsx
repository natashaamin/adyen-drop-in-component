import { useEffect, useState } from "react";
import ControlsPanel from "./components/ControlsPanel.jsx";
import DropinContainer from "./components/DropinContainer.jsx";
import OutcomePanel from "./components/OutcomePanel.jsx";
import OrdersPanel from "./components/OrdersPanel.jsx";
import ResultPage from "./components/ResultPage.jsx";
import TestCardsPanel from "./components/TestCardsPanel.jsx";
import { api } from "./lib/api.js";

const MINOR_UNIT_CURRENCIES = new Set(["JPY", "KRW", "HUF", "TWD"]);

function formatAmount(value, currency) {
    if (!currency) return "";
    const amount = MINOR_UNIT_CURRENCIES.has(currency) ? value : value / 100;
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
}

export default function App() {
    if (window.location.pathname === "/result") return <ResultPage />;
    return <CheckoutDemo />;
}

function OrderResult({ event, formatted, onBack }) {
    const resultCode = event?.result?.resultCode;
    const isAuthorised = resultCode === "Authorised";
    const isPending = resultCode === "Pending" || resultCode === "Received";
    const variant = isAuthorised ? "success" : isPending ? "pending" : "failure";

    return (
        <div className="order-result">
            <button className="back-link" onClick={onBack}>
                ← Back to shop
            </button>
            <div className={`order-result-hero order-result-hero--${variant}`}>
                <div className="order-result-icon">
                    {isAuthorised ? "✓" : isPending ? "⏱" : "✕"}
                </div>
                <div>
                    <h2 className="order-result-heading">
                        {isAuthorised
                            ? "Your order has been placed"
                            : isPending
                            ? "Payment is being processed"
                            : "Payment was not completed"}
                    </h2>
                    <p className="order-result-subtext">
                        {isAuthorised
                            ? "Thank you! Your payment has been received."
                            : isPending
                            ? "We'll confirm your order once the payment settles."
                            : `Result: ${resultCode ?? "unknown"}`}
                    </p>
                </div>
            </div>

            <div className="order-result-summary">
                <span>Demo Product</span>
                <span>{formatted}</span>
            </div>

            <OutcomePanel event={event} />
        </div>
    );
}

function CheckoutDemo() {
    const [countries, setCountries] = useState(null);
    const [countryCode, setCountryCode] = useState("NL");
    const [amountValue, setAmountValue] = useState(1999);
    const [themeKey, setThemeKey] = useState("default");
    const [event, setEvent] = useState(null);
    const [loadError, setLoadError] = useState(null);
    const [started, setStarted] = useState(false);
    const [openFirst, setOpenFirst] = useState(false);
    const [simulateRetry, setSimulateRetry] = useState(false);
    const [billingAddressRequired, setBillingAddressRequired] = useState(false);
    const [shopperEmail, setShopperEmail] = useState("");
    const [flow, setFlow] = useState("sessions");

    useEffect(() => {
        api.getConfig()
            .then((cfg) => setCountries(cfg.countries))
            .catch((err) => setLoadError(err.message));
    }, []);

    if (loadError) {
        return (
            <main className="app-shell">
                <h1>Adyen Drop-in Demo</h1>
                <p className="dropin-status dropin-status--error">
                    Could not reach the backend: {loadError}
                </p>
            </main>
        );
    }

    if (!countries) {
        return (
            <main className="app-shell">
                <h1>Adyen Drop-in Demo</h1>
                <p>Loading…</p>
            </main>
        );
    }

    const currency = countries[countryCode]?.currency ?? "";
    const formatted = formatAmount(amountValue, currency);

    return (
        <main className="app-shell">
            <header>
                <h1>Adyen Drop-in Demo</h1>
                <p className="subtitle">React · Node.js · Adyen {flow === "advanced" ? "Advanced" : "Sessions"} flow</p>
            </header>

            {!started ? (
                /* ── Store page — settings left, product right ── */
                <div className="layout store-page">
                    <ControlsPanel
                        countries={countries}
                        countryCode={countryCode}
                        onCountryChange={(v) => setCountryCode(v)}
                        amountValue={amountValue}
                        onAmountChange={(v) => setAmountValue(v)}
                        themeKey={themeKey}
                        onThemeChange={setThemeKey}
                        openFirst={openFirst}
                        onOpenFirstChange={setOpenFirst}
                        simulateRetry={simulateRetry}
                        onSimulateRetryChange={setSimulateRetry}
                        billingAddressRequired={billingAddressRequired}
                        onBillingAddressRequiredChange={setBillingAddressRequired}
                        flow={flow}
                        onFlowChange={setFlow}
                    />

                    <div>
                        <div className="product-card">
                            <div className="product-img">🛍️</div>
                            <div className="product-info">
                                <h2 className="product-name">Demo Product</h2>
                                <p className="product-meta">
                                    One-time purchase · {countries[countryCode]?.label}
                                </p>
                                <p className="product-price">{formatted}</p>
                            </div>
                        </div>

                        <div className="shopper-form">
                            <h2>Your details</h2>
                            <label className="control-field">
                                <span>Email address</span>
                                <input
                                    type="email"
                                    placeholder="shopper@example.com"
                                    value={shopperEmail}
                                    onChange={(e) => setShopperEmail(e.target.value)}
                                />
                                <small>
                                    Optional — enables{" "}
                                    <strong>Click to Pay</strong> so Visa/Mastercard can
                                    recognise you and surface your saved cards automatically.
                                </small>
                            </label>
                            <button
                                className="proceed-btn"
                                onClick={() => { setStarted(true); setEvent(null); }}
                            >
                                Proceed to checkout →
                            </button>
                        </div>
                    </div>
                </div>
            ) : (event?.type === "completed" || event?.type === "failed") ? (
                /* ── Order result page ── */
                <OrderResult
                    event={event}
                    formatted={formatted}
                    onBack={() => { setStarted(false); setEvent(null); }}
                />
            ) : (
                /* ── Checkout page ── */
                <div className="checkout-page">
                    <button
                        className="back-link"
                        onClick={() => setStarted(false)}
                    >
                        ← Back to product
                    </button>
                    <div className="checkout-header">
                        <span className="checkout-item-label">Demo Product</span>
                        <span className="checkout-item-price">{formatted}</span>
                    </div>
                    {shopperEmail && (
                        <p className="checkout-shopper-email">
                            Paying as <strong>{shopperEmail}</strong>
                        </p>
                    )}
                    <DropinContainer
                        key={`${countryCode}-${amountValue}-${flow}`}
                        countryCode={countryCode}
                        amountValue={amountValue}
                        themeKey={themeKey}
                        openFirst={openFirst}
                        simulateRetry={simulateRetry}
                        shopperEmail={shopperEmail || undefined}
                        billingAddressRequired={billingAddressRequired}
                        flow={flow}
                        onOutcome={setEvent}
                    />
                </div>
            )}

            <TestCardsPanel />

            {/* ── Behind the scenes ── */}
            <div className="behind-scenes">
                <h2 className="behind-scenes-title">Behind the scenes</h2>
                <p className="behind-scenes-subtitle">
                    All orders and their webhook-driven lifecycle transitions.
                </p>
                <OrdersPanel />
            </div>
        </main>
    );
}
