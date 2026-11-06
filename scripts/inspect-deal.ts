/** Prints a Deal's state and, if it has a Hold, the PayPal order status. Usage: pnpm inspect:deal <dealId> */
import { createDatabase } from "../src/db/client";
import { createDealRepository } from "../src/deals/repository";
import { createPayPalClient } from "../src/paypal/client";

async function main(): Promise<void> {
  const id = process.argv[2];
  if (!id) throw new Error("Usage: pnpm inspect:deal <dealId>");
  const { db, close } = createDatabase(process.env.DATABASE_URL ?? "");
  try {
    const deal = (await createDealRepository(db).get(id))?.deal;
    console.log("state:", deal?.state, "| hold:", JSON.stringify(deal?.hold ?? null));
    if (deal?.hold?.orderId) {
      const paypal = createPayPalClient({
        clientId: process.env.PAYPAL_CLIENT_ID ?? "",
        clientSecret: process.env.PAYPAL_CLIENT_SECRET ?? "",
        baseUrl: process.env.PAYPAL_API_BASE ?? "",
      });
      console.log("paypal order:", JSON.stringify(await paypal.getOrder(deal.hold.orderId)));
    }
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
