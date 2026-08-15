import { test } from "node:test";
import assert from "node:assert/strict";
import { createOrder, applyWebhookEvent, getOrder } from "../src/services/orderStore.js";

test("session creation starts an order as pending", () => {
    createOrder("ref-pending", { amount: { value: 1000, currency: "EUR" } });
    assert.equal(getOrder("ref-pending").status, "pending");
});

test("a successful payment moves the order from pending to authorised", () => {
    createOrder("ref-auth", { amount: { value: 1000, currency: "EUR" } });
    const order = applyWebhookEvent({
        merchantReference: "ref-auth",
        eventCode: "AUTHORISATION",
        success: "true",
        pspReference: "psp-1",
        amount: { value: 1000, currency: "EUR" }
    });
    assert.equal(order.status, "authorised");
});

test("a declined payment moves the order from pending to failed", () => {
    createOrder("ref-fail", { amount: { value: 1000, currency: "EUR" } });
    const order = applyWebhookEvent({
        merchantReference: "ref-fail",
        eventCode: "AUTHORISATION",
        success: "false",
        pspReference: "psp-2",
        amount: { value: 1000, currency: "EUR" }
    });
    assert.equal(order.status, "failed");
});

test("a cancellation moves the order from pending to cancelled", () => {
    createOrder("ref-cancel", { amount: { value: 1000, currency: "EUR" } });
    const order = applyWebhookEvent({
        merchantReference: "ref-cancel",
        eventCode: "CANCELLATION",
        success: "true",
        pspReference: "psp-3",
        amount: { value: 1000, currency: "EUR" }
    });
    assert.equal(order.status, "cancelled");
});

test("a webhook for an unseen reference is ignored and returns null", () => {
    const result = applyWebhookEvent({
        merchantReference: "ref-never-seen",
        eventCode: "AUTHORISATION",
        success: "true",
        pspReference: "psp-4",
        amount: { value: 500, currency: "EUR" }
    });
    assert.equal(result, null);
});

test("history accumulates one entry per transition", () => {
    createOrder("ref-history", { amount: { value: 1000, currency: "EUR" } });
    applyWebhookEvent({
        merchantReference: "ref-history",
        eventCode: "AUTHORISATION",
        success: "true",
        pspReference: "psp-5",
        amount: { value: 1000, currency: "EUR" }
    });
    applyWebhookEvent({
        merchantReference: "ref-history",
        eventCode: "CAPTURE",
        success: "true",
        pspReference: "psp-5",
        amount: { value: 1000, currency: "EUR" }
    });
    const order = getOrder("ref-history");
    assert.equal(order.status, "captured");
    assert.equal(order.history.length, 3); // pending -> authorised -> captured
});
