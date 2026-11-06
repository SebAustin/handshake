/**
 * Lists the test Deals that never touched real sandbox money (seeded with a
 * placeholder Hold or a "[Test" Brief), and deletes them only with --delete.
 * Their negotiation messages, Deliveries and ledger events go with them (cascade).
 *
 *   pnpm clean:test-deals            # dry run: list what would go
 *   pnpm clean:test-deals --delete   # delete them
 */
import { inArray } from "drizzle-orm";
import { createDatabase } from "../src/db/client";
import { deals } from "../src/db/schema";
import { dealTitle } from "../src/lib/format";

const PLACEHOLDER_HOLD = /^TESTNOPAYPAL/;

async function main(): Promise<void> {
  const shouldDelete = process.argv.includes("--delete");
  const { db, close } = createDatabase(process.env.DATABASE_URL ?? "");
  try {
    const rows = await db.select().from(deals);
    const isTest = (row: (typeof rows)[number]) =>
      row.brief.trimStart().startsWith("[Test") || PLACEHOLDER_HOLD.test(row.hold?.orderId ?? "");
    const tests = rows.filter(isTest);

    for (const row of rows) {
      const mark = isTest(row) ? "TEST" : "keep";
      console.log(`${mark}  ${row.id}  ${row.state.padEnd(16)} ${row.createdAt.toISOString().slice(0, 16)}  ${dealTitle(row.brief)}`);
    }
    console.log(`\n${tests.length} test Deal(s) of ${rows.length}.`);

    if (!shouldDelete || tests.length === 0) {
      if (tests.length > 0) console.log("Dry run: nothing deleted. Re-run with --delete to remove them.");
      return;
    }
    await db.delete(deals).where(inArray(deals.id, tests.map((row) => row.id)));
    console.log(`Deleted ${tests.length} test Deal(s).`);
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
