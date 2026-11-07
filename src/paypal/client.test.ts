import { describe, expect, test, vi } from "vitest";
import { createPayPalClient, PayPalApiError } from "./client";

const BASE_URL = "https://api-m.sandbox.paypal.com";

interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const TOKEN_RESPONSE = { access_token: "token-1", expires_in: 3600 };

/** A fake fetch that answers the OAuth call itself and delegates API calls to `handler`. */
function fakeFetch(handler: (call: RecordedCall) => Response) {
  const calls: RecordedCall[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const call: RecordedCall = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: typeof init?.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : init?.body,
    };
    calls.push(call);
    if (call.url.endsWith("/v1/oauth2/token")) return jsonResponse(200, TOKEN_RESPONSE);
    return handler(call);
  });
  return { fetchImpl, calls, apiCalls: () => calls.filter((c) => !c.url.endsWith("/v1/oauth2/token")) };
}

function makeClient(handler: (call: RecordedCall) => Response, now: () => number = () => 0) {
  const fake = fakeFetch(handler);
  const client = createPayPalClient({
    clientId: "id",
    clientSecret: "secret",
    baseUrl: BASE_URL,
    fetch: fake.fetchImpl,
    now,
  });
  return { client, ...fake };
}

describe("access token", () => {
  test("uses basic auth and caches the token across calls", async () => {
    const { client, calls } = makeClient(() => jsonResponse(200, { id: "O1", status: "APPROVED", links: [] }));

    await client.getOrder("O1");
    await client.getOrder("O1");

    const tokenCalls = calls.filter((c) => c.url.endsWith("/v1/oauth2/token"));
    expect(tokenCalls).toHaveLength(1);
    expect(tokenCalls[0].headers.authorization).toBe(`Basic ${btoa("id:secret")}`);
    expect(calls[1].headers.authorization).toBe("Bearer token-1");
  });

  test("refreshes the token shortly before it expires", async () => {
    let clock = 0;
    const { client, calls } = makeClient(
      () => jsonResponse(200, { id: "O1", status: "APPROVED", links: [] }),
      () => clock,
    );

    await client.getOrder("O1");
    clock = 3_600_000 - 30_000; // inside the 60s safety margin
    await client.getOrder("O1");

    expect(calls.filter((c) => c.url.endsWith("/v1/oauth2/token"))).toHaveLength(2);
  });
});

describe("getOrder", () => {
  test("reports who approved the order, when PayPal says", async () => {
    const { client } = makeClient(() =>
      jsonResponse(200, { id: "O1", status: "COMPLETED", links: [], payer: { email_address: "maya@personal.example.com" } }),
    );
    expect(await client.getOrder("O1")).toMatchObject({ id: "O1", payerEmail: "maya@personal.example.com" });
  });

  test("leaves the payer out before approval", async () => {
    const { client } = makeClient(() => jsonResponse(200, { id: "O1", status: "CREATED", links: [] }));
    expect((await client.getOrder("O1")).payerEmail).toBeUndefined();
  });
});

describe("createAuthorizeOrder", () => {
  test("creates an AUTHORIZE order with an idempotency key and returns the approval link", async () => {
    const { client, apiCalls } = makeClient(() =>
      jsonResponse(201, {
        id: "ORDER-1",
        status: "PAYER_ACTION_REQUIRED",
        links: [{ rel: "payer-action", href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER-1" }],
      }),
    );

    const order = await client.createAuthorizeOrder({
      amountCents: 10000,
      description: "Landing page copy",
      customId: "deal-1",
      requestId: "deal-1:hold",
    });

    const [call] = apiCalls();
    expect(call.method).toBe("POST");
    expect(call.url).toBe(`${BASE_URL}/v2/checkout/orders`);
    expect(call.headers["paypal-request-id"]).toBe("deal-1:hold");
    expect(call.body).toMatchObject({
      intent: "AUTHORIZE",
      purchase_units: [
        { amount: { currency_code: "USD", value: "100.00" }, description: "Landing page copy", custom_id: "deal-1" },
      ],
    });
    expect(order).toEqual({
      id: "ORDER-1",
      status: "PAYER_ACTION_REQUIRED",
      approveUrl: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER-1",
    });
  });
});

describe("authorizeOrder", () => {
  test("returns the authorization id and amount from the order", async () => {
    const { client, apiCalls } = makeClient(() =>
      jsonResponse(201, {
        id: "ORDER-1",
        status: "COMPLETED",
        purchase_units: [
          {
            payments: {
              authorizations: [
                { id: "AUTH-1", status: "CREATED", amount: { currency_code: "USD", value: "100.00" } },
              ],
            },
          },
        ],
      }),
    );

    const auth = await client.authorizeOrder("ORDER-1", "deal-1:authorize");

    expect(apiCalls()[0].url).toBe(`${BASE_URL}/v2/checkout/orders/ORDER-1/authorize`);
    expect(auth).toEqual({ authorizationId: "AUTH-1", status: "CREATED", amountCents: 10000 });
  });
});

describe("captureAuthorization", () => {
  const CAPTURE = { id: "CAP-1", status: "COMPLETED", amount: { currency_code: "USD", value: "70.00" } };

  test("partial capture sends the amount and final_capture", async () => {
    const { client, apiCalls } = makeClient(() => jsonResponse(201, CAPTURE));

    const capture = await client.captureAuthorization("AUTH-1", {
      amountCents: 7000,
      finalCapture: true,
      requestId: "deal-1:capture",
    });

    const [call] = apiCalls();
    expect(call.url).toBe(`${BASE_URL}/v2/payments/authorizations/AUTH-1/capture`);
    expect(call.body).toEqual({ amount: { currency_code: "USD", value: "70.00" }, final_capture: true });
    expect(capture).toEqual({ captureId: "CAP-1", status: "COMPLETED", amountCents: 7000 });
  });

  test("full capture omits the amount", async () => {
    const { client, apiCalls } = makeClient(() => jsonResponse(201, CAPTURE));

    await client.captureAuthorization("AUTH-1", { finalCapture: true, requestId: "deal-1:capture" });

    expect(apiCalls()[0].body).toEqual({ final_capture: true });
  });
});

describe("voidAuthorization", () => {
  test("accepts an empty 204 response", async () => {
    const { client, apiCalls } = makeClient(() => new Response(null, { status: 204 }));

    await expect(client.voidAuthorization("AUTH-1", "deal-1:void")).resolves.toBeUndefined();
    expect(apiCalls()[0].url).toBe(`${BASE_URL}/v2/payments/authorizations/AUTH-1/void`);
  });
});

describe("createPayout", () => {
  test("sends one email payout item and returns the batch id", async () => {
    const { client, apiCalls } = makeClient(() =>
      jsonResponse(201, { batch_header: { payout_batch_id: "BATCH-1", batch_status: "PENDING" } }),
    );

    const payout = await client.createPayout({
      senderBatchId: "deal-1:payout",
      receiverEmail: "dev@example.com",
      amountCents: 6650,
      note: "Handshake deal-1",
    });

    expect(apiCalls()[0].body).toEqual({
      sender_batch_header: {
        sender_batch_id: "deal-1:payout",
        email_subject: "You have a payout from Handshake",
      },
      items: [
        {
          recipient_type: "EMAIL",
          receiver: "dev@example.com",
          amount: { currency: "USD", value: "66.50" },
          note: "Handshake deal-1",
          sender_item_id: "deal-1:payout",
        },
      ],
    });
    expect(payout).toEqual({ batchId: "BATCH-1", status: "PENDING" });
  });
});

describe("errors", () => {
  test("maps PayPal error bodies to PayPalApiError with debug id", async () => {
    const { client } = makeClient(() =>
      jsonResponse(422, {
        name: "UNPROCESSABLE_ENTITY",
        message: "The requested action could not be performed.",
        debug_id: "dbg-1",
        details: [{ issue: "AUTHORIZATION_ALREADY_CAPTURED" }],
      }),
    );

    const error = await client.voidAuthorization("AUTH-1", "x").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PayPalApiError);
    expect(error).toMatchObject({
      status: 422,
      name: "UNPROCESSABLE_ENTITY",
      debugId: "dbg-1",
      issues: ["AUTHORIZATION_ALREADY_CAPTURED"],
    });
  });

  test("rejects responses that do not match the expected shape", async () => {
    const { client } = makeClient(() => jsonResponse(201, { unexpected: true }));

    await expect(client.authorizeOrder("ORDER-1", "x")).rejects.toThrow(/unexpected response/i);
  });
});
