import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CriteriaPanel } from "@/components/deal/CriteriaPanel";
import { DealSummary } from "@/components/deal/DealSummary";
import { HoldPanel } from "@/components/deal/HoldPanel";
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

export default function DealPage({ params }: PageProps<"/deals/[id]">) {
  return (
    <Suspense fallback={<DealSkeleton />}>
      <DealScreen params={params} />
    </Suspense>
  );
}

async function DealScreen({ params }: { params: PageProps<"/deals/[id]">["params"] }) {
  const { id } = await params;
  const { deals, transcript } = getServices();
  const [stored, persona, recent] = await Promise.all([deals.get(id), getPersona(), deals.listRecent(8)]);
  if (!stored) notFound();
  const { deal } = stored;
  const messages = deal.mandates ? await transcript.list(id) : [];

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
            <StagePanel deal={deal} persona={persona} messages={messages} />
          </div>
          <DealSummary deal={deal} />
        </div>
      </div>
    </AppShell>
  );
}

function StagePanel({ deal, persona, messages }: { deal: Deal; persona: Role; messages: Awaited<ReturnType<ReturnType<typeof getServices>["transcript"]["list"]>> }) {
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

  return (
    <>
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
