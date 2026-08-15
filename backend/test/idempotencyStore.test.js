import { test } from "node:test";
import assert from "node:assert/strict";
import { isDuplicate, markProcessed } from "../src/services/idempotencyStore.js";

test("a notification is not a duplicate the first time it's seen", () => {
    const item = { eventCode: "AUTHORISATION", pspReference: "psp-idem-1", success: "true" };
    assert.equal(isDuplicate(item), false);
});

test("the same webhook arriving twice is detected as a duplicate and not processed again", () => {
    const item = { eventCode: "AUTHORISATION", pspReference: "psp-idem-2", success: "true" };
    markProcessed(item);
    assert.equal(isDuplicate(item), true);
});

test("a retry with a different outcome for the same payment is treated as a new event", () => {
    const authorised = { eventCode: "AUTHORISATION", pspReference: "psp-idem-3", success: "true" };
    const refused = { eventCode: "AUTHORISATION", pspReference: "psp-idem-3", success: "false" };
    markProcessed(authorised);
    assert.equal(isDuplicate(refused), false);
});
