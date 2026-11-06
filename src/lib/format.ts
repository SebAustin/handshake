/** Display helpers. Money is integer cents everywhere; these are the only place it becomes text. */

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatCents(cents: number): string {
  return usd.format(cents / 100);
}

export function formatPercent(bp: number): string {
  return `${Number.isInteger(bp / 100) ? bp / 100 : (bp / 100).toFixed(1)}%`;
}

/** A Deal's title: the Brief's first sentence, shortened to fit two lines of the title row. */
/** A Deal's name: the Brief's first clause, without "I need". A title, not a sentence. */
export function dealTitle(brief: string, maxLength = 48): string {
  // A leading tag such as "[Test, no money]" is kept whole and not mistaken for the first clause.
  const [, tag = "", rest = brief] = /^(\[[^\]]*\]\s*)?([\s\S]*)$/.exec(brief.trim()) ?? [];
  const sentence = rest.split(/(?<=[.!?])\s/)[0]?.trim() ?? rest;
  const clause = sentence.split(/[,;:—–]\s/)[0] ?? sentence;
  const cleaned = clause.replace(/^I need\s+/i, "").replace(/[.!?]$/, "");
  const titled = tag + cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return titled.length <= maxLength ? titled : `${titled.slice(0, maxLength - 1).trimEnd()}…`;
}

export function criterionLabel(id: string): string {
  const words = id.replace(/-\d+$/, "").split("-");
  const label = words.join(" ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}
