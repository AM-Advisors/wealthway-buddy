import { describe, expect, it } from "vitest";
import { feeEligible, feeSource, feeTargetError } from "./invoice-fee-accounting";
const line = { id: "fee-1", amount_cents: 1200000 };
describe("specific fund or company fee accounting", () => {
  it("allows a specific same-client company", () => expect(feeTargetError("client-1", line, { id: "company-1", client_id: "client-1", kind: "company", name: "Company" })).toBeNull());
  it("refuses another client's company", () => expect(feeTargetError("client-1", line, { id: "company-2", client_id: "client-2", kind: "company", name: "Company" })).not.toBeNull());
  it("preserves the recorded fund rather than moving its fee", () => expect(feeTargetError("client-1", { ...line, offering_id: "fund-1" }, { id: "fund-2", client_id: "client-1", kind: "fund", name: "Fund" })).not.toBeNull());
  it("includes the issued quarterly fee of $12,000", () => expect(feeEligible("issued", line)).toBe(true));
  it.each(["draft", "void"])("excludes %s invoice fees from accounting", status => expect(feeEligible(status, line)).toBe(false));
  it("never activates proposed bookkeeping prices", () => expect(feeEligible("issued", { ...line, service_key: "BOOKKEEPING_ACCOUNTING" })).toBe(false));
  it("retains one stable source across repeated reads", () => expect(feeSource("fee-1")).toEqual({ table: "invoice_lines", id: "fee-1" }));
});