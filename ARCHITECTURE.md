# Architecture

A demo of the [Adyen Drop-in](https://www.npmjs.com/package/@adyen/adyen-web) supporting two integration flows — **Sessions** and **Advanced** — switchable at runtime via the settings panel. React frontend, Node.js/Express backend, Adyen as the payment processor.

## System overview

### Sessions flow

```
┌──────────────────────┐      ┌────────────────────┐      ┌───────────────┐
│       Browser        │      │   Node/Express      │      │  Adyen APIs   │
│  (React + Drop-in)   │      │     backend         │      │  (test/live)  │
└──────────┬───────────┘      └─────────┬───────────┘      └──────┬────────┘
           │  1. POST /api/sessions     │                          │
           ├───────────────────────────>│                          │
           │                            │  2. POST /sessions       │
           │                            ├─────────────────────────>│
           │                            │  3. sessionId + data     │
           │                            │<─────────────────────────┤
           │  4. sessionId + data       │                          │
           │<───────────────────────────┤                          │
           │  5. Drop-in renders — shopper submits directly        │
           ├──────────────────────────────────────────────────────>│
           │  6. resultCode (UX hint, not authoritative)           │
           │<──────────────────────────────────────────────────────┤
           │                            │  7. webhook (authoritative)
           │                            │<─────────────────────────┤
           │  8. poll GET /api/orders   │                          │
           ├───────────────────────────>│                          │
```

### Advanced flow

```
┌──────────────────────┐      ┌────────────────────┐      ┌───────────────┐
│       Browser        │      │   Node/Express      │      │  Adyen APIs   │
│  (React + Drop-in)   │      │     backend         │      │  (test/live)  │
└──────────┬───────────┘      └─────────┬───────────┘      └──────┬────────┘
           │  1. POST /api/payment-methods                         │
           ├───────────────────────────>│                          │
           │                            │  2. POST /paymentMethods │
           │                            ├─────────────────────────>│
           │                            │<─────────────────────────┤
           │  3. paymentMethodsResponse │                          │
           │<───────────────────────────┤                          │
           │  4. Drop-in renders — onSubmit fires with card data   │
           │  5. POST /api/payments     │                          │
           ├───────────────────────────>│                          │
           │                            │  6. POST /payments       │
           │                            ├─────────────────────────>│
           │                            │  7. resultCode / action  │
           │                            │<─────────────────────────┤
           │  8. resultCode / action    │                          │
           │<───────────────────────────┤                          │
           │  (if action — 3DS or redirect handled by SDK)         │
           │  9. POST /api/payments/details (after challenge)      │
           ├───────────────────────────>│                          │
           │                            │  10. POST /payments/details
           │                            ├─────────────────────────>│
           │                            │<─────────────────────────┤
           │  11. final resultCode      │                          │
           │<───────────────────────────┤                          │
           │                            │  12. webhook (authoritative)
           │                            │<─────────────────────────┤
           │  13. poll GET /api/orders  │                          │
           ├───────────────────────────>│                          │
```

## Choosing a flow

| | Sessions | Advanced |
|---|---|---|
| Backend calls | 1 (`/sessions`) | 3 (`/paymentMethods`, `/payments`, `/payments/details`) |
| Who talks to Adyen `/payments` | Adyen SDK internally | Your backend |
| Idempotency demo | Available | Not shown |
| Custom pre-auth logic | Not possible | Possible (between steps 5 and 6) |
| Partial / split payments | Not supported | Supported |

The toggle in the settings panel remounts `DropinContainer` with the selected flow. Both flows share the same Dropin component configuration, webhook handler, order store, and result page.

## End-to-end payment flow

### Sessions flow

**1. Start a session.**
The shopper configures a country and amount on the store page and clicks **Proceed to checkout**. On the checkout page they enter their name and optionally their email alongside the Drop-in. `DropinContainer` mounts and posts to `POST /api/sessions`.

**2. Backend creates the Adyen session.**
`sessions.js` calls Adyen's `/sessions` with:

| Field | Value |
|---|---|
| `merchantAccount` | from `ADYEN_MERCHANT_ACCOUNT` |
| `amount.value` | `Math.round(amountValue)` — guarded to positive integer, falls back to 1999 |
| `amount.currency` | from `COUNTRY_PRESETS[countryCode].currency` |
| `countryCode` | from request |
| `shopperLocale` | from `COUNTRY_PRESETS[countryCode].shopperLocale` |
| `reference` | `demo-<uuid>` generated per request |
| `returnUrl` | `${FRONTEND_URL}/result?reference=${reference}` |
| `channel` | `Web` |
| `storePaymentMethodMode` | `askForConsent` |
| `recurringProcessingModel` | `CardOnFile` |
| `shopperReference` | `shopperEmail` if provided, else `demo-shopper-001` |
| `shopperEmail` | included when provided (enables Click to Pay) |

**3. Backend opens an order record.**
A `pending` order is created in `orderStore.js` keyed by `reference`.

**4. Drop-in renders and submits.**
The browser initialises `AdyenCheckout({ session, clientKey, environment, locale, amount, countryCode })` and mounts `Dropin`. `DropinContainer` imports from `@adyen/adyen-web/auto` (full bundle) so all payment method component classes are pre-registered — no explicit `paymentMethodComponents` list needed. The `locale` and `amount` fields are required by the Adyen SDK; they are forwarded from the backend session response. The Drop-in talks to Adyen directly via the public `clientKey` — it fetches localised payment method UI, tokenises card data client-side, and submits the payment without the backend touching cardholder data.

### Advanced flow

**1. Fetch payment methods.**
`DropinContainer` posts to `POST /api/payment-methods`. The backend mints the merchant reference, creates the order record, and calls Adyen's `/paymentMethods`. The response (available payment methods for the country/amount) is returned to the browser along with the reference.

**2. Drop-in renders.**
`AdyenCheckout` is initialised with `paymentMethodsResponse`, `locale`, and `amount` (all required by the SDK) instead of a session. Because `@adyen/adyen-web/auto` is used, the Drop-in automatically knows how to render every type in the response (Klarna, SEPA Direct Debit, WeChat Pay, gift cards, etc.) without a `paymentMethodComponents` allowlist.

**3. Shopper submits — `onSubmit` fires.**
The Drop-in calls `onSubmit` with encrypted payment data. The frontend forwards it to `POST /api/payments`, which calls Adyen's `/payments`. The response is passed back to the SDK via `actions.resolve(result)`.

**4. Additional details (3DS / redirect).**
If the result contains an `action`, the SDK handles the 3DS challenge or redirect automatically. Once resolved, `onAdditionalDetails` fires. The frontend posts `state.data` to `POST /api/payments/details`, which calls Adyen's `/payments/details`. The final `resultCode` is passed back via `actions.resolve(result)`.

**5. Final result.**
`onPaymentCompleted` or `onPaymentFailed` fires with the definitive client-side result.

### Result handling (both flows)

- **Card / inline methods**: `onPaymentCompleted` or `onPaymentFailed` fires. `App.jsx` transitions to the **order result page** — a dedicated view showing a success/failure hero banner, the order summary, and `OutcomePanel` (webhook-confirmed status + lifecycle history). No auto-redirect; the shopper clicks "← Back to shop" when ready.
- **Redirect methods (iDEAL, Bancontact, Alipay, etc.)**: The shopper is sent to their bank or wallet, then redirected back to `${FRONTEND_URL}/result?reference=...`. `ResultPage` immediately starts polling the backend for the webhook-confirmed status, so the order outcome is visible as soon as the webhook arrives.

### Webhook is the authoritative outcome (both flows)

Independently of the browser, Adyen calls `POST /api/webhooks/notifications` once the payment settles. The webhook updates the order record that `OutcomePanel` polls every 2 seconds via `GET /api/orders/:reference`. The panel shows the webhook-confirmed status and the full lifecycle event history (e.g. pending → authorised → captured) — the gap between the Drop-in completing and the webhook arriving is the demo's key teaching moment.

## Security boundary

| Concern | Owner |
|---|---|
| Private Adyen API key | Backend only — loaded from `.env`, never sent to the browser |
| Cardholder data (PAN, CVC) | Never touches the backend; tokenised client-side by the Drop-in |
| Which payment methods to show | Adyen, based on `countryCode` / `amount` / `shopperLocale` — zero payment-method logic in this codebase |
| Confirming a payment succeeded | Backend only, via HMAC-verified webhook — never trusted from the browser |
| CORS | `server.js` restricts `Access-Control-Allow-Origin` to `FRONTEND_URL` |
| `clientKey` scope | Restricted to the frontend origin via Adyen's "Allowed origins" in the Customer Area |

## Where state lives

`backend/src/services/orderStore.js` is an in-memory `Map` keyed by `merchantReference`. Its interface (`createOrder` / `applyWebhookEvent` / `getOrder`) is shaped to be swappable for a real database without touching the routes. In production this would be a database row — the in-memory store loses all pending orders on restart.

`COUNTRY_PRESETS` lives in `sessions.js` and is imported by `payments.js` so both flows share the same country-to-currency/locale mapping.

## Payment lifecycle

Order states are driven entirely by webhook `eventCode`/`success` pairs (`LIFECYCLE_RULES` in `orderStore.js`):

```
pending ──AUTHORISATION(true)──> authorised ──CAPTURE(true)──> captured ──REFUND(true)──> refunded
   │                                  │
   ├──AUTHORISATION(false)──> failed  ├──CANCELLATION(true)──> cancelled
   │                                  └──CHARGEBACK──────────> chargeback
   └──EXPIRE──────────────────> expired
```

Every transition is appended to `order.history` (not overwritten), so the full event trail is inspectable in the "Recent orders" panel.

## Card configuration

The card payment method is configured beyond the Drop-in defaults, and is identical across both flows:

| Option | Value | Purpose |
|---|---|---|
| `hasHolderName` | `true` | Shows cardholder name field |
| `holderNameRequired` | `true` | Makes it mandatory |
| `billingAddressRequired` | controlled by settings toggle | Collects postcode + country for AVS |
| `billingAddressMode` | `"partial"` when enabled | Collects postcode + country only |
| `onBinLookup` | callback | Fires after 6–8 digits; displays brand, issuing country, 3DS support in a live panel |

## Save card (tokenisation)

Passing `storePaymentMethodMode: "askForConsent"` causes the Drop-in to render a save card checkbox. Combined with `recurringProcessingModel: "CardOnFile"` and a `shopperReference`, Adyen stores the tokenised card against that shopper identity on authorisation.

In the Sessions flow this is set on the session params. In the Advanced flow it is set on the `/payments` call. Both routes use the same values.

This requires tokenisation to be enabled on the merchant account in the Customer Area (Account → Settings → Recurring). Without it the session creation returns error 702.

## Click to Pay

When the shopper enters an email on the checkout page, it flows through three levels:

1. **Backend** — `shopperEmail` is included in the `/sessions` or `/paymentMethods` call, triggering Visa/Mastercard SRC recognition lookup.
2. **`AdyenCheckout`** — for Sessions flow, `session.shopperEmail` tells the Drop-in a recognised shopper may be present.
3. **`clickToPayConfiguration`** — `shopperEmail` and `locale` (as `en_US`) activate the Click to Pay UI inside the card form.

`clickToPayConfiguration.locale` uses underscore format (`en_US`), while `AdyenCheckout` uses hyphen (`en-US`). The code normalises with `.replace("-", "_")`.

## Idempotency

**API-level — session creation (Sessions flow).**
Each call to `POST /api/sessions` uses the generated `reference` as the `Idempotency-Key` header sent to Adyen. The "Simulate network retry" toggle calls `/sessions` twice with the same key. The response panel shows both returned session IDs — they are always identical, proving Adyen cannot create a duplicate session on a retry. This demo is hidden when the Advanced flow is selected.

**Webhook-level — duplicate delivery.**
Adyen delivers webhooks at-least-once and retries with backoff for up to ~24 hours. `idempotencyStore.js` derives a key from `(eventCode, pspReference, success)` and skips re-applying a transition already seen. Processed keys are stored with a timestamp and swept after 24 hours.

**Frontend — double submission.**
`DropinContainer` holds a `submittedRef` flag set in `beforeSubmit` (Sessions) or `onSubmit` (Advanced) the first time the shopper confirms payment. Any subsequent call calls `actions.reject()` immediately. The flag resets on component unmount.

## Webhook reliability

- **HMAC verification** — `hmacValidator.validateHMAC(item, ADYEN_HMAC_KEY)` is called per notification item. A failed signature rejects the whole batch with `401`. If `ADYEN_HMAC_KEY` is not set, processing continues with a warning (local development only).
- **Fast acknowledgement** — `[accepted]` is returned as soon as in-memory processing finishes. A production deployment would ack first and hand items to a queue/worker so a slow downstream cannot blow Adyen's response-time budget.
- **Unknown references ignored** — notifications for a `merchantReference` not in the order store are logged and skipped, then acknowledged so Adyen stops retrying.

## Global scaling

`COUNTRY_PRESETS` in `sessions.js` (shared with `payments.js`) is the only country-specific code in the entire codebase:

```js
NL: { currency: "EUR", shopperLocale: "nl-NL", label: "Netherlands" },
DE: { currency: "EUR", shopperLocale: "de-DE", label: "Germany" },
BE: { currency: "EUR", shopperLocale: "nl-BE", label: "Belgium" },
GB: { currency: "GBP", shopperLocale: "en-GB", label: "United Kingdom" },
US: { currency: "USD", shopperLocale: "en-US", label: "United States" },
BR: { currency: "BRL", shopperLocale: "pt-BR", label: "Brazil" },
IN: { currency: "INR", shopperLocale: "en-IN", label: "India" },
JP: { currency: "JPY", shopperLocale: "ja-JP", label: "Japan" },
AU: { currency: "AUD", shopperLocale: "en-AU", label: "Australia" },
```

- **Adding a country** — one line in `COUNTRY_PRESETS`. If the merchant account has a local payment method enabled for that market (e.g. PIX for Brazil), it appears in the Drop-in automatically.
- **Multi-currency** — `amount.currency` changes per country; the Drop-in renders the correct currency because Adyen echoes it in the session/payment response.
- **Localisation** — `shopperLocale` drives the Drop-in's UI language with no hardcoded strings in this codebase.
- **Horizontal scaling** — the backend holds no per-request in-process state beyond the order ledger. Moving the ledger to a shared database makes the service safe to run behind a load balancer.
- **Multiple merchant accounts** — resolving `merchantAccount` from `countryCode` in the route files instead of a single config value is all that is needed for per-region account separation.

## Frontend theming

`frontend/src/lib/themes.js` defines five themes (default, black, blue, purple, green). Switching themes calls `applyTheme(domNode, themeKey)` which sets Adyen's public CSS custom properties on the Drop-in's mount node:

```
--adyen-sdk-color-background-always-dark
--adyen-sdk-color-background-always-dark-active
--adyen-sdk-color-background-inverse-primary-hover
--adyen-sdk-color-label-primary
--adyen-sdk-color-outline-primary-active
--adyen-sdk-focus-ring-color
```

Switching themes clears all previously set custom properties first, so reverting to the default leaves no stale overrides. No session refetch or component remount is required.

Structural overrides outside the custom-property API live in `frontend/src/styles/override.css` and target internal Adyen class names — these may need revisiting on major `@adyen/adyen-web` version bumps.
