import { z } from "zod";

/** Response shapes we rely on. Only the fields Handshake reads are declared. */

export const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
});

const linkSchema = z.object({ rel: z.string(), href: z.string() });

const moneySchema = z.object({ currency_code: z.string(), value: z.string() });

export const orderSchema = z.object({
  id: z.string(),
  status: z.string(),
  links: z.array(linkSchema).default([]),
});

export const authorizedOrderSchema = z.object({
  id: z.string(),
  status: z.string(),
  purchase_units: z
    .array(
      z.object({
        payments: z.object({
          authorizations: z
            .array(z.object({ id: z.string(), status: z.string(), amount: moneySchema }))
            .min(1),
        }),
      }),
    )
    .min(1),
});

export const authorizationSchema = z.object({
  id: z.string(),
  status: z.string(),
  amount: moneySchema,
});

export const captureSchema = z.object({
  id: z.string(),
  status: z.string(),
  amount: moneySchema,
});

export const payoutCreateSchema = z.object({
  batch_header: z.object({ payout_batch_id: z.string(), batch_status: z.string() }),
});

export const payoutBatchSchema = z.object({
  batch_header: z.object({ payout_batch_id: z.string(), batch_status: z.string() }),
  items: z
    .array(
      z.object({
        payout_item_id: z.string(),
        transaction_status: z.string(),
        errors: z.object({ name: z.string(), message: z.string() }).optional(),
      }),
    )
    .default([]),
});

export const errorBodySchema = z.object({
  name: z.string().optional(),
  message: z.string().optional(),
  debug_id: z.string().optional(),
  details: z.array(z.object({ issue: z.string() })).optional(),
  // OAuth endpoint uses a different error shape
  error: z.string().optional(),
  error_description: z.string().optional(),
});
