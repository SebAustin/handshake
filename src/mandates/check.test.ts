import { describe, expect, test } from "vitest";
import type { ClientMandate, FreelancerMandate, Terms } from "@/deals/model";
import { checkTerms, checkTermsAgainstBoth, findAgreementGaps } from "./check";

const CRITERIA_IDS = ["headline", "tone", "length"];

const CLIENT: ClientMandate = {
  role: "client",
  budgetCeilingCents: 12000,
  maxDeadlineHours: 48,
  minWeights: { headline: 4000 },
};

const FREELANCER: FreelancerMandate = {
  role: "freelancer",
  minPriceCents: 8000,
  minDeadlineHours: 24,
  maxWeights: { tone: 2000 },
};

const GOOD_TERMS: Terms = {
  priceCents: 10000,
  deadlineHours: 36,
  weights: { headline: 5000, tone: 2000, length: 3000 },
};

const codes = (violations: { code: string }[]) => violations.map((v) => v.code);

describe("checkTerms against a Client Mandate", () => {
  test("accepts terms inside the Mandate", () => {
    expect(checkTerms(GOOD_TERMS, CLIENT, CRITERIA_IDS)).toEqual([]);
  });

  test("flags price over budget, deadline too long and a weight under the Client's floor", () => {
    const terms: Terms = { priceCents: 12001, deadlineHours: 49, weights: { headline: 3999, tone: 2001, length: 4000 } };

    expect(codes(checkTerms(terms, CLIENT, CRITERIA_IDS))).toEqual([
      "PRICE_ABOVE_BUDGET",
      "DEADLINE_TOO_LONG",
      "WEIGHT_BELOW_FLOOR",
    ]);
  });

  test("accepts terms exactly at the Mandate limits", () => {
    const terms: Terms = { priceCents: 12000, deadlineHours: 48, weights: { headline: 4000, tone: 2000, length: 4000 } };

    expect(checkTerms(terms, CLIENT, CRITERIA_IDS)).toEqual([]);
  });
});

describe("checkTerms against a Freelancer Mandate", () => {
  test("flags price under minimum, deadline too short and a weight over the Freelancer's cap", () => {
    const terms: Terms = { priceCents: 7999, deadlineHours: 23, weights: { headline: 5000, tone: 2001, length: 2999 } };

    const violations = checkTerms(terms, FREELANCER, CRITERIA_IDS);

    expect(codes(violations)).toEqual(["PRICE_BELOW_MINIMUM", "DEADLINE_TOO_SHORT", "WEIGHT_ABOVE_CAP"]);
    expect(violations[2]).toMatchObject({ criterionId: "tone" });
  });
});

describe("checkTerms structural rules", () => {
  test("flags weights that do not sum to 10 000 bp", () => {
    const terms: Terms = { ...GOOD_TERMS, weights: { headline: 5000, tone: 2000, length: 2999 } };

    expect(codes(checkTerms(terms, CLIENT, CRITERIA_IDS))).toContain("WEIGHTS_NOT_NORMALIZED");
  });

  test("flags weights for unknown criteria and criteria left unweighted", () => {
    const terms: Terms = { ...GOOD_TERMS, weights: { headline: 5000, tone: 2000, bonus: 3000 } };

    const violations = checkTerms(terms, CLIENT, CRITERIA_IDS);

    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "UNKNOWN_CRITERION", criterionId: "bonus" }),
        expect.objectContaining({ code: "MISSING_CRITERION", criterionId: "length" }),
      ]),
    );
  });
});

describe("checkTermsAgainstBoth", () => {
  test("reports violations from both sides, tagged by role", () => {
    const terms: Terms = { ...GOOD_TERMS, priceCents: 13000, deadlineHours: 12 };

    expect(checkTermsAgainstBoth(terms, CLIENT, FREELANCER, CRITERIA_IDS)).toEqual([
      expect.objectContaining({ role: "client", code: "PRICE_ABOVE_BUDGET" }),
      expect.objectContaining({ role: "freelancer", code: "DEADLINE_TOO_SHORT" }),
    ]);
  });
});

describe("findAgreementGaps", () => {
  test("returns nothing when the two Mandates overlap", () => {
    expect(findAgreementGaps(CLIENT, FREELANCER)).toEqual([]);
  });

  test("explains why two Mandates can never reach a Deal", () => {
    const stingyClient: ClientMandate = { ...CLIENT, budgetCeilingCents: 7000, maxDeadlineHours: 12 };
    const cautiousFreelancer: FreelancerMandate = { ...FREELANCER, maxWeights: { headline: 3000 } };

    expect(codes(findAgreementGaps(stingyClient, cautiousFreelancer))).toEqual([
      "BUDGET_BELOW_MINIMUM_PRICE",
      "DEADLINE_WINDOW_EMPTY",
      "WEIGHT_FLOOR_ABOVE_CAP",
    ]);
  });
});
