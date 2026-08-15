# Architecture

A demo of the [Adyen Drop-in](https://www.npmjs.com/package/@adyen/adyen-web) **Sessions flow**: React frontend, Node.js/Express backend, Adyen as the payment processor.

## System overview

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

## End-to-end payment flow

**1. Start a session.**
The shopper configures a country and amount in the settings panel, optionally enters their email on the store page, and clicks **Proceed to checkout**. `DropinContainer` mounts and posts to `POST /api/sessions`. No session is created for shoppers who abandon before clicking.

**2. Backend creates the Adyen session.**
`sessions.js` holds the private API key and calls Adyen's `/sessions` with:

| Field | Value |
|---|---|
| `merchantAccount` | from `ADYEN_MERCHANT_ACCOUNT` |
| `amount.value` | `Math.round(amountValue)` — guarded to positive integer, falls back to 1999 |
| `amount.currency` | from `COUNTRY_PRESETS[countryCode].currency` |
| `countryCode` | from request |
| `shopperLocale` | from `COUNTRY_PRESETS[countryCode].shopperLocale` |
| `reference` | `demo-<uuid>` generated per request |
| `returnUrl` | `https://www.adyen.com` |
| `channel` | `Web` |
| `storePaymentMethodMode` | `askForConsent` |
| `recurringProcessingModel` | `CardOnFile` |
| `shopperReference` | `shopperEmail` if provided, else `demo-shopper-001` |
| `shopperEmail` | included when provided (enables Click to Pay) |

Adyen resolves which payment methods are eligible for that combination and returns an encrypted `sessionData` blob.

**3. Backend opens an order record.**
A `pending` order is created in `orderStore.js` keyed by `reference` before the response is sent.

**4. Drop-in renders and submits.**
The browser initialises `AdyenCheckout({ session, clientKey, environment })` and mounts `Dropin`. From this point the Drop-in talks to Adyen directly via the public `clientKey` — it fetches localised payment method UI, tokenises card data client-side, and submits the payment without the backend touching cardholder data.

**5. Result handling.**
- **Card / inline methods**: `onPaymentCompleted` or `onPaymentFailed` fires with a `resultCode`. The app auto-returns to the store page after 2.5 seconds on success.
- **Redirect methods (iDEAL, Bancontact, etc.)**: shopper is sent to their bank, then to `returnUrl` (`https://www.adyen.com`). `ResultPage` exists in the frontend at `/result` but is not triggered in the current configuration.

**6. Webhook is the authoritative outcome.**
Independently of the browser, Adyen calls `POST /api/webhooks/notifications` once the payment settles. The webhook updates the order record that `OutcomePanel` polls every 2 seconds via `GET /api/orders/:reference`. The panel shows both the client-side `resultCode` and the webhook-confirmed status side by side — the gap between them is the entire reason webhook-driven status exists.

## Security boundary

| Concern | Owner |
|---|---|
| Private Adyen API key | Backend only — loaded from `.env`, never sent to the browser |
| Cardholder data (PAN, CVC) | Never touches the backend; tokenised client-side by the Drop-in |
| Which payment methods to show | Adyen, based on `countryCode` / `amount` / `shopperLocale` — zero payment-method logic in this codebase |
| Confirming a payment succeeded | Backend only, via HMAC-verified webhook — never trusted from the browser |
| CORS | `server.js` restricts `Access-Control-Allow-Origin` to `FRONTEND_URL` |
| `clientKey` scope | Restricted to the frontend origin via Adyen's "Allowed origins" in the Customer Area — cannot be used from a different origin or from a server |

## Where state lives

`backend/src/services/orderStore.js` is an in-memory `Map` keyed by `merchantReference`. Its interface (`createOrder` / `applyWebhookEvent` / `getOrder`) is shaped to be swappable for a real database without touching the routes. In production this would be a database row — the in-memory store loses all pending orders on restart.

## Payment lifecycle

Order states are driven entirely by webhook `eventCode`/`success` pairs (`LIFECYCLE_RULES` in `orderStore.js`):

```
pending ──AUTHORISATION(true)──> authorised ──CAPTURE(true)──> captured ──REFUND(true)──> refunded
   │                                  │
   ├──AUTHORISATION(false)──> failed  ├──CANCELLATION(true)──> cancelled
   │                                  └──CHARGEBACK──────────> chargeback
   └──EXPIRE──────────────────> expired
```

Every transition is appended to `order.history` (not overwritten), so the full event trail — including failed captures or later chargebacks — is inspectable in the "Recent orders" panel.

## Card configuration

The card payment method is configured beyond the Drop-in defaults:

| Option | Value | Purpose |
|---|---|---|
| `hasHolderName` | `true` | Shows cardholder name field |
| `holderNameRequired` | `true` | Makes it mandatory |
| `billingAddressRequired` | controlled by settings toggle | Collects postcode + country for AVS |
| `billingAddressMode` | `"partial"` when enabled | Collects postcode + country only |
| `onBinLookup` | callback | Fires after 6–8 digits; displays brand, issuing country, 3DS support in a live panel |

## Save card (tokenisation)

Passing `storePaymentMethodMode: "askForConsent"` in the session causes the Drop-in to render a save card checkbox. The shopper opts in explicitly. Combined with `recurringProcessingModel: "CardOnFile"` and a `shopperReference`, Adyen stores the tokenised card against that shopper identity on authorisation.

This requires tokenisation to be enabled on the merchant account in the Customer Area (Account → Settings → Recurring). Without it the session creation returns error 702.

## Click to Pay

When the shopper enters an email on the store page, it flows through three levels:

1. **Backend → Adyen `/sessions`** (`shopperEmail` field) — triggers Visa/Mastercard SRC recognition lookup.
2. **`AdyenCheckout` session object** (`session.shopperEmail`) — tells the Drop-in a recognised shopper may be present.
3. **`clickToPayConfiguration`** (`shopperEmail`, `locale` as `en_US`) — activates the Click to Pay UI inside the card form.

`clickToPayConfiguration.locale` uses underscore format (`en_US`), while `AdyenCheckout` uses hyphen (`en-US`). The code normalises with `.replace("-", "_")`.

If no email is provided, `clickToPayConfiguration` is omitted and the card form behaves normally.

## Idempotency

**API-level — session creation.**
Each call to `POST /api/sessions` uses the generated `reference` as the `Idempotency-Key` header sent to Adyen. The "Simulate network retry" toggle in the settings panel calls `/sessions` twice with the same key. The response panel shows both returned session IDs — they are always identical, proving Adyen cannot create a duplicate session on a retry.

**Webhook-level — duplicate delivery.**
Adyen delivers webhooks at-least-once and retries with backoff for up to ~24 hours. `backend/src/services/idempotencyStore.js` derives a key from `(eventCode, pspReference, success)` and skips re-applying a transition already seen. Processed keys are stored with a timestamp and swept after 24 hours. The endpoint still responds `[accepted]` for duplicates so Adyen stops retrying.

**Frontend — double submission.**
`DropinContainer` holds a `submittedRef` flag set to `true` in `beforeSubmit` the first time the shopper confirms payment. Any subsequent call within the same session calls `actions.reject()` immediately, preventing a duplicate `/payments` request from a double-tap or re-render race. The flag resets on component unmount (country or amount change triggers a remount).

## Webhook reliability

- **HMAC verification** — `hmacValidator.validateHMAC(item, ADYEN_HMAC_KEY)` is called per notification item. A failed signature rejects the whole batch with `401` rather than partially trusting the payload. If `ADYEN_HMAC_KEY` is not set, processing continues with a warning (local development only).
- **Fast acknowledgement** — `[accepted]` is returned as soon as in-memory processing finishes. A production deployment would ack first and hand items to a queue/worker so a slow downstream (database, email, fulfilment) cannot blow Adyen's response-time budget and trigger avoidable retries.
- **Unknown references ignored** — notifications for a `merchantReference` not in the order store are logged and skipped, then acknowledged so Adyen stops retrying.

## Global scaling

`COUNTRY_PRESETS` in `sessions.js` is the only country-specific code in the entire codebase:

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

- **Adding a country** — one line in `COUNTRY_PRESETS`. If the merchant account has a local payment method enabled for that market (e.g. PIX for Brazil), it appears in the Drop-in automatically on the next session.
- **Multi-currency** — `amount.currency` changes per country; the Drop-in renders the correct currency because Adyen echoes it in the session response.
- **Localisation** — `shopperLocale` drives the Drop-in's UI language with no hardcoded strings in this codebase.
- **Horizontal scaling** — the backend holds no per-request in-process state beyond the order ledger. Moving the ledger to a shared database makes the service safe to run behind a load balancer — a webhook can land on any replica and still update the correct order.
- **Multiple merchant accounts** — resolving `merchantAccount` from `countryCode` in `sessions.js` instead of using a single config value is all that is needed for per-region account separation.

## Frontend theming

`frontend/src/lib/themes.js` defines five themes (default, black, blue, purple, green). Switching themes calls `applyTheme(domNode, themeKey)` which sets Adyen's public CSS custom properties on the Drop-in's mount node:

```
--adyen-sdk-color-background-always-dark        (pay button fill)
--adyen-sdk-color-background-always-dark-active (pay button active)
--adyen-sdk-color-background-inverse-primary-hover
--adyen-sdk-color-label-primary
--adyen-sdk-color-outline-primary-active
--adyen-sdk-focus-ring-color
```

Switching themes clears all previously set custom properties first, so reverting to the default leaves no stale overrides. No session refetch or component remount is required.

Structural overrides outside the custom-property API live in `frontend/src/styles/override.css` and target internal Adyen class names — these may need revisiting on major `@adyen/adyen-web` version bumps.
