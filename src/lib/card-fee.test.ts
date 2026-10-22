import { describe, expect, it } from "vitest";
import { cardServiceFeeCents } from "./card-fee";
describe("card service fee", () => {
  it("is 3.5% of the invoice", () => { expect(cardServiceFeeCents(1_200_000)).toBe(42_000); });
  it("rounds to the cent", () => { expect(cardServiceFeeCents(1001)).toBe(35); });
  it("is zero for nothing owed", () => { expect(cardServiceFeeCents(0)).toBe(0); });
});
