# adyen-drop-in-component

A full-stack demo of the [Adyen Drop-in](https://www.npmjs.com/package/@adyen/adyen-web) (v6) using the **Sessions flow**: React frontend, Node.js/Express backend.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the system design, payment lifecycle, reliability, and scaling notes.

## Features

**Payment methods**
- Cards (Visa, Mastercard, Amex), iDEAL, Bancontact, PayPal, Google Pay, Apple Pay — payment methods are resolved by Adyen based on country, no hardcoding
- Redirect methods (iDEAL, etc.) return to `https://www.adyen.com` after bank flow

**Card configuration**
- Cardholder name (required)
- Live BIN lookup panel — shows brand, issuing country, and 3DS support after the first 6–8 digits
- Optional partial billing address (postcode + country) for AVS fraud checks
- Save card checkbox (`storePaymentMethodMode: "askForConsent"`) — shopper consents to tokenisation, token stored as `CardOnFile`
- Click to Pay — enter a shopper email and Visa/Mastercard silently recognise returning shoppers via SRC

**Developer demos**
- Simulate network retry — calls `/sessions` twice with the same idempotency key and shows both returned session IDs side by side, confirming Adyen returns the same session
- Webhook-driven order lifecycle — `OutcomePanel` shows the Drop-in's immediate `resultCode` alongside the backend's webhook-confirmed status, deliberately side by side so the gap is visible
- Recent orders table — click any row to expand the full event history (pending → authorised → captured → refunded etc.)

**UX**
- Two-column store page: demo settings on the left, product card + shopper form on the right
- Floating 💳 test cards bubble — click to open a panel with copyable card numbers, expiries, and CVCs grouped by scenario
- After a successful payment the app returns to the store page automatically
- Five accent-color theme swatches update the Drop-in's CSS custom properties at runtime without remounting

## Structure

```
backend/   Node.js/Express — session creation, webhook verification, order lifecycle
frontend/  React (Vite) — Drop-in, controls, outcome panel, orders table
```

## Prerequisites

- Node.js 20+
- An Adyen **test** merchant account with tokenisation enabled, API key, and client key
  (Customer Area → Developers → API credentials)

## Setup

```bash
cd backend && npm install
cd ../frontend && npm install
```

Copy the env templates and fill in your credentials:

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
# terminal 1
cd backend && npm run dev

# terminal 2
cd frontend && npm run dev
```

Open `http://localhost:8080`.

## Webhooks

Adyen posts webhook notifications server-to-server, so your backend needs a public URL during local development:

```bash
cloudflared tunnel --url http://localhost:8081
```

Then register the webhook and write the HMAC key into `backend/.env` automatically:

```bash
./setup-webhook.sh https://<your-tunnel-url>
```

Without a webhook the Drop-in still completes payments end-to-end, but orders stay in `pending` — the webhook is what confirms the outcome and drives the order lifecycle.

## Test cards

Use the floating 💳 button in the bottom-right corner of the app. All numbers are from [Adyen's official test card list](https://docs.adyen.com/development-resources/test-cards-and-credentials/test-card-numbers).

| Scenario | Card | Expiry | CVC |
|---|---|---|---|
| Authorised | Visa `4111 1111 1111 1111` | 03/30 | 737 |
| Authorised | Mastercard `5555 5555 5555 4444` | 03/30 | 737 |
| Authorised | Amex `3700 0000 0000 002` | 03/30 | 7373 |
| 3DS2 challenge | Visa `4917 6100 0000 0000` | 03/30 | 737 |
| 3DS2 challenge | Mastercard `5454 5454 5454 5454` | 03/30 | 737 |
| Refused | Any card above, cardholder name: `DECLINED` | — | — |

For 3DS challenge cards, type `password` when the OTP modal appears.

## Tests

```bash
cd backend && npm test
```

Covers the webhook → order lifecycle mapping and idempotent handling of duplicate notifications.

## Demo scope

The order ledger is an in-memory `Map` — see [ARCHITECTURE.md](ARCHITECTURE.md#where-state-lives). Targets a single Adyen test merchant account. Save card requires tokenisation to be enabled on the merchant account (Customer Area → Account → Settings → Recurring).
