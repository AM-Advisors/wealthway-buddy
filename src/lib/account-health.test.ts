import { describe, expect, it } from "vitest";
import { clientHealth } from "./account-health";

const base = { stuckFunds: 0, overdueInvoices: 0, unansweredMessages: 0, openRequests: 0, daysSinceActivity: 3 };
describe("clientHealth", () => {
  it("is healthy with nothing outstanding", () => expect(clientHealth(base).health).toBe("Healthy"));
  it("needs attention for a waiting message", () => expect(clientHealth({ ...base, unansweredMessages: 1 }).health).toBe("Needs attention"));
  it("is at risk with stuck funds and overdue invoices", () => {
    const r = clientHealth({ ...base, stuckFunds: 1, overdueInvoices: 1 });
    expect(r.health).toBe("At risk");
    expect(r.reasons).toHaveLength(2);
  });
  it("counts long silence", () => expect(clientHealth({ ...base, daysSinceActivity: 90 }).health).toBe("Needs attention"));
});
