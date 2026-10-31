/**
 * Day-1 money spike: proves every PayPal sandbox call Handshake depends on
 * before any product code is built on top of them (PLAN.md §4, Day 1).
 *
 *   pnpm spike:paypal            # all scenarios
 *   pnpm spike:paypal partial    # one of: partial | void | payout
 *
 * Partial and void scenarios need a sandbox *buyer* to approve the Hold in a
 * browser; the script prints the approval links and waits.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { z } from "zod";
import { createPayPalClient, PayPalApiError, type PayPalClient } from "../src/paypal/client";

const APPROVAL_POLL_MS = 3_000;
const APPROVAL_TIMEOUT_MS = 10 * 60_000;
const PAYOUT_POLL_MS = 5_000;
const PAYOUT_TIMEOUT_MS = 3 * 60_000;
const PAYOUT_TERMINAL = new Set(["SUCCESS", "DENIED", "CANCELED"]);

// Demo numbers mirror the video: $100 Deal, 70% of criteria pass, 5% Platform Fee.
const HOLD_CENTS = 10_000;
const PARTIAL_CAPTURE_CENTS = 7_000;
const PLATFORM_FEE_BP = 500;

const envSchema = z.object({
  PAYPAL_CLIENT_ID: z.string().min(1),
  PAYPAL_CLIENT_SECRET: z.string().min(1),
  PAYPAL_API_BASE: z.url().default("https://api-m.sandbox.paypal.com"),
  PAYPAL_PAYOUT_RECEIVER_EMAIL: z.email(),
});

type Scenario = "partial" | "void" | "payout";
type Finding = { step: string; ok: boolean; detail: unknown };

const findings: Finding[] = [];

function record(step: string, ok: boolean, detail: unknown): void {
  findings.push({ step, ok, detail });
  console.log(`${ok ? "✔" : "✘"} ${step}`, detail === undefined ? "" : JSON.stringify(detail));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForApproval(paypal: PayPalClient, orderId: string): Promise<void> {
  const deadline = Date.now() + APPROVAL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const order = await paypal.getOrder(orderId);
    if (order.status === "APPROVED") return;
    await sleep(APPROVAL_POLL_MS);
  }
  throw new Error(`Order ${orderId} was not approved within ${APPROVAL_TIMEOUT_MS / 60_000} minutes`);
}

/** Creates an AUTHORIZE order, waits for buyer approval, and authorizes it. */
async function createApprovedHold(paypal: PayPalClient, runId: string, label: string) {
  const order = await paypal.createAuthorizeOrder({
    amountCents: HOLD_CENTS,
    description: `Handshake spike — ${label}`,
    customId: `${runId}-${label}`,
    requestId: `${runId}:${label}:order`,
    returnUrl: "http://localhost:3000/spike/approved",
  });
  record(`${label}: AUTHORIZE order created`, true, { orderId: order.id, status: order.status });
  console.log(`\n  → Approve the "${label}" Hold as the sandbox buyer:\n    ${order.approveUrl}\n`);

  await waitForApproval(paypal, order.id);
  const auth = await paypal.authorizeOrder(order.id, `${runId}:${label}:authorize`);
  record(`${label}: order authorized (Hold placed)`, auth.status === "CREATED", auth);
  return auth;
}

async function runPartial(paypal: PayPalClient, runId: string): Promise<void> {
  const auth = await createApprovedHold(paypal, runId, "partial");

  const capture = await paypal.captureAuthorization(auth.authorizationId, {
    amountCents: PARTIAL_CAPTURE_CENTS,
    finalCapture: true,
    requestId: `${runId}:partial:capture`,
  });
  record("partial: captured 70% with final_capture=true", capture.amountCents === PARTIAL_CAPTURE_CENTS, capture);

  const after = await paypal.getAuthorization(auth.authorizationId);
  record("partial: authorization status after final partial capture", true, after);

  // The key unknown: is the remaining 30% released, or does it still need a void?
  try {
    await paypal.voidAuthorization(auth.authorizationId, `${runId}:partial:void-remainder`);
    record("partial: void of remainder SUCCEEDED → remainder was NOT auto-released; Settlement must void it", true, null);
  } catch (error) {
    const issues = error instanceof PayPalApiError ? error.issues : [String(error)];
    record("partial: void of remainder rejected → final_capture released it (expected)", true, { issues });
  }
}

async function runVoid(paypal: PayPalClient, runId: string): Promise<void> {
  const auth = await createApprovedHold(paypal, runId, "void");
  await paypal.voidAuthorization(auth.authorizationId, `${runId}:void:void`);
  const after = await paypal.getAuthorization(auth.authorizationId);
  record("void: authorization voided", after.status === "VOIDED", after);
}

async function runPayout(paypal: PayPalClient, runId: string, receiverEmail: string): Promise<void> {
  const fee = Math.round((PARTIAL_CAPTURE_CENTS * PLATFORM_FEE_BP) / 10_000);
  const amountCents = PARTIAL_CAPTURE_CENTS - fee;
  const created = await paypal.createPayout({
    senderBatchId: `${runId}-payout`,
    receiverEmail,
    amountCents,
    note: `Handshake spike ${runId}`,
  });
  record("payout: batch created", true, { ...created, amountCents, feeCents: fee });

  const deadline = Date.now() + PAYOUT_TIMEOUT_MS;
  let batch = await paypal.getPayoutBatch(created.batchId);
  while (!PAYOUT_TERMINAL.has(batch.status) && Date.now() < deadline) {
    await sleep(PAYOUT_POLL_MS);
    batch = await paypal.getPayoutBatch(created.batchId);
  }
  record("payout: batch reached SUCCESS", batch.status === "SUCCESS", batch);
}

function parseScenarios(arg: string | undefined): Scenario[] {
  const all: Scenario[] = ["partial", "void", "payout"];
  if (!arg || arg === "all") return all;
  if ((all as string[]).includes(arg)) return [arg as Scenario];
  throw new Error(`Unknown scenario "${arg}". Use one of: ${all.join(", ")}, all`);
}

async function main(): Promise<void> {
  const env = envSchema.parse(process.env);
  const scenarios = parseScenarios(process.argv[2]);
  const runId = `spike-${Date.now()}`;
  const paypal = createPayPalClient({
    clientId: env.PAYPAL_CLIENT_ID,
    clientSecret: env.PAYPAL_CLIENT_SECRET,
    baseUrl: env.PAYPAL_API_BASE,
  });

  console.log(`Run ${runId} against ${env.PAYPAL_API_BASE}: ${scenarios.join(", ")}\n`);

  // Holds need a human approval each, so start them together and approve both links in one sitting.
  const runs = scenarios.map(async (scenario) => {
    try {
      if (scenario === "partial") await runPartial(paypal, runId);
      if (scenario === "void") await runVoid(paypal, runId);
      if (scenario === "payout") await runPayout(paypal, runId, env.PAYPAL_PAYOUT_RECEIVER_EMAIL);
    } catch (error) {
      const detail =
        error instanceof PayPalApiError
          ? { status: error.status, name: error.name, debugId: error.debugId, issues: error.issues, message: error.message }
          : String(error);
      record(`${scenario}: FAILED`, false, detail);
    }
  });
  await Promise.all(runs);

  await mkdir("spikes/results", { recursive: true });
  const file = `spikes/results/${runId}.json`;
  await writeFile(file, JSON.stringify({ runId, scenarios, findings }, null, 2));
  const failed = findings.filter((f) => !f.ok).length;
  console.log(`\n${findings.length - failed}/${findings.length} checks passed. Results: ${file}`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
