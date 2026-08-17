# adyen-drop-in-component

A full-stack demo of the [Adyen Drop-in](https://www.npmjs.com/package/@adyen/adyen-web) (v6) using React, Node.js/Express, and Adyen test credentials. Supports both the **Sessions flow** and the **Advanced flow**, switchable at runtime without restarting.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the system design, payment lifecycle, reliability, and scaling notes.

## Features

**Payment**
- Cards, iDEAL, SEPA Direct Debit, PayPal, Google Pay, Apple Pay, Klarna, WeChat Pay, gift cards — resolved by Adyen per country, no hardcoding
- Full Drop-in bundle via `@adyen/adyen-web/auto` — all payment method components registered automatically, no manual list needed
- Cardholder name required on card form
- Live BIN lookup panel — brand, issuing country, and 3DS support shown after the first 6–8 digits
- Optional partial billing address (postcode + country) for AVS fraud checks
- Save card checkbox — `storePaymentMethodMode: "askForConsent"` with `recurringProcessingModel: "CardOnFile"` (requires tokenisation enabled on the merchant account)
- Click to Pay — enter a shopper email and Visa/Mastercard silently recognise returning shoppers via SRC

**Developer demos**
- Switch between Sessions flow and Advanced flow without restarting
- Simulate network retry — calls `/sessions` twice with the same idempotency key and shows both session IDs side by side, proving Adyen returns the same one (Sessions flow only)
- Webhook-driven order lifecycle — after payment, `OutcomePanel` shows the webhook-confirmed status and full lifecycle event history (pending → authorised → captured etc.)
- Recent orders table — click any row to expand the full event history

**UX**
- Two-column store page: settings panel always visible on the left, product card on the right
- Floating 💳 test card bubble — click to open a panel with copyable card numbers, expiries, and CVCs
- After payment, shows an order confirmation page ("Your order has been placed") with the webhook-driven payment lifecycle — no auto-redirect
- Five accent-colour theme swatches update the Drop-in's CSS custom properties at runtime without remounting

## Project structure

```
backend/
  src/
    config.js                  env vars
    server.js                  Express app, CORS, routes
    routes/
      sessions.js              POST /api/sessions, GET /api/config, COUNTRY_PRESETS
      payments.js              POST /api/payment-methods, /payments, /payments/details
      webhooks.js              POST /api/webhooks/notifications
      orders.js                GET /api/orders, GET /api/orders/:ref
    services/
      adyenClient.js           Adyen SDK client
      orderStore.js            in-memory order ledger
      idempotencyStore.js      webhook de-duplication (24h TTL)

frontend/
  src/
    App.jsx                    store page + checkout page routing
    components/
      ControlsPanel.jsx        country, amount, theme, flow toggle
      DropinContainer.jsx      AdyenCheckout + Dropin lifecycle (Sessions & Advanced)
      OutcomePanel.jsx         resultCode vs webhook status
      OrdersPanel.jsx          recent orders table with history
      TestCardsPanel.jsx       floating test card bubble
      ResultPage.jsx           /result route (redirect-based payment methods)
    lib/
      api.js                   frontend → backend fetch helpers
      themes.js                CSS custom property themes
    styles/
      index.css                app styles
      override.css             Adyen Drop-in structural overrides
```

## Prerequisites

- Node.js 20+
- [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) — exposes your local backend so Adyen can deliver webhooks
  - macOS: `brew install cloudflared`

## Running locally

```bash
./dev.sh
```

That single command:
1. Installs npm dependencies for both backend and frontend (skipped on subsequent runs)
2. Starts a Cloudflare tunnel and captures its public URL
3. Registers the tunnel URL as the Adyen webhook endpoint and writes a fresh HMAC key to `backend/.env`
4. Starts the backend (`http://localhost:8081`) and frontend (`http://localhost:8080`)

Open `http://localhost:8080`. Press `Ctrl+C` to stop everything.

> **Without webhooks** the Drop-in completes payments end-to-end, but orders stay in `pending` — the webhook is what confirms the outcome and drives lifecycle transitions.

## Integration flows

The **Integration flow** toggle in the settings panel switches between two modes at runtime:

| | Sessions | Advanced |
|---|---|---|
| Backend endpoint | `POST /api/sessions` | `POST /api/payment-methods` → `POST /api/payments` → `POST /api/payments/details` |
| Frontend config | `session: { id, sessionData }` | `paymentMethodsResponse` + `onSubmit` + `onAdditionalDetails` |
| Who calls Adyen `/payments` | Adyen SDK internally | Your backend |
| Idempotency retry demo | Available | Not shown |

Use **Sessions** for simplicity. Use **Advanced** to see how each step (payment method list, authorisation, 3DS/redirect resolution) maps to a separate backend call.

## Test cards

Use the floating 💳 button in the bottom-right corner of the app. All numbers are from [Adyen's official test card list](https://docs.adyen.com/development-resources/test-cards-and-credentials/test-card-numbers).

| Scenario | Card | Expiry | CVC |
|---|---|---|---|
| Authorised — no 3DS | Visa `4111 1111 1111 1111` | 03/30 | 737 |
| Authorised — no 3DS | Mastercard `5555 5555 5555 4444` | 03/30 | 737 |
| Authorised — no 3DS | Amex `3700 0000 0000 002` | 03/30 | 7373 |
| 3DS2 challenge | Visa `4917 6100 0000 0000` | 03/30 | 737 |
| 3DS2 challenge | Mastercard `5454 5454 5454 5454` | 03/30 | 737 |
| Refused | Any card above, cardholder name: `DECLINED` | — | — |

For 3DS challenge cards, enter `password` when the OTP modal appears.

## Tests

```bash
cd backend && npm test
```

Covers the webhook → order lifecycle mapping and idempotent handling of duplicate notifications.

## Notes

- **`ResultPage`** (`/result`) handles redirect-based methods (iDEAL, Bancontact, Alipay, etc.) for both flows. After the shopper completes payment at their bank or wallet, Adyen redirects to `http://localhost:8080/result?reference=...`. The page starts polling for the webhook-confirmed status immediately, so the order outcome is visible as soon as the webhook arrives even if the client-side SDK result is not available.
- The order ledger is an in-memory `Map` — see [ARCHITECTURE.md](ARCHITECTURE.md#where-state-lives).
