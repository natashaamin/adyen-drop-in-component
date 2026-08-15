# adyen-drop-in-component

A full-stack demo of the [Adyen Drop-in](https://www.npmjs.com/package/@adyen/adyen-web) (v6) using the **Sessions flow**: React frontend, Node.js/Express backend.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the system design, payment lifecycle, reliability, and scaling notes.

## Features

**Payment**
- Cards, iDEAL, Bancontact, PayPal, Google Pay, Apple Pay — resolved by Adyen per country, no hardcoding
- Cardholder name required on card form
- Live BIN lookup panel — brand, issuing country, and 3DS support shown after the first 6–8 digits
- Optional partial billing address (postcode + country) for AVS fraud checks
- Save card checkbox — `storePaymentMethodMode: "askForConsent"` with `recurringProcessingModel: "CardOnFile"` (requires tokenisation enabled on the merchant account)
- Click to Pay — enter a shopper email and Visa/Mastercard silently recognise returning shoppers via SRC

**Developer demos**
- Simulate network retry — calls `/sessions` twice with the same idempotency key and shows both session IDs side by side, proving Adyen returns the same one
- Webhook-driven order lifecycle — `OutcomePanel` shows the Drop-in's client-side `resultCode` alongside the backend's webhook-confirmed status, deliberately side by side so the gap is visible
- Recent orders table — click any row to expand the full event history

**UX**
- Two-column store page: settings panel always visible on the left, product card on the right
- Floating 💳 test card bubble — click to open a panel with copyable card numbers, expiries, and CVCs
- After a successful card payment the app automatically returns to the store page after 2.5 seconds
- Five accent-colour theme swatches update the Drop-in's CSS custom properties at runtime without remounting

## Project structure

```
backend/
  src/
    config.js                  env vars
    server.js                  Express app, CORS, routes
    routes/
      sessions.js              POST /api/sessions, GET /api/config
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
      ControlsPanel.jsx        country, amount, theme, toggles
      DropinContainer.jsx      AdyenCheckout + Dropin lifecycle
      OutcomePanel.jsx         resultCode vs webhook status
      OrdersPanel.jsx          recent orders table with history
      TestCardsPanel.jsx       floating test card bubble
      ResultPage.jsx           /result route (not active — see note below)
    lib/
      api.js                   frontend → backend fetch helpers
      themes.js                CSS custom property themes
    styles/
      index.css                app styles
      override.css             Adyen Drop-in structural overrides
```

## Prerequisites

- Node.js 20+
- An Adyen **test** merchant account, API key, and client key (Customer Area → Developers → API credentials)
- Tokenisation enabled on the merchant account for save card to work (Customer Area → Account → Settings → Recurring)

## Setup

```bash
cd backend && npm install
cd ../frontend && npm install
```

```bash
cp backend/.env.example backend/.env
```

`backend/.env`:

```
ADYEN_API_KEY=...
ADYEN_MERCHANT_ACCOUNT=...
ADYEN_CLIENT_KEY=...
ADYEN_ENVIRONMENT=TEST
ADYEN_HMAC_KEY=...
PORT=8081
FRONTEND_URL=http://localhost:8080
```

`ADYEN_CLIENT_KEY` must have `http://localhost:8080` listed as an **Allowed origin** in the Customer Area.

## Running locally

```bash
# terminal 1 — backend
cd backend && npm run dev

# terminal 2 — frontend
cd frontend && npm run dev
```

Open `http://localhost:8080`.

## Webhooks

Adyen delivers webhook notifications server-to-server, so your backend needs a public URL:

```bash
cloudflared tunnel --url http://localhost:8081
```

Register the webhook and write the HMAC key into `backend/.env` automatically:

```bash
./setup-webhook.sh https://<your-tunnel-url>
```

Without a webhook the Drop-in completes payments end-to-end, but orders stay in `pending` — the webhook is what confirms the outcome and drives lifecycle transitions.

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

- **`ResultPage`** (`/result`) handles the redirect return for iDEAL, Bancontact, and similar methods. After the shopper completes payment at their bank, Adyen redirects to `http://localhost:8080/result?reference=...&sessionId=...`. `ResultPage` resumes the session client-side and polls the backend for the webhook-confirmed status.
- The order ledger is an in-memory `Map` — see [ARCHITECTURE.md](ARCHITECTURE.md#where-state-lives).
