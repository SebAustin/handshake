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
  children: ReactNode;
}

/** Open-plane shell: a labelled sidebar on the page ground, the canvas beside it. */
export function AppShell({ persona, recentDeals, currentDealId, children }: AppShellProps) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="flex flex-col gap-8 px-4 pt-6 pb-4 lg:sticky lg:top-0 lg:h-dvh">
        <Link href="/" className="press flex items-center gap-2.5 rounded-control px-2 py-1">
          <Mark />
          <span className="font-serif text-xl">Handshake</span>
        </Link>

        <PersonaSwitcher persona={persona} />

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
