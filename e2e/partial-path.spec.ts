import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

/**
 * Smoke test of the partial path after the Hold: Dev delivers partial work,
 * the real Arbiter judges it, the page shows the money plan the Verdict implies,
 * and Maya contests, which freezes Settlement before any PayPal call. The Hold
 * is a seeded placeholder because approving a PayPal Hold needs a person.
 */

const DEAL_ID = /Seeded (d-[a-z0-9]{10})/;

function seed(mode: string): string {
  const out = execFileSync("pnpm", ["-s", "seed:deal", mode], { encoding: "utf8" });
  const id = DEAL_ID.exec(out)?.[1];
  if (!id) throw new Error(`Seed script printed no Deal id: ${out}`);
  return id;
}

async function viewAs(page: Page, persona: "Maya · Client" | "Dev · Freelancer"): Promise<void> {
  const button = page.getByRole("button", { name: persona });
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
}

test.afterAll(() => {
  execFileSync("pnpm", ["-s", "clean:test-deals", "--delete"], { encoding: "utf8" });
});

test("partial Delivery → Verdict → money plan → Contest freezes Settlement", async ({ page }) => {
  const dealId = seed("held-no-money");
  await page.goto(`/deals/${dealId}`);
  await expect(page.getByText("$100.00 held")).toBeVisible();

  await viewAs(page, "Dev · Freelancer");
  await page.getByRole("button", { name: "Partial" }).click();
  await page.getByRole("button", { name: "Submit for the Verdict" }).click();

  // The real Arbiter (Claude Opus) reads the Delivery.
  const score = page.getByText(/\d of 5 criteria passed/);
  await expect(score).toBeVisible({ timeout: 150_000 });
  const passed = Number(/(\d) of 5/.exec((await score.textContent()) ?? "")?.[1]);
  expect(passed, "partial work should earn some criteria but not all").toBeGreaterThan(0);
  expect(passed).toBeLessThan(5);

  // Code turned the Verdict into a plan: a partial capture with the rest back to Maya.
  const planLine = page.getByText(/PayPal will capture \$[\d.]+ of the \$100\.00 held/);
  await expect(planLine).toBeVisible();
  const plan = (await planLine.textContent()) ?? "";
  const capture = Number(/capture \$([\d.]+)/.exec(plan)?.[1]);
  const released = Number(/\$([\d.]+) goes back to Maya/.exec(plan)?.[1]);
  expect(capture).toBeGreaterThan(0);
  expect(capture + released).toBeCloseTo(100, 2);
  await expect(page.getByText(/Money moves in \d+ s unless someone contests/)).toBeVisible();

  await viewAs(page, "Maya · Client");
  await page.getByRole("button", { name: "Contest the Verdict" }).click();
  await page.getByLabel("Why is the Verdict wrong?").fill("The benefits are too generic for our audience.");
  await page.getByRole("button", { name: "Contest and freeze Settlement" }).click();

  const frozen = page.getByText(/^Maya contested this Verdict/);
  await expect(frozen).toBeVisible();
  await expect(frozen).toContainText("Settlement is frozen");
  await expect(frozen).toContainText("No money has moved.");
});

test("the Ledger balances", async ({ page }) => {
  await page.goto("/ledger");
  await expect(page.getByRole("heading", { name: "Ledger", level: 1 })).toBeVisible();
  await expect(page.getByText("Balances", { exact: true })).toBeVisible();
});
