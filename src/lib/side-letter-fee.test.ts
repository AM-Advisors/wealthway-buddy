import { expect, it } from "vitest";
import { SIDE_LETTER_FEE_CENTS, sideLetterText } from "@/lib/side-letter-fee";

it("charges $1,500 for a side letter", () => {
  expect(SIDE_LETTER_FEE_CENTS).toBe(150000);
});
it("waives only the minimum, naming the commitment and the minimum", () => {
  const t = sideLetterText({ fundName: "CORPS Erebor", investorName: "Jane Doe", commitmentCents: 25_000_00, minimumCents: 500_000_00, date: "2026-10-21" }).join("\n");
  expect(t).toContain("$500,000");
  expect(t).toContain("$25,000");
  expect(t).toMatch(/not amended/);
});
