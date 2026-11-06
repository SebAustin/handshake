/** Display helpers. Money is integer cents everywhere; these are the only place it becomes text. */

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatCents(cents: number): string {
  return usd.format(cents / 100);
}

export function formatPercent(bp: number): string {
  return `${Number.isInteger(bp / 100) ? bp / 100 : (bp / 100).toFixed(1)}%`;
}

/** A Deal's title: the Brief's first sentence, shortened to fit two lines of the title row. */
export function dealTitle(brief: string, maxLength = 64): string {
  const first = brief.split(/(?<=[.!?])\s/)[0]?.trim() ?? brief;
  const cleaned = first.replace(/^I need\s+/i, "").replace(/[.!?]$/, "");
  const titled = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return titled.length <= maxLength ? titled : `${titled.slice(0, maxLength - 1).trimEnd()}…`;
}

export function criterionLabel(id: string): string {
  const words = id.replace(/-\d+$/, "").split("-");
  const label = words.join(" ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}
