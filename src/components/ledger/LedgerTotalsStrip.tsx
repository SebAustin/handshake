import { reconcile, type LedgerTotals } from "@/ledger/entries";
import { formatCents } from "@/lib/format";

const FIGURES: { key: keyof LedgerTotals; label: string; hint: string }[] = [
  { key: "heldCents", label: "Held", hint: "Authorized on Maya's PayPal" },
  { key: "capturedCents", label: "Captured", hint: "Earned by a Verdict" },
  { key: "releasedCents", label: "Released", hint: "Never charged" },
  { key: "paidOutCents", label: "Paid to Dev", hint: "Confirmed by PayPal" },
  { key: "feeCents", label: "Platform fee", hint: "5% of each capture" },
];

/** The ledger's running totals, one large figure each, closed by a check that they add up. */
export function LedgerTotalsStrip({ totals }: { totals: LedgerTotals }) {
  const check = reconcile(totals);
  const pending = [
    check.stillHeldCents > 0 && `${formatCents(check.stillHeldCents)} still on hold`,
    check.payoutInFlightCents > 0 && `${formatCents(check.payoutInFlightCents)} payout in flight`,
  ].filter(Boolean);

  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card bg-border sm:grid-cols-3 xl:grid-cols-6">
      {FIGURES.map(({ key, label, hint }) => (
        <div key={key} className="flex flex-col gap-1 bg-surface p-5">
          <dt className="text-sm text-muted">{label}</dt>
          <dd className="figures text-2xl font-bold tracking-tight lg:text-3xl">{formatCents(totals[key])}</dd>
          <dd className="text-xs text-muted">{hint}</dd>
        </div>
      ))}
      <div className={`flex flex-col gap-1 p-5 ${check.balances ? "bg-ground" : "bg-[var(--pill-negative-bg)]"}`}>
        <dt className="text-sm text-muted">Check</dt>
        <dd className={`font-serif text-2xl lg:text-3xl ${check.balances ? "text-ink" : "text-negative"}`}>
          {check.balances ? "Balances" : "Doesn't add up"}
        </dd>
        <dd className="text-xs text-muted">
          {check.balances
            ? `Held = captured + released${pending.length ? `; ${pending.join(", ")}` : ""}.`
            : "More money left a Hold than entered it. Investigate before settling more."}
        </dd>
      </div>
    </dl>
  );
}
