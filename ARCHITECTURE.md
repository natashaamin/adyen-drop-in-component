# Architecture

A demo of the [Adyen Drop-in](https://www.npmjs.com/package/@adyen/adyen-web) **Sessions flow**: React frontend, Node.js/Express backend, Adyen as the payment processor.

```
┌──────────────────┐        ┌───────────────┐        ┌───────────────┐
│     Browser      │        │  Node/Express │        │  Adyen APIs   │
│ (React + Drop-in)│        │    backend    │        │ (test/live)   │
└────────┬─────────┘        └───────┬───────┘        └───────┬───────┘
         │ 1. POST /api/sessions    │                         │
         ├─────────────────────────>│                         │
         │                          │ 2. POST /sessions        │
         │                          ├────────────────────────>│
         │                          │ 3. sessionId + data      │
         │                          │<────────────────────────┤
         │ 4. sessionId + data      │                         │
         │<─────────────────────────┤                         │
         │ 5. Drop-in renders, shopper submits directly        │
         ├────────────────────────────────────────────────────>
         │ 6. resultCode (UX hint, not authoritative)          │
         │<────────────────────────────────────────────────────
         │                          │ 7. webhook (authoritative outcome)
         │                          │<────────────────────────┤
         │ 8. poll GET /api/orders  │                         │
         ├─────────────────────────>│                         │
```

## End-to-end payment flow

1. **Start a session.** The shopper picks a country, optionally enters their email, and clicks **Proceed to checkout**. `DropinContainer` mounts and posts to `POST /api/sessions` — no session is created for shoppers who abandon before clicking.

2. **Backend creates the Adyen session.** The backend holds the private API key and calls Adyen's `/sessions` with `merchantAccount`, `amount`, `countryCode`, `shopperLocale`, a generated `reference`, `storePaymentMethodMode`, `recurringProcessingModel`, `shopperReference`, and — when provided — `shopperEmail`. Adyen resolves which payment methods are eligible for that combination and returns an encrypted `sessionData` blob.

3. **Hand session back to the browser.** `sessionId`, `sessionData`, `clientKey`, `environment`, and `shopperEmail` go back to the browser. The backend opens an order record in `pending` state keyed by `reference`.

4. **Drop-in renders and submits.** The browser initialises `AdyenCheckout({ session, clientKey, environment })` and mounts `Dropin`. From this point the Drop-in talks to Adyen directly via the public `clientKey` — it fetches localised payment method UI, tokenises card data client-side, and submits the payment without the backend touching cardholder data.

5. **Result handling.** For inline methods (cards, wallets), `onPaymentCompleted`/`onPaymentFailed` fire with a `resultCode`. For redirect methods (iDEAL, Bancontact, etc.), the shopper is sent to their bank and then to `https://www.adyen.com` as the `returnUrl`. After a successful card payment the app automatically returns to the store page after 2.5 seconds.

6. **The webhook is the authoritative outcome.** Independently of the browser, Adyen calls `POST /api/webhooks/notifications` once the payment settles. This updates the order record that the frontend polls via `GET /api/orders/:reference`. `OutcomePanel` shows both the client-side `resultCode` and the webhook-confirmed status side by side — the gap between them is why webhook-driven status exists.

## Security boundary

| Concern | Owner |
|---|---|
| Private Adyen API key | Backend only — never sent to the browser |
| Cardholder data (PAN, CVC) | Never touches the backend; tokenised client-side by the Drop-in |
| Which payment methods to show | Adyen, based on `countryCode`/`amount`/`shopperLocale` — no payment-method logic in this codebase |
| Confirming a payment succeeded | Backend only, via HMAC-verified webhook |
| CORS | Backend accepts requests only from `FRONTEND_URL` |
| `clientKey` scope | Restricted to the frontend origin via Adyen's "Allowed origins" — cannot be used from a server or unrelated origin |

## Where state lives

`backend/src/services/orderStore.js` is an in-memory `Map` keyed by `merchantReference`. Its interface (`createOrder` / `applyWebhookEvent` / `getOrder`) is shaped to be swappable for a real database without touching the routes. In production this would be a database row — an in-memory store loses all pending orders on restart.

## Payment lifecycle

Order states are driven entirely by webhook `eventCode`/`success` pairs:

```
pending ──AUTHORISATION(true)──> authorised ──CAPTURE(true)──> captured ──REFUND(true)──> refunded
   │                                  │
   ├──AUTHORISATION(false)──> failed  ├──CANCELLATION(true)──> cancelled
   │                                  └──CHARGEBACK──────────> chargeback
   └──EXPIRE──────────────────> expired
```

Every transition is appended to `order.history` rather than overwriting, so the full lifecycle stays inspectable in the "Recent orders" panel.

## Card configuration

The card form is configured with several options beyond the defaults:

- **Cardholder name** (`hasHolderName`, `holderNameRequired`) — collected and passed to Adyen for name-on-card verification.
- **BIN lookup** (`onBinLookup`) — fires after the first 6–8 digits. Returns the detected card brand, issuing country code, and 3DS support flag. Surfaced in a live info panel above the form.
- **Partial billing address** (`billingAddressRequired`, `billingAddressMode: "partial"`) — collects postcode and country for AVS checks. Toggled via the demo settings panel; takes effect on the next session.

## Save card (tokenisation)

The session is created with:

```js
storePaymentMethodMode: "askForConsent",
recurringProcessingModel: "CardOnFile",
shopperReference: shopperEmail || "demo-shopper-001"
```

`askForConsent` causes the Drop-in to render a save card checkbox. The shopper opts in explicitly. If they do, Adyen stores the tokenised card against the `shopperReference`. On future payments the same `shopperReference` allows the merchant to offer that card without re-entry.

This requires tokenisation to be enabled on the merchant account (Customer Area → Account → Settings → Recurring).

## Click to Pay

When the shopper enters an email on the store page, the backend includes `shopperEmail` in the Adyen `/sessions` call. Visa and Mastercard receive the email via Adyen's SRC (Secure Remote Commerce) integration and silently check whether the shopper has saved Click to Pay cards.

The email must flow through three levels for CTP to activate:

1. **Backend → Adyen `/sessions`** — triggers the SRC recognition lookup.
2. **`AdyenCheckout` session object** — `session.shopperEmail` tells the Drop-in a recognised shopper may be present.
3. **`clickToPayConfiguration`** — `shopperEmail` and `locale` (formatted as `en_US`) activate the Click to Pay UI inside the card form.

If no email is supplied, `clickToPayConfiguration` is omitted and the card form behaves normally.

## Idempotency

**API-level (session creation).** Each session request uses the merchant `reference` as the `Idempotency-Key` header. The "Simulate network retry" toggle calls `/sessions` twice with the same key; Adyen returns the same session both times, demonstrating that a network retry cannot create a duplicate charge. The panel shows both session IDs side by side to confirm they match.

**Webhook-level (duplicate delivery).** Adyen delivers webhooks at-least-once. `backend/src/services/idempotencyStore.js` derives a key from `(eventCode, pspReference, success)` and skips re-applying a transition already seen, while still responding `[accepted]`.

**Frontend (double submission).** `DropinContainer` holds a `submittedRef` flag set in `beforeSubmit`. Any subsequent call within the same session calls `actions.reject()` immediately, preventing a duplicate `/payments` request from a double-tap or re-render race.

## Webhook reliability

- **HMAC verification** — every notification item is verified with `hmacValidator.validateHMAC` before touching the order store. A request failing verification returns `401`.
- **Fast acknowledgement** — `[accepted]` is returned as soon as processing finishes. A slow downstream should ack first and hand the item to a queue/worker to avoid triggering avoidable Adyen retries.
- **Unknown references are ignored** — notifications for references this backend has never seen are logged and skipped, then acknowledged so Adyen stops retrying.

## Global scaling

`COUNTRY_PRESETS` in `backend/src/routes/sessions.js` maps a country code to the `currency` and `shopperLocale` for the session request. That is the only country-specific logic in the codebase:

- **Adding a country** — one line in `COUNTRY_PRESETS`. If the merchant account has a local payment method enabled for that market, it appears in the Drop-in automatically.
- **Multi-currency** — `amount.currency` changes per country; the Drop-in renders amounts correctly because Adyen echoes the currency in the session response.
- **Localisation** — `shopperLocale` (e.g. `nl-NL`, `ja-JP`) drives the Drop-in's UI language with no hardcoded strings in this codebase.
- **Horizontal scaling** — the backend holds no per-request in-process state beyond the order ledger. Moving the ledger to a shared database makes the service safe to run behind a load balancer; a webhook can land on any replica and still update the same order.
- **Multiple merchant accounts** — resolving `merchantAccount` from `countryCode` in `sessions.js` instead of using a single config value is all that is needed for per-region account separation.

## Frontend theming

Switching themes sets CSS custom properties documented by Adyen as their public UI Customization API (pay-button background/hover/active, selected-payment-method border, radio-button fill, focus ring) — see `frontend/src/lib/themes.js`. This is a synchronous style update on the Drop-in's mount node; it does not require re-fetching a session or remounting the component.

Structural overrides outside the custom-property API live in `frontend/src/styles/override.css`. These target internal class names (`.adyen-checkout__payment-method`, `.adyen-checkout__button--pay`, etc.) and may need revisiting on major `@adyen/adyen-web` version bumps.
