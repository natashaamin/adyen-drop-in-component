import { THEMES } from "../lib/themes.js";

const MINOR_UNIT_CURRENCIES = new Set(["JPY", "KRW", "HUF", "TWD"]);

function formatAmount(value, currency) {
    if (!currency) return null;
    const amount = MINOR_UNIT_CURRENCIES.has(currency) ? value : value / 100;
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
}

export default function ControlsPanel({
    countries,
    countryCode,
    onCountryChange,
    amountValue,
    onAmountChange,
    themeKey,
    onThemeChange,
    openFirst,
    onOpenFirstChange,
    simulateRetry,
    onSimulateRetryChange,
    billingAddressRequired,
    onBillingAddressRequiredChange,
    flow,
    onFlowChange
}) {
    const currency = countries[countryCode]?.currency ?? "";
    const formatted = formatAmount(amountValue, currency);

    return (
        <div className="controls-panel">
            <h2>Checkout settings</h2>

            <div className="controls-section">
                <p className="controls-section-label">Where is the shopper?</p>
                <label className="control-field">
                    <span>Country</span>
                    <select value={countryCode} onChange={(e) => onCountryChange(e.target.value)}>
                        {Object.entries(countries).map(([code, info]) => (
                            <option key={code} value={code}>
                                {info.label} ({code})
                            </option>
                        ))}
                    </select>
                    <small>Adyen decides which payment methods to show based on this.</small>
                </label>

                <label className="control-field">
                    <span>Amount {formatted && <strong>= {formatted}</strong>}</span>
                    <input
                        type="number"
                        min="1"
                        value={amountValue}
                        onChange={(e) => onAmountChange(Number(e.target.value))}
                    />
                    <small>Enter in minor units — cents, pence, etc. (100 = 1.00 {currency})</small>
                </label>
            </div>

            <div className="controls-divider" />

            <div className="controls-section">
                <p className="controls-section-label">Checkout behaviour</p>
                <label className="control-field">
                    <span>Require billing address</span>
                    <input
                        type="checkbox"
                        checked={billingAddressRequired}
                        onChange={(e) => onBillingAddressRequiredChange(e.target.checked)}
                    />
                    <small>Collects postcode and country for fraud prevention (AVS check).</small>
                </label>

                <label className="control-field">
                    <span>Auto-open first payment method</span>
                    <input
                        type="checkbox"
                        checked={openFirst}
                        onChange={(e) => onOpenFirstChange(e.target.checked)}
                    />
                    <small>Expands the first payment option automatically without a click.</small>
                </label>
            </div>

            <div className="controls-divider" />

            <div className="controls-section">
                <p className="controls-section-label">Developer demos</p>

                <label className="control-field">
                    <span>Integration flow</span>
                    <select value={flow} onChange={(e) => onFlowChange(e.target.value)}>
                        <option value="sessions">Sessions</option>
                        <option value="advanced">Advanced</option>
                    </select>
                    <small>
                        <strong>Sessions</strong> — one <code>/sessions</code> call; Adyen manages
                        the full lifecycle internally.{" "}
                        <strong>Advanced</strong> — your backend calls <code>/paymentMethods</code>,{" "}
                        <code>/payments</code>, and <code>/payments/details</code> directly, giving
                        you full control over each step.
                    </small>
                </label>

                {flow === "sessions" && (
                    <label className="control-field">
                        <span>Simulate network retry</span>
                        <input
                            type="checkbox"
                            checked={simulateRetry}
                            onChange={(e) => onSimulateRetryChange(e.target.checked)}
                        />
                        <small>
                            Calls <code>/sessions</code> twice with the same idempotency key — Adyen returns
                            the same session both times, preventing duplicate charges on retry.
                        </small>
                    </label>
                )}

                <div className="control-field">
                    <span>Drop-in theme</span>
                    <div className="theme-swatches">
                        {Object.entries(THEMES).map(([key, theme]) => (
                            <button
                                type="button"
                                key={key}
                                className={`theme-swatch ${themeKey === key ? "theme-swatch--active" : ""}`}
                                style={{ backgroundColor: theme.swatch }}
                                title={theme.label}
                                aria-label={theme.label}
                                aria-pressed={themeKey === key}
                                onClick={() => onThemeChange(key)}
                            />
                        ))}
                    </div>
                    <small>Changes CSS custom properties on the Drop-in at runtime.</small>
                </div>
            </div>
        </div>
    );
}
