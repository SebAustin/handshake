import Link from "next/link";
import type { ReactNode } from "react";
import type { Role } from "@/deals/model";
import type { Deal } from "@/deals/state-machine";
import { dealTitle } from "@/lib/format";
import { stageOf } from "@/components/deal/stages";
import { Mark } from "./Mark";
import { PersonaSwitcher } from "./PersonaSwitcher";

interface AppShellProps {
  persona: Role;
  recentDeals: readonly Deal[];
  currentDealId?: string;
  currentPage?: "ledger";
  children: ReactNode;
}

/** Open-plane shell: a labelled sidebar on the page ground, the canvas beside it. */
export function AppShell({ persona, recentDeals, currentDealId, currentPage, children }: AppShellProps) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-border px-4 py-3 lg:sticky lg:top-0 lg:h-dvh lg:flex-col lg:flex-nowrap lg:items-stretch lg:justify-start lg:gap-8 lg:border-b-0 lg:pt-6 lg:pb-4">
        <Link href="/" className="press flex items-center gap-2.5 rounded-control px-2 py-1">
          <Mark />
          <span className="font-serif text-xl">Handshake</span>
        </Link>

        <PersonaSwitcher persona={persona} />

        <Link
          href="/ledger"
          aria-current={currentPage === "ledger" ? "page" : undefined}
          className={`press flex items-baseline justify-between rounded-control px-2 py-1.5 text-sm lg:-mt-4 ${
            currentPage === "ledger" ? "bg-raised text-ink" : "text-muted hover:text-ink"
          }`}
        >
          Ledger
          <span className="hidden text-xs text-muted lg:inline">every PayPal movement</span>
        </Link>

        <nav aria-label="Deals" className="hidden min-h-0 flex-1 flex-col gap-1 overflow-y-auto lg:flex">
          <div className="mb-1 flex items-center justify-between px-2">
            <span className="text-xs text-muted">Deals</span>
            <Link href="/" className="press rounded-control px-1.5 text-xs text-muted hover:text-ink">
              New
            </Link>
          </div>
          {recentDeals.map((deal) => (
            <Link
              key={deal.id}
              href={`/deals/${deal.id}`}
              aria-current={deal.id === currentDealId ? "page" : undefined}
              className={`press block rounded-control px-2 py-1.5 ${
                deal.id === currentDealId ? "bg-raised text-ink" : "text-muted hover:text-ink"
              }`}
            >
              <span className="line-clamp-1 text-sm">{dealTitle(deal.brief, 40)}</span>
              <span className="block text-xs text-muted">{stageOf(deal).label}</span>
            </Link>
          ))}
        </nav>

        <p className="hidden text-xs text-muted lg:block">PayPal sandbox · test money only</p>
      </aside>

      <main className="min-w-0 px-4 pt-6 pb-16 lg:px-8 lg:pt-8">{children}</main>
    </div>
  );
}
