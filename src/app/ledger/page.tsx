import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LedgerList } from "@/components/ledger/LedgerList";
import { LedgerTotalsStrip } from "@/components/ledger/LedgerTotalsStrip";
import { AppShell } from "@/components/shell/AppShell";
import { ledgerTotals, MONEY_EVENT_TYPES, toLedgerEntries } from "@/ledger/entries";
import { dealTitle } from "@/lib/format";
import { getPersona, getServices } from "@/server/context";

export const metadata = { title: "Ledger · Handshake" };

const LEDGER_LIMIT = 300;
const dealIdPattern = /^d-[a-z0-9]{10}$/;

export default function LedgerPage({ searchParams }: PageProps<"/ledger">) {
  return (
    <Suspense fallback={<p className="p-8 text-muted">Reading the ledger…</p>}>
      <LedgerScreen searchParams={searchParams} />
    </Suspense>
  );
}

async function LedgerScreen({ searchParams }: { searchParams: PageProps<"/ledger">["searchParams"] }) {
  await connection();
  const { deal: dealParam } = await searchParams;
  const dealFilter = typeof dealParam === "string" && dealIdPattern.test(dealParam) ? dealParam : undefined;

  const { deals } = getServices();
  const [persona, recent, rows] = await Promise.all([
    getPersona(),
    deals.listRecent(8),
    deals.listLedgerEvents(MONEY_EVENT_TYPES, LEDGER_LIMIT),
  ]);
  const scoped = dealFilter ? rows.filter((row) => row.dealId === dealFilter) : rows;
  const dealList = await deals.getMany([...new Set(scoped.map((row) => row.dealId))]);
  const entries = toLedgerEntries(scoped, new Map(dealList.map((deal) => [deal.id, deal])));
  const filteredDeal = dealFilter ? dealList.find((deal) => deal.id === dealFilter) : undefined;

  return (
    <AppShell persona={persona} recentDeals={recent} currentPage="ledger">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            {filteredDeal ? (
              <>
                <Link href="/ledger" className="underline decoration-control underline-offset-4 hover:text-ink">
                  Ledger
                </Link>{" "}
                / one Deal
              </>
            ) : (
              "Every PayPal movement, newest first"
            )}
          </p>
          <h1 className="font-serif text-3xl leading-tight tracking-tight lg:text-4xl">
            {filteredDeal ? dealTitle(filteredDeal.brief) : "Ledger"}
          </h1>
          <p className="max-w-prose text-base">
            Each line is a call code made to PayPal, with PayPal&apos;s own reference so you can check it in the sandbox.
            No model ever made one of these calls.
          </p>
        </header>

        <LedgerTotalsStrip totals={ledgerTotals(entries)} />
        <LedgerList entries={entries} showDeal={!filteredDeal} />
      </div>
    </AppShell>
  );
}
