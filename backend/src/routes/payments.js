import { Router } from "express";
import { randomUUID } from "node:crypto";
import { checkoutApi } from "../services/adyenClient.js";
import { config } from "../config.js";
import { createOrder } from "../services/orderStore.js";
import { COUNTRY_PRESETS } from "./sessions.js";

export const paymentsRouter = Router();

// Step 1 — fetch available payment methods for the shopper's country and amount.
// Also mints the merchant reference that ties all three advanced-flow calls together.
paymentsRouter.post("/payment-methods", async (req, res) => {
    const { countryCode = "NL", amountValue, shopperEmail } = req.body ?? {};
    const preset = COUNTRY_PRESETS[countryCode];
    if (!preset) return res.status(400).json({ error: `Unsupported countryCode "${countryCode}"` });

    const rawValue = Math.round(Number(amountValue));
    const amount = {
        value: Number.isFinite(rawValue) && rawValue > 0 ? rawValue : 1999,
        currency: preset.currency
    };

    try {
        const paymentMethodsResponse = await checkoutApi.PaymentsApi.paymentMethods({
            merchantAccount: config.adyen.merchantAccount,
            countryCode,
            shopperLocale: preset.shopperLocale,
            amount,
            channel: "Web",
            shopperReference: shopperEmail || "demo-shopper-001",
            ...(shopperEmail && { shopperEmail })
        });

        const reference = `demo-${randomUUID()}`;
        createOrder(reference, { amount, countryCode, shopperLocale: preset.shopperLocale });

        res.json({
            paymentMethodsResponse,
            reference,
            amount,
            shopperLocale: preset.shopperLocale,
            clientKey: config.adyen.clientKey,
            environment: config.adyen.environment.toLowerCase()
        });
    } catch (error) {
        console.error("[payment-methods] failed", error?.message ?? error);
        res.status(error?.statusCode ?? 500).json({ error: "Failed to fetch payment methods" });
    }
});

// Step 2 — authorise the payment. The Drop-in calls onSubmit with encrypted card
// data; the frontend forwards it here along with the order context.
paymentsRouter.post("/payments", async (req, res) => {
    const {
        reference, countryCode = "NL", amountValue, shopperEmail,
        returnUrl, paymentMethod, browserInfo, billingAddress, storePaymentMethod
    } = req.body ?? {};

    const preset = COUNTRY_PRESETS[countryCode];
    if (!preset) return res.status(400).json({ error: `Unsupported countryCode "${countryCode}"` });

    const rawValue = Math.round(Number(amountValue));
    const amount = {
        value: Number.isFinite(rawValue) && rawValue > 0 ? rawValue : 1999,
        currency: preset.currency
    };

    try {
        const result = await checkoutApi.PaymentsApi.payments({
            merchantAccount: config.adyen.merchantAccount,
            amount,
            countryCode,
            shopperLocale: preset.shopperLocale,
            reference,
            returnUrl: returnUrl || `${config.frontendUrl}/result?reference=${reference}`,
            channel: "Web",
            paymentMethod,
            browserInfo,
            ...(billingAddress && { billingAddress }),
            ...(storePaymentMethod !== undefined && { storePaymentMethod }),
            shopperReference: shopperEmail || "demo-shopper-001",
            ...(shopperEmail && { shopperEmail }),
            storePaymentMethodMode: "askForConsent",
            recurringProcessingModel: "CardOnFile"
        });

        res.json({
            resultCode: result.resultCode,
            action: result.action,
            order: result.order,
            donationToken: result.donationToken
        });
    } catch (error) {
        console.error("[payments] failed", error?.message ?? error);
        res.status(error?.statusCode ?? 500).json({ error: "Failed to process payment" });
    }
});

// Step 3 — submit additional details after a 3DS challenge or redirect.
// The Drop-in calls onAdditionalDetails; the frontend forwards state.data here.
paymentsRouter.post("/payments/details", async (req, res) => {
    try {
        const result = await checkoutApi.PaymentsApi.paymentsDetails(req.body);
        res.json({
            resultCode: result.resultCode,
            action: result.action
        });
    } catch (error) {
        console.error("[payments/details] failed", error?.message ?? error);
        res.status(error?.statusCode ?? 500).json({ error: "Failed to process payment details" });
    }
});
