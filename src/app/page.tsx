import { NewDealForm } from "@/components/deal/NewDealForm";
import { Mark } from "@/components/shell/Mark";
import { DEMO_BRIEF } from "@/samples/demo";

const STEPS = [
  ["Brief to criteria", "Maya's Agent turns a plain-English Brief into weighted, checkable criteria."],
  ["Negotiation", "Maya's and Dev's Agents trade Offers. Code blocks any Offer outside its side's limits."],
  ["Hold", "Maya approves a PayPal authorization. The money is held, not yet paid."],
  ["Verdict", "A neutral Arbiter, a different model, judges each criterion pass or fail."],
  ["Settlement", "Code captures the passed share and pays Dev through PayPal Payouts."],
] as const;

export default function Home() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-6xl gap-12 px-4 py-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:px-8 lg:py-12">
      <section aria-labelledby="hero-heading" className="flex flex-col gap-10">
        <div className="flex items-center gap-2.5">
          <Mark />
          <span className="font-serif text-xl">Handshake</span>
        </div>
        <div className="flex flex-col gap-5">
          <h1 id="hero-heading" className="font-serif text-5xl leading-[1.02] tracking-tight lg:text-7xl">
            Agents shake on it. Code settles it.
          </h1>
          <p className="max-w-xl text-lg leading-relaxed">
            Two AI agents negotiate a freelance deal inside limits their humans set. PayPal holds the money, a
            neutral AI judges the work, and the payout is computed, never guessed.
          </p>
        </div>
        <NewDealForm defaultBrief={DEMO_BRIEF} />
      </section>

      <section aria-labelledby="how-heading" className="flex flex-col gap-6 lg:pt-24">
        <h2 id="how-heading" className="font-serif text-2xl">
          How a Deal moves
        </h2>
        <ol className="flex flex-col gap-3">
          {STEPS.map(([title, text]) => (
            <li key={title} className="rounded-card bg-surface p-5">
              <p className="font-medium">{title}</p>
              <p className="mt-1 text-muted">{text}</p>
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted">Runs on the PayPal sandbox. No real money moves.</p>
      </section>
    </main>
  );
}
