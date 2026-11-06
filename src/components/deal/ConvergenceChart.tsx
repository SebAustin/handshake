import type { Role } from "@/deals/model";
import type { NegotiationMessage } from "@/negotiation/protocol";
import { formatCents } from "@/lib/format";

interface ConvergenceChartProps {
  messages: readonly NegotiationMessage[];
  maxRounds: number;
  agreedCents?: number;
  /** The viewer's own limit — the only Mandate value this viewer may see. */
  ownLimit?: { role: Role; cents: number };
}

const W = 640;
const H = 220;
const PAD = { top: 16, right: 16, bottom: 28, left: 52 };

/** The signature of a Deal: both sides' valid Offers per Round, closing in on one price. */
export function ConvergenceChart({ messages, maxRounds, agreedCents, ownLimit }: ConvergenceChartProps) {
  const offers = messages.filter((m) => m.accepted && m.kind === "offer" && m.terms);
  const series = (role: Role) =>
    offers.filter((m) => m.from === role).map((m) => ({ round: m.round, cents: m.terms?.priceCents ?? 0 }));
  const client = series("client");
  const freelancer = series("freelancer");

  const values = [...client, ...freelancer].map((p) => p.cents);
  if (ownLimit) values.push(ownLimit.cents);
  if (values.length === 0) return null;

  const { lo, hi, step } = niceRange(Math.min(...values), Math.max(...values));
  const x = (round: number) => PAD.left + ((round - 1) / Math.max(maxRounds - 1, 1)) * (W - PAD.left - PAD.right);
  const y = (cents: number) => PAD.top + (1 - (cents - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
  const ticks = Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => lo + step * i);
  const path = (points: { round: number; cents: number }[]) =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.round).toFixed(1)},${y(p.cents).toFixed(1)}`).join(" ");
  const agreedRound = Math.max(...offers.map((o) => o.round), 1);

  return (
    <figure className="m-0 flex flex-col gap-2">
      <figcaption className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <LegendItem colour="var(--accent)" label="Maya's Agent" />
        <LegendItem colour="var(--data)" label="Dev's Agent" />
        {ownLimit && <LegendItem colour="var(--muted)" label={`Your ${ownLimit.role === "client" ? "ceiling" : "minimum"}`} isDashed />}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Offers by Round">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--rule)" />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="figures">
              {formatCents(t).replace(".00", "")}
            </text>
          </g>
        ))}
        {Array.from({ length: maxRounds }, (_, i) => i + 1).map((round) => (
          <text key={round} x={x(round)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">
            R{round}
          </text>
        ))}

        {ownLimit && (
          <g>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(ownLimit.cents)} y2={y(ownLimit.cents)} stroke="var(--muted)" strokeDasharray="4 4" />
          </g>
        )}

        <Series d={path(client)} points={client} colour="var(--accent)" x={x} y={y} />
        <Series d={path(freelancer)} points={freelancer} colour="var(--data)" x={x} y={y} />

        {agreedCents !== undefined && (
          <g>
            <circle cx={x(agreedRound)} cy={y(agreedCents)} r="8" fill="none" stroke="var(--positive)" strokeWidth="2" />
            <text x={x(agreedRound) + 12} y={y(agreedCents) - 10} fontSize="12" fontWeight="600" fill="var(--positive)">
              Agreed {formatCents(agreedCents)}
            </text>
          </g>
        )}
      </svg>
    </figure>
  );
}

type Scale = (value: number) => number;

function Series({ d, points, colour, x, y }: { d: string; points: { round: number; cents: number }[]; colour: string; x: Scale; y: Scale }) {
  return (
    <g>
      <path d={d} fill="none" stroke={colour} strokeWidth="2" strokeLinejoin="round" />
      {points.map((p) => (
        <circle key={p.round} cx={x(p.round)} cy={y(p.cents)} r="3.5" fill={colour} />
      ))}
    </g>
  );
}

function LegendItem({ colour, label, isDashed = false }: { colour: string; label: string; isDashed?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <svg width="18" height="8" aria-hidden="true">
        <line x1="0" x2="18" y1="4" y2="4" stroke={colour} strokeWidth="2" strokeDasharray={isDashed ? "4 3" : undefined} />
      </svg>
      {label}
    </span>
  );
}

/** An axis in round dollar steps ($5, $10, $20, $25, $50…) with three to five ticks. */
export function niceRange(min: number, max: number): { lo: number; hi: number; step: number } {
  const span = Math.max(max - min, 500);
  const step = [500, 1000, 2000, 2500, 5000, 10_000, 20_000, 50_000].find((s) => span / s <= 4) ?? 100_000;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  return { lo, hi: hi > lo ? hi : lo + step, step };
}
