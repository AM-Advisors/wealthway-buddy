import { describe, expect, it } from "vitest";
import { payoutDueDate, PAYOUT_RECORDERS } from "./commission-model";

describe("payoutDueDate", () => {
  it("Feb 10 pays out Mar 31", () => expect(payoutDueDate("2026-02-10")).toBe("2026-03-31"));
  it("Dec 31 pays out Dec 31", () => expect(payoutDueDate("2026-12-31")).toBe("2026-12-31"));
  it("Apr 1 pays out Jun 30", () => expect(payoutDueDate("2026-04-01")).toBe("2026-06-30"));
});
describe("payout recorders", () => {
  it("only Finance, CRO and CEO", () => expect([...PAYOUT_RECORDERS].sort()).toEqual(["cro", "executive", "finance"]));
});
