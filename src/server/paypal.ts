import "server-only";
import { z } from "zod";
import { createPayPalClient, type PayPalClient } from "@/paypal/client";

/** PayPal sandbox wiring for the server. Credentials are validated once, at first use. */

const envSchema = z.object({
  PAYPAL_CLIENT_ID: z.string().min(1),
  PAYPAL_CLIENT_SECRET: z.string().min(1),
  PAYPAL_API_BASE: z.url().default("https://api-m.sandbox.paypal.com"),
  PAYPAL_PAYOUT_RECEIVER_EMAIL: z.email(),
});

let config: z.infer<typeof envSchema> | undefined;
let client: PayPalClient | undefined;

function getConfig() {
  config ??= envSchema.parse(process.env);
  return config;
}

export function getPayPal(): PayPalClient {
  const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_API_BASE } = getConfig();
  client ??= createPayPalClient({ clientId: PAYPAL_CLIENT_ID, clientSecret: PAYPAL_CLIENT_SECRET, baseUrl: PAYPAL_API_BASE });
  return client;
}

/** The public client id the browser SDK needs. Safe to send to the browser. */
export function getPayPalClientId(): string {
  return getConfig().PAYPAL_CLIENT_ID;
}

/** The demo Freelancer's sandbox account (Dev). */
export function getPayoutReceiverEmail(): string {
  return getConfig().PAYPAL_PAYOUT_RECEIVER_EMAIL;
}
