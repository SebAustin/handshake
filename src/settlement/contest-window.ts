import type { Role } from "@/deals/model";

/**
 * The Contest Window: after a Verdict, either side may Contest before money
 * moves. It closes when the time elapses or when both sides waive it — one
 * side can never skip the other's window (Nov 6 decision; 30 s for the demo).
 */

export const CONTEST_WINDOW_MS = 30_000;

export interface ContestWindow {
  isOpen: boolean;
  closesAt?: string;
  remainingMs: number;
}

export function contestWindow(
  deal: { verdictAt?: string; waivers?: readonly Role[] },
  now: Date,
): ContestWindow {
  if (!deal.verdictAt) return { isOpen: false, remainingMs: 0 };
  const closesAt = Date.parse(deal.verdictAt) + CONTEST_WINDOW_MS;
  const remainingMs = Math.max(0, closesAt - now.getTime());
  const bothWaived = ["client", "freelancer"].every((role) => deal.waivers?.includes(role as Role));
  return { isOpen: remainingMs > 0 && !bothWaived, closesAt: new Date(closesAt).toISOString(), remainingMs };
}
