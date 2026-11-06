import type { Deal } from "@/deals/state-machine";
import { criterionLabel, formatCents, formatPercent } from "@/lib/format";

/** The Deal as it stands: the Terms once agreed, the Brief and criteria before. */
export function DealSummary({ deal }: { deal: Deal }) {
  const weights = deal.terms?.weights ?? deal.suggestedWeights ?? deal.draft?.suggestedWeights;
  const criteria = deal.criteria.length ? deal.criteria : (deal.draft?.criteria ?? []);

  return (
    <aside aria-label="The Deal" className="flex flex-col gap-3">
      <section className="rounded-card bg-surface p-5">
        <h2 className="text-sm text-muted">Price</h2>
        {deal.terms ? (
          <p className="figures mt-1 text-3xl font-bold">{formatCents(deal.terms.priceCents)}</p>
        ) : (
          <p className="mt-1 text-3xl text-muted">—</p>
        )}
        <p className="mt-1 text-sm text-muted">
          {deal.terms ? `Delivered within ${deal.terms.deadlineHours} hours` : "Set by the Agents' negotiation"}
        </p>
      </section>

      {criteria.length > 0 && (
        <section className="rounded-card bg-surface p-5">
          <h2 className="text-sm text-muted">{deal.terms ? "What each criterion is worth" : "Criteria"}</h2>
          <ul className="mt-3 flex flex-col gap-2.5">
            {criteria.map((c) => {
              const bp = weights?.[c.id];
              return (
                <li key={c.id} className="flex items-baseline justify-between gap-3">
                  <span>{criterionLabel(c.id)}</span>
                  <span className="figures text-sm text-muted">
                    {bp === undefined ? "—" : deal.terms ? formatCents(Math.floor((deal.terms.priceCents * bp) / 10_000)) : formatPercent(bp)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="rounded-card bg-surface p-5">
        <h2 className="text-sm text-muted">Brief</h2>
        <p className="mt-2 leading-relaxed">{deal.brief}</p>
      </section>
    </aside>
  );
}
