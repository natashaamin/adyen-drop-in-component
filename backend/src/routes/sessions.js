import { Router } from "express";
import { randomUUID } from "node:crypto";
import { checkoutApi } from "../services/adyenClient.js";
import { config } from "../config.js";
import { createOrder } from "../services/orderStore.js";

export const sessionsRouter = Router();

// Maps shopper country to the currency and locale Adyen needs to return
// locally-relevant payment methods (e.g. iDEAL for NL, Bancontact for BE).
export const COUNTRY_PRESETS = {
    NL: { currency: "EUR", shopperLocale: "nl-NL", label: "Netherlands" },
    DE: { currency: "EUR", shopperLocale: "de-DE", label: "Germany" },
    BE: { currency: "EUR", shopperLocale: "nl-BE", label: "Belgium" },
    GB: { currency: "GBP", shopperLocale: "en-GB", label: "United Kingdom" },
    US: { currency: "USD", shopperLocale: "en-US", label: "United States" },
    BR: { currency: "BRL", shopperLocale: "pt-BR", label: "Brazil" },
    IN: { currency: "INR", shopperLocale: "en-IN", label: "India" },
    JP: { currency: "JPY", shopperLocale: "ja-JP", label: "Japan" },
    AU: { currency: "AUD", shopperLocale: "en-AU", label: "Australia" }
};

sessionsRouter.get("/config", (_req, res) => {
    res.json({
        clientKey: config.adyen.clientKey,
        environment: config.adyen.environment.toLowerCase(),
        countries: COUNTRY_PRESETS
    });
});

sessionsRouter.post("/sessions", async (req, res) => {
    const { countryCode = "NL", amountValue, simulateRetry = false, shopperEmail } = req.body ?? {};
    const preset = COUNTRY_PRESETS[countryCode];

    if (!preset) {
        return res.status(400).json({ error: `Unsupported countryCode "${countryCode}"` });
    }

    const reference = `demo-${randomUUID()}`;
    const rawValue = Math.round(Number(amountValue));
    const amount = {
        value: Number.isFinite(rawValue) && rawValue > 0 ? rawValue : 1999,
        currency: preset.currency
    };

    const sessionParams = {
        merchantAccount: config.adyen.merchantAccount,
        amount,
        countryCode,
        shopperLocale: preset.shopperLocale,
        reference,
        returnUrl: "https://www.adyen.com",
        channel: "Web",
        storePaymentMethodMode: "askForConsent",
        recurringProcessingModel: "CardOnFile",
        shopperReference: shopperEmail || "demo-shopper-001",
        ...(shopperEmail && { shopperEmail })
    };

    try {
        const session = await checkoutApi.PaymentsApi.sessions(sessionParams, { idempotencyKey: reference });

        createOrder(reference, { amount, countryCode, shopperLocale: preset.shopperLocale });

        // Demonstrate idempotency: calling /sessions twice with the same key returns
        // the same session, so a network retry cannot create a duplicate charge.
        let retryDemo = null;
        if (simulateRetry) {
            const retry = await checkoutApi.PaymentsApi.sessions(sessionParams, { idempotencyKey: reference });
            retryDemo = {
                firstCallId: session.id,
                secondCallId: retry.id,
                sameSession: session.id === retry.id
            };
        }

        res.json({
            sessionId: session.id,
            sessionData: session.sessionData,
            reference,
            shopperEmail: session.shopperEmail ?? shopperEmail,
            clientKey: config.adyen.clientKey,
            environment: config.adyen.environment.toLowerCase(),
            ...(retryDemo && { retryDemo })
        });
    } catch (error) {
        console.error("[sessions] failed to create session", error?.message ?? error);
        res.status(error?.statusCode ?? 500).json({
            error: "Failed to create Adyen checkout session",
            adyenErrorCode: error?.errorCode
        });
    }
});
