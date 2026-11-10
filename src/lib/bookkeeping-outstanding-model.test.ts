import { describe, expect, it } from "vitest";
import { buildOutstandingItems, missingStatementMonths, outstandingSummary, type OutstandingFacts } from "@/lib/bookkeeping-outstanding-model";

const empty: OutstandingFacts = { asOf: "2026-11-10", uploads: [], lines: [], infoRequests: [], exceptions: [], checklist: [], reviewRequests: [] };
const line = (over: Partial<OutstandingFacts["lines"][number]> = {}): OutstandingFacts["lines"][number] => ({
  id: "l1", posted_on: "2026-09-03", description: "Wire out", amount_cents: 50000, direction: "out", skip: false, duplicate_of: null,
  confirmed_category: null, matched_onboarding_id: null, matched_asset_id: null, matched_vendor: null, applied_tx_id: null, ...over,
});

describe("missing statements", () => {
  it("lists months without a statement from the first one on file through last month", () => {
    const gaps = missingStatementMonths([
      { period_start: "2026-07-01", period_end: "2026-07-31", bank_name: "First Bank", account_mask: "****1234", status: "applied" },
      { period_start: "2026-09-01", period_end: "2026-09-30", bank_name: "First Bank", account_mask: "1234", status: "parsed" },
    ], "2026-11-10");
    expect(gaps).toEqual([{ account: "First Bank ending 1234", months: ["2026-08", "2026-10"] }]);
  });
  it("the current, incomplete month is never requested", () => {
    expect(missingStatementMonths([{ period_start: "2026-10-01", period_end: "2026-10-31", bank_name: "B", account_mask: "1", status: "applied" }], "2026-11-10")).toEqual([]);
  });
});

describe("outstanding items", () => {
  it("nothing outstanding gives an empty report", () => {
    expect(buildOutstandingItems(empty)).toEqual([]);
  });
  it("unexplained transactions are the client's to explain; assigned, skipped or duplicate lines are not", () => {
    const items = buildOutstandingItems({ ...empty, lines: [line(), line({ id: "l2", matched_vendor: "Law firm" }), line({ id: "l3", skip: true }), line({ id: "l4", duplicate_of: "l1" })] });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ owner: "client", title: "Tell us what 1 transaction was for" });
    expect(items[0]!.lines?.[0]?.amountCents).toBe(-50000);
  });
  it("a review request waits on the client until they mark it provided, then Harmonious has it", () => {
    const req = { id: "r1", title: "March law firm invoice", requested_information: "PDF please", responsibility_status: "CLIENT_INFORMATION_REQUIRED", responsibility_note_client: null, due_date: "2026-11-20", created_at: "2026-11-01T00:00:00Z", status: "open" };
    expect(buildOutstandingItems({ ...empty, reviewRequests: [req] })[0]).toMatchObject({ owner: "client", requestId: "r1", dueOn: "2026-11-20" });
    expect(buildOutstandingItems({ ...empty, reviewRequests: [{ ...req, responsibility_status: "HARMONIOUS_HANDLING" }] })[0]).toMatchObject({ owner: "harmonious", dueOn: null });
    expect(buildOutstandingItems({ ...empty, reviewRequests: [{ ...req, status: "done" }] })).toEqual([]);
  });
  it("only payment-identity exceptions go to the client; the rest stay with Harmonious", () => {
    const items = buildOutstandingItems({ ...empty, exceptions: [{ id: "e1", kind: "unknown_counterparty", opened_at: "2026-10-01" }, { id: "e2", kind: "posting_failure", opened_at: "2026-10-02" }] });
    expect(items.map((i) => i.owner)).toEqual(["client", "harmonious"]);
    expect(outstandingSummary(items)).toEqual({ needFromYou: 1, harmoniousWorking: 1, oldestClientItem: "2026-10-01" });
  });
  it("open blocking close steps are Harmonious work; done or waived steps are not listed", () => {
    const items = buildOutstandingItems({ ...empty, checklist: [
      { period_end: "2026-09-30", label: "Reconcile", blocking: true, status: "open" },
      { period_end: "2026-09-30", label: "Review", blocking: true, status: "waived" },
      { period_end: "2026-09-30", label: "Note", blocking: false, status: "open" },
    ] });
    expect(items).toEqual([expect.objectContaining({ owner: "harmonious", detail: "1 close step left." })]);
  });
});
