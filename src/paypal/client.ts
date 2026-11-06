import type { z } from "zod";
import { centsToValue, valueToCents } from "./money";
import {
  authorizationSchema,
  authorizedOrderSchema,
  captureSchema,
  errorBodySchema,
  orderSchema,
  payoutBatchSchema,
  payoutCreateSchema,
  tokenSchema,
} from "./schemas";

/**
 * Thin typed client for the PayPal REST endpoints Handshake's money flow needs
 * (ADR 0002). The Agent Toolkit has no authorize/capture/void/payout tools, so
 * these calls are made directly. Every mutating call carries an idempotency key.
 */

const CURRENCY = "USD";
const TOKEN_REFRESH_MARGIN_MS = 60_000;

export interface PayPalClientConfig {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  fetch?: typeof fetch;
  now?: () => number;
}

export class PayPalApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly name: string,
    readonly debugId: string | undefined,
    readonly issues: readonly string[],
  ) {
    super(message);
  }
}

export interface CreatedOrder {
  id: string;
  status: string;
  approveUrl: string | undefined;
}

export interface Authorization {
  authorizationId: string;
  status: string;
  amountCents: number;
}

export interface Capture {
  captureId: string;
  status: string;
  amountCents: number;
}

export interface PayoutBatch {
  batchId: string;
  status: string;
  items: readonly { itemId: string; status: string; error: string | undefined }[];
}

interface SendOptions {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  requestId?: string;
}

interface RequestOptions<T extends z.ZodType> extends SendOptions {
  schema: T;
}

export function createPayPalClient(config: PayPalClientConfig) {
  const fetchImpl = config.fetch ?? fetch;
  const now = config.now ?? Date.now;
  let cachedToken: { value: string; expiresAt: number } | undefined;

  async function getAccessToken(): Promise<string> {
    if (cachedToken && now() < cachedToken.expiresAt - TOKEN_REFRESH_MARGIN_MS) {
      return cachedToken.value;
    }
    const response = await fetchImpl(`${config.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        authorization: `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    const token = tokenSchema.parse(await readJson(response, "oauth2/token"));
    cachedToken = { value: token.access_token, expiresAt: now() + token.expires_in * 1000 };
    return cachedToken.value;
  }

  /** Sends a request and returns the raw JSON body (undefined for empty responses). */
  async function send(options: SendOptions): Promise<unknown> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${await getAccessToken()}`,
      "content-type": "application/json",
      prefer: "return=representation",
    };
    if (options.requestId) headers["paypal-request-id"] = options.requestId;

    const response = await fetchImpl(`${config.baseUrl}${options.path}`, {
      method: options.method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    return readJson(response, options.path);
  }

  async function request<T extends z.ZodType>(options: RequestOptions<T>): Promise<z.infer<T>> {
    const json = await send(options);
    const parsed = options.schema.safeParse(json);
    if (!parsed.success) {
      throw new Error(`Unexpected response from PayPal ${options.path}: ${parsed.error.message}`);
    }
    return parsed.data;
  }

  return {
    /** The cached OAuth token, for PayPal services that take the same credentials (the Agent Toolkit MCP server). */
    accessToken: getAccessToken,
    async getOrder(orderId: string): Promise<CreatedOrder> {
      const order = await request({
        method: "GET",
        path: `/v2/checkout/orders/${encodeURIComponent(orderId)}`,
        schema: orderSchema,
      });
      return toCreatedOrder(order);
    },

    async createAuthorizeOrder(input: {
      amountCents: number;
      description: string;
      customId: string;
      requestId: string;
      returnUrl?: string;
      cancelUrl?: string;
    }): Promise<CreatedOrder> {
      const order = await request({
        method: "POST",
        path: "/v2/checkout/orders",
        schema: orderSchema,
        requestId: input.requestId,
        body: {
          intent: "AUTHORIZE",
          purchase_units: [
            {
              amount: { currency_code: CURRENCY, value: centsToValue(input.amountCents) },
              description: input.description,
              custom_id: input.customId,
            },
          ],
          ...(input.returnUrl && {
            payment_source: {
              paypal: {
                experience_context: {
                  brand_name: "Handshake",
                  user_action: "CONTINUE",
                  return_url: input.returnUrl,
                  cancel_url: input.cancelUrl ?? input.returnUrl,
                },
              },
            },
          }),
        },
      });
      return toCreatedOrder(order);
    },

    async authorizeOrder(orderId: string, requestId: string): Promise<Authorization> {
      const order = await request({
        method: "POST",
        path: `/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`,
        schema: authorizedOrderSchema,
        requestId,
        body: {},
      });
      const auth = order.purchase_units[0].payments.authorizations[0];
      return { authorizationId: auth.id, status: auth.status, amountCents: valueToCents(auth.amount.value) };
    },

    async getAuthorization(authorizationId: string): Promise<Authorization> {
      const auth = await request({
        method: "GET",
        path: `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}`,
        schema: authorizationSchema,
      });
      return { authorizationId: auth.id, status: auth.status, amountCents: valueToCents(auth.amount.value) };
    },

    /** Omit `amountCents` to capture the full authorized amount. */
    async captureAuthorization(
      authorizationId: string,
      input: { amountCents?: number; finalCapture: boolean; requestId: string },
    ): Promise<Capture> {
      const capture = await request({
        method: "POST",
        path: `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/capture`,
        schema: captureSchema,
        requestId: input.requestId,
        body: {
          ...(input.amountCents !== undefined && {
            amount: { currency_code: CURRENCY, value: centsToValue(input.amountCents) },
          }),
          final_capture: input.finalCapture,
        },
      });
      return { captureId: capture.id, status: capture.status, amountCents: valueToCents(capture.amount.value) };
    },

    async voidAuthorization(authorizationId: string, requestId: string): Promise<void> {
      await send({
        method: "POST",
        path: `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/void`,
        requestId,
      });
    },

    async createPayout(input: {
      senderBatchId: string;
      receiverEmail: string;
      amountCents: number;
      note: string;
    }): Promise<{ batchId: string; status: string }> {
      const result = await request({
        method: "POST",
        path: "/v1/payments/payouts",
        schema: payoutCreateSchema,
        body: {
          sender_batch_header: {
            sender_batch_id: input.senderBatchId,
            email_subject: "You have a payout from Handshake",
          },
          items: [
            {
              recipient_type: "EMAIL",
              receiver: input.receiverEmail,
              amount: { currency: CURRENCY, value: centsToValue(input.amountCents) },
              note: input.note,
              sender_item_id: input.senderBatchId,
            },
          ],
        },
      });
      return { batchId: result.batch_header.payout_batch_id, status: result.batch_header.batch_status };
    },

    async getPayoutBatch(batchId: string): Promise<PayoutBatch> {
      const batch = await request({
        method: "GET",
        path: `/v1/payments/payouts/${encodeURIComponent(batchId)}`,
        schema: payoutBatchSchema,
      });
      return {
        batchId: batch.batch_header.payout_batch_id,
        status: batch.batch_header.batch_status,
        items: batch.items.map((item) => ({
          itemId: item.payout_item_id,
          status: item.transaction_status,
          error: item.errors?.message,
        })),
      };
    },
  };
}

export type PayPalClient = ReturnType<typeof createPayPalClient>;

function toCreatedOrder(order: z.infer<typeof orderSchema>): CreatedOrder {
  const approve = order.links.find((link) => link.rel === "payer-action" || link.rel === "approve");
  return { id: order.id, status: order.status, approveUrl: approve?.href };
}

async function readJson(response: Response, path: string): Promise<unknown> {
  const text = await response.text();
  const json: unknown = text ? safeJsonParse(text) : undefined;
  if (response.ok) return json;

  const body = errorBodySchema.safeParse(json ?? {});
  const error = body.success ? body.data : {};
  throw new PayPalApiError(
    `PayPal ${path} failed (${response.status}): ${error.message ?? error.error_description ?? text}`,
    response.status,
    error.name ?? error.error ?? "PAYPAL_ERROR",
    error.debug_id,
    error.details?.map((detail) => detail.issue) ?? [],
  );
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}
