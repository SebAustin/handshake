import Link from "next/link";
import type { LedgerEntry, LedgerKind } from "@/ledger/entries";
import { formatCents } from "@/lib/format";

const KINDS: Record<LedgerKind, { label: string; flow: string; tone?: "negative" | "muted" }> = {
  hold: { label: "Hold placed", flow: "Authorized on Maya's PayPal" },
  capture: { label: "Captured", flow: "Maya → Handshake" },
  release: { label: "Released", flow: "Stays with Maya", tone: "muted" },
  fee: { label: "Platform fee", flow: "Kept by Handshake", tone: "muted" },
  payout: { label: "Payout sent", flow: "Handshake → Dev" },
  payout_confirmed: { label: "Payout confirmed", flow: "Dev's PayPal" },
  payout_failed: { label: "Payout failed", flow: "Needs attention", tone: "negative" },
  receipt: { label: "Receipt issued", flow: "Paid invoice to Maya" },
};

const time = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Ledger lines, newest first. Stacks on phones; reads as a statement on wide screens. */
export function LedgerList({ entries, showDeal }: { entries: readonly LedgerEntry[]; showDeal: boolean }) {
  if (entries.length === 0) {
    return (
      <p className="rounded-card bg-surface p-6 text-muted">
        No money has moved yet. A line appears here the moment a Hold is placed on PayPal.
      </p>
    );
  }

  return (
    <section aria-labelledby="entries-heading" className="rounded-card bg-surface">
      <h2 id="entries-heading" className="sr-only">
        Ledger entries
      </h2>
      <div
        aria-hidden="true"
        className="hidden grid-cols-[120px_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_110px] gap-4 border-b border-rule px-6 py-3 text-xs text-muted lg:grid"
      >
        <span>When</span>
        <span>Entry</span>
        <span>Flow</span>
        <span>PayPal reference</span>
        <span className="text-right">Amount</span>
      </div>
      <ol>
        {entries.map((entry) => {
          const kind = KINDS[entry.kind];
          return (
            <li
              key={entry.key}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-b border-rule px-5 py-4 last:border-b-0 lg:grid-cols-[120px_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_110px] lg:items-baseline lg:px-6"
            >
              <time dateTime={entry.at.toISOString()} className="figures col-span-2 text-xs text-muted lg:col-span-1 lg:text-sm">
                {time.format(entry.at)}
              </time>
              <div className="min-w-0">
                <p className={`font-medium ${kind.tone === "negative" ? "text-negative" : ""}`}>{kind.label}</p>
                {showDeal && (
                  <Link
                    href={`/ledger?deal=${entry.dealId}`}
                    className="line-clamp-1 text-sm text-muted underline decoration-rule underline-offset-4 hover:text-ink hover:decoration-control"
                  >
                    {entry.dealTitle}
                  </Link>
                )}
                {entry.note && <p className="text-sm text-negative">{entry.note}</p>}
              </div>
              <p
                className={`figures text-right font-bold lg:hidden ${kind.tone === "muted" ? "text-muted" : ""}`}
              >
                {entry.amountCents === undefined ? "" : formatCents(entry.amountCents)}
              </p>
              <p className="col-span-2 text-sm text-muted lg:col-span-1">{kind.flow}</p>
              <p className="figures col-span-2 min-w-0 truncate text-xs text-muted lg:col-span-1 lg:text-sm">{entry.paypalRef ?? "—"}</p>
              <p className={`figures hidden text-right font-bold lg:block ${kind.tone === "muted" ? "text-muted" : ""}`}>
                {entry.amountCents === undefined ? "" : formatCents(entry.amountCents)}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
