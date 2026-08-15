import { useEffect, useRef, useState } from "react";
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
    const returnTimer = useRef(null);

    useEffect(() => {
        if (event?.type === "completed") {
            returnTimer.current = setTimeout(() => setStarted(false), 2500);
        }
        return () => clearTimeout(returnTimer.current);
    }, [event?.type]);

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
                <p className="subtitle">React · Node.js · Adyen Sessions flow</p>
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
                        key={`${countryCode}-${amountValue}`}
                        countryCode={countryCode}
                        amountValue={amountValue}
                        themeKey={themeKey}
                        openFirst={openFirst}
                        simulateRetry={simulateRetry}
                        shopperEmail={shopperEmail || undefined}
                        billingAddressRequired={billingAddressRequired}
                        onOutcome={setEvent}
                    />
                </div>
            )}

            <TestCardsPanel />

            {/* ── Behind the scenes ── */}
            <div className="behind-scenes">
                <h2 className="behind-scenes-title">Behind the scenes</h2>
                <p className="behind-scenes-subtitle">
                    What the backend sees — order lifecycle driven by Adyen webhooks.
                </p>
                <OutcomePanel event={event} />
                <OrdersPanel />
            </div>
        </main>
    );
}
