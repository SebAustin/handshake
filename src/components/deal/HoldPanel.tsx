"use client";

import { loadCoreSdkScript, type OneTimePaymentSession } from "@paypal/paypal-js/sdk-v6";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { authorizeHoldAction, createHoldOrderAction, syncHoldAction } from "@/app/deals/hold-actions";
import type { DealState } from "@/deals/state-machine";
import { formatCents } from "@/lib/format";

interface HoldPanelProps {
  dealId: string;
  state: DealState;
  priceCents: number;
  clientId: string;
  canPay: boolean;
  authorizationId?: string;
}

type Status = "loading" | "ready" | "working" | "unavailable";

/**
 * Maya approves a PayPal authorization for the agreed price (JS SDK v6). The
 * money is held, not taken: Settlement later captures only what the Verdict earns.
 */
export function HoldPanel({ dealId, state, priceCents, clientId, canPay, authorizationId }: HoldPanelProps) {
  const router = useRouter();
  const session = useRef<OneTimePaymentSession | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState<string>();
  const [approveUrl, setApproveUrl] = useState<string>();
  const isHeld = authorizationId !== undefined;

  useEffect(() => {
    if (!canPay || isHeld) return;
    let cancelled = false;

    async function setUp() {
      const paypal = await loadCoreSdkScript({ environment: "sandbox" });
      if (!paypal) throw new Error("PayPal SDK did not load");
      const sdk = await paypal.createInstance({ clientId, components: ["paypal-payments"], pageType: "checkout" });
      const created = sdk.createPayPalOneTimePaymentSession({
        onApprove: async ({ orderId }) => {
          setStatus("working");
          const result = await authorizeHoldAction(dealId, orderId);
          if (!result.ok) {
            setMessage(result.error);
            setStatus("ready");
            return;
          }
          router.refresh();
        },
        onCancel: () => {
          setMessage("You closed PayPal before approving. Nothing was held.");
          setStatus("ready");
        },
        onError: () => {
          setMessage("PayPal reported a problem. Try again.");
          setStatus("ready");
        },
      });
      if (cancelled) return;
      session.current = created;
      // Returning from PayPal's redirect flow (small screens) finishes the approval here.
      if (created.hasReturned?.()) await created.resume?.();
      setStatus("ready");
    }

    setUp().catch(() => !cancelled && setStatus("unavailable"));
    return () => {
      cancelled = true;
    };
  }, [canPay, isHeld, clientId, dealId, router]);

  async function startPayPal() {
    if (!session.current) return;
    setMessage(undefined);
    const orderPromise = createHoldOrderAction(dealId).then((result) => {
      if (!result.ok) throw new Error(result.error);
      return { orderId: result.orderId };
    });
    try {
      await session.current.start({ presentationMode: "auto" }, orderPromise);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Couldn't open PayPal.");
    }
  }

  async function checkApproval() {
    setStatus("working");
    setMessage(undefined);
    const result = await syncHoldAction(dealId);
    if (result.ok) {
      router.refresh();
      return;
    }
    setMessage(result.error);
    setApproveUrl(result.approveUrl);
    setStatus("ready");
  }

  return (
    <section aria-labelledby="hold-heading" className="rounded-card bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="hold-heading" className="text-base font-medium">
          Hold
        </h2>
        <p className="text-sm text-muted">PayPal sandbox · test money</p>
      </div>

      {isHeld ? (
        <div className="mt-4 flex flex-col gap-2">
          <p className="figures text-3xl font-bold">{formatCents(priceCents)} held</p>
          <p className="max-w-prose">
            PayPal has authorized the full price. Nothing is captured yet: after the Verdict, code captures only the
            share the Delivery earns and the rest goes back to Maya.
          </p>
          <p className="figures text-sm text-muted">Authorization {authorizationId}</p>
        </div>
      ) : canPay ? (
        <div className="mt-4 flex flex-col gap-4">
          <p className="max-w-prose">
            Approve a PayPal authorization for <strong className="figures">{formatCents(priceCents)}</strong>. Your
            money is held, not paid. Dev starts work once it&apos;s held, and you only pay for the criteria his
            Delivery passes.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={startPayPal}
              disabled={status !== "ready"}
              className="press flex h-11 min-w-56 items-center justify-center rounded-control bg-accent px-5 text-sm font-medium text-white disabled:opacity-60"
            >
              {status === "loading" && "Loading PayPal…"}
              {status === "working" && "Placing the Hold…"}
              {status === "unavailable" && "PayPal unavailable"}
              {status === "ready" && `Hold ${formatCents(priceCents)} with PayPal`}
            </button>
            {state === "hold_pending" && (
              <button
                type="button"
                onClick={checkApproval}
                disabled={status === "working"}
                className="press h-11 rounded-control bg-raised px-4 text-sm disabled:opacity-60"
              >
                Check PayPal approval
              </button>
            )}
          </div>
          {message && (
            <p role="alert" className="text-sm text-negative">
              {message}
              {approveUrl && (
                <>
                  {" "}
                  <a href={approveUrl} target="_blank" rel="noopener noreferrer" className="underline">
                    Open the approval page
                  </a>
                </>
              )}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-4 text-muted">Waiting for Maya to approve the Hold in PayPal.</p>
      )}
    </section>
  );
}
