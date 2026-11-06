import { describe, expect, test } from "vitest";
import { isFailure } from "./mcp";

describe("isFailure", () => {
  test("spots the Toolkit's in-band PayPal error shape", () => {
    expect(isFailure({ ok: false, status: 400, code: "PAYPAL_API_HTTP_ERROR" })).toBe(true);
  });

  test("passes real results through", () => {
    expect(isFailure({ rel: "self", href: "https://api.sandbox.paypal.com/v2/invoicing/invoices/INV2-X" })).toBe(false);
    expect(isFailure({ text: "plain" })).toBe(false);
  });
});
