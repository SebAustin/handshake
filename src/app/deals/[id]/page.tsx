import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CriteriaPanel } from "@/components/deal/CriteriaPanel";
import { DealSummary } from "@/components/deal/DealSummary";
import { DeliveryPanel } from "@/components/deal/DeliveryPanel";
import { HoldPanel } from "@/components/deal/HoldPanel";
import { SettlementPanel } from "@/components/deal/SettlementPanel";
import { VerdictPanel } from "@/components/deal/VerdictPanel";
import { MandatePanel } from "@/components/deal/MandatePanel";
import { NegotiationView } from "@/components/deal/NegotiationView";
import { StageStrip } from "@/components/deal/StageStrip";
import { nextStep } from "@/components/deal/stages";
import { AppShell } from "@/components/shell/AppShell";
import type { Role } from "@/deals/model";
import type { Deal } from "@/deals/state-machine";
import { dealTitle } from "@/lib/format";
import { getPersona, getServices } from "@/server/context";
import { getPayPalClientId } from "@/server/paypal";
import { contestWindow } from "@/settlement/contest-window";

export default function DealPage({ params }: PageProps<"/deals/[id]">) {
  return (
    <Suspense fallback={<DealSkeleton />}>
      <DealScreen params={params} />
    </Suspense>
  );
}

async function DealScreen({ params }: { params: PageProps<"/deals/[id]">["params"] }) {
  // Every Deal view is live data: render at request time, never prerendered.
  await connection();
  const { id } = await params;
  const { deals, transcript } = getServices();
  const [stored, persona, recent] = await Promise.all([deals.get(id), getPersona(), deals.listRecent(8)]);
  if (!stored) notFound();
  const { deal } = stored;
  const { deliveries } = getServices();
  const [messages, latestDelivery] = await Promise.all([
    deal.mandates ? transcript.list(id) : Promise.resolve([]),
    deal.deliveryAttempt > 0 ? deliveries.latest(id) : Promise.resolve(null),
  ]);

  return (
    <AppShell persona={persona} recentDeals={recent} currentDealId={id}>
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-3">
          <StageStrip deal={deal} />
          <h1 className="font-serif text-3xl leading-tight tracking-tight lg:text-4xl">{dealTitle(deal.brief)}</h1>
          <p className="text-base">{nextStep(deal, persona)}</p>
        </header>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          <div className="flex min-w-0 flex-col gap-3">
            <StagePanel deal={deal} persona={persona} messages={messages} latestDelivery={latestDelivery ?? undefined} />
          </div>
          <DealSummary deal={deal} />
        </div>
      </div>
    </AppShell>
  );
}

interface StagePanelProps {
  deal: Deal;
  persona: Role;
  messages: Awaited<ReturnType<ReturnType<typeof getServices>["transcript"]["list"]>>;
  latestDelivery?: { attempt: 1 | 2; content: string };
}

/** The current step first, then the steps already done, newest to oldest. */
function StagePanel({ deal, persona, messages, latestDelivery }: StagePanelProps) {
  if (deal.state === "brief_drafted") {
    return <CriteriaPanel dealId={deal.id} draft={deal.draft} canEdit={persona === "client"} />;
  }

  const other: Role = persona === "client" ? "freelancer" : "client";
  const own = deal.mandates?.[persona] ?? deal.pendingMandates?.[persona];
  const ownLimit = own
    ? { role: persona, cents: "budgetCeilingCents" in own ? own.budgetCeilingCents : own.minPriceCents }
    : undefined;
  const bothSet = Boolean(deal.pendingMandates?.client && deal.pendingMandates?.freelancer);

  const hasHold = deal.terms && !["criteria_approved", "negotiating", "no_deal"].includes(deal.state);

  const isSettled = ["settling", "payout_pending", "paid", "payout_failed", "voided"].includes(deal.state);
  const isPastHold = deal.deliveryAttempt > 0 || deal.state === "held" || deal.state === "revision_requested";
  const window = contestWindow(deal, new Date());

  return (
    <>
      {isSettled && deal.plan && deal.terms && (
        <SettlementPanel
          dealId={deal.id}
          state={deal.state}
          plan={deal.plan}
          terms={deal.terms}
          capture={deal.capture}
          payout={deal.payout}
        />
      )}
      {deal.verdict && deal.plan && deal.terms && deal.state !== "revision_requested" && (
        <VerdictPanel
          dealId={deal.id}
          persona={persona}
          state={deal.state}
          criteria={deal.criteria}
          verdict={deal.verdict}
          plan={deal.plan}
          terms={deal.terms}
          closesAt={window.closesAt}
          waivers={deal.waivers ?? []}
          contest={deal.contest}
        />
      )}
      {isPastHold && deal.terms && (
        <DeliveryPanel
          dealId={deal.id}
          state={deal.state}
          canDeliver={persona === "freelancer"}
          deadlineHours={deal.terms.deadlineHours}
          attempt={deal.deliveryAttempt}
          latest={latestDelivery}
        />
      )}
      {hasHold && deal.terms && (
        <HoldPanel
          dealId={deal.id}
          state={deal.state}
          priceCents={deal.terms.priceCents}
          clientId={getPayPalClientId()}
          canPay={persona === "client"}
          authorizationId={deal.hold?.authorizationId}
        />
      )}
      {deal.state === "criteria_approved" && (
        <MandatePanel
          dealId={deal.id}
          persona={persona}
          ownMandate={deal.pendingMandates?.[persona]}
          otherIsSet={Boolean(deal.pendingMandates?.[other])}
        />
      )}
      <NegotiationView
        dealId={deal.id}
        state={deal.state}
        criteria={deal.criteria}
        messages={messages}
        canStart={deal.state === "criteria_approved" && bothSet}
        agreedTerms={deal.terms}
        ownLimit={ownLimit}
      />
    </>
  );
}

function DealSkeleton() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pt-8 lg:pl-[272px]">
      <div className="h-4 w-80 rounded bg-raised" />
      <div className="h-10 w-2/3 rounded bg-raised" />
      <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
        <div className="h-72 rounded-card bg-surface" />
        <div className="h-72 rounded-card bg-surface" />
      </div>
    </div>
  );
}
