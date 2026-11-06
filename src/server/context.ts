import "server-only";
import { cookies } from "next/headers";
import { getDatabase } from "@/db/client";
import type { Role } from "@/deals/model";
import { createDealRepository } from "@/deals/repository";
import { createDeliveryStore } from "@/deliveries/store";
import { createTranscriptStore } from "@/negotiation/transcript";

/** Server-side wiring shared by pages, actions and route handlers. */

export function getServices() {
  const db = getDatabase();
  return {
    deals: createDealRepository(db),
    transcript: createTranscriptStore(db),
    deliveries: createDeliveryStore(db),
  };
}

export const PERSONA_COOKIE = "handshake-persona";

export const PERSONAS: Record<Role, { name: string; role: Role; title: string }> = {
  client: { name: "Maya", role: "client", title: "Client" },
  freelancer: { name: "Dev", role: "freelancer", title: "Freelancer" },
};

/**
 * Demo identity (PLAN.md Q16): no accounts, a persona switcher instead. The
 * persona decides which side's controls a viewer sees and may use.
 */
export async function getPersona(): Promise<Role> {
  const value = (await cookies()).get(PERSONA_COOKIE)?.value;
  return value === "freelancer" ? "freelancer" : "client";
}
