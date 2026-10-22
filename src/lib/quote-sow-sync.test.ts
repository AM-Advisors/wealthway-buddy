import { describe, expect, it, vi } from "vitest";
import { linkedTermsEditProblem, quoteInputsFromRows, sowLinesFromQuote, type SharedQuoteLine } from "./quote-sow-sync";
import { saveLinkedQuoteDraft } from "./quote-sow-sync.server";

const lines: SharedQuoteLine[] = [{ service_key: "investor_services", label: "Investor services", quantity: 2,
  unit_cents: 1200000, baseline_unit_cents: 1200000, line_cents: 2400000, sort_order: 0,
  billing_frequency: "quarterly", first_bill_on: "2026-11-01", bookkeeping_snapshot: null,
  service_details: { scope: "Investor records", included: ["Monthly statements"], excluded: ["Tax advice"] } }];

describe("linked quote and SOW commercial edits", () => {
  it("copies quote prices, cadence, date and scope exactly into SOW terms", () => {
    expect(sowLinesFromQuote(lines)[0]).toEqual({ service_key: "investor_services", label: "Investor services", quantity: 2,
      unit_cents: 1200000, amount_cents: 2400000, billing_frequency: "quarterly", first_bill_on: "2026-11-01",
      bookkeeping_snapshot: null, service_details: { scope: "Investor records", included: ["Monthly statements"], excluded: ["Tax advice"] } });
  });
  it("SOW-side quote editor preserves all shared terms including frequency and exclusions", () => {
    expect(quoteInputsFromRows(lines)[0]).toMatchObject({ unitCents: 1200000, quantity: 2, billingFrequency: "quarterly",
      firstBillOn: "2026-11-01", details: { excluded: ["Tax advice"] } });
  });
  it("allows edits only when the quote and SOW are drafts", () => {
    expect(linkedTermsEditProblem({ status: "draft" }, { status: "draft", stage: "draft" })).toBeNull();
    expect(linkedTermsEditProblem({ status: "approved" }, { status: "draft" })).not.toBeNull();
  });
  it.each([{ client_signed_at: "2026-10-22" }, { executed_at: "2026-10-22" }, { locked: true }, { stage: "in_review" }, { signed_on: "2026-10-22" }])("never rewrites reviewed or signed SOWs: %j", flags => {
    expect(linkedTermsEditProblem({ status: "draft" }, { status: "draft", ...flags })).not.toBeNull();
  });
  it("uses one transactional save with provenance and expected revision, not reciprocal writes", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "quote-1", error: null });
    await saveLinkedQuoteDraft({ rpc }, { id: "quote-1", actorId: "rep-1", expectedAt: "2026-10-22T19:30:00Z", row: { title: "Updated SOW" }, lines });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("save_linked_quote_draft", expect.objectContaining({ p_expected_at: "2026-10-22T19:30:00Z",
      p_actor_id: "rep-1", p_sow_lines: sowLinesFromQuote(lines), p_sow_patch: null }));
  });
  it("fails the complete save on stale/reviewed records or persistence errors", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "Quote changed" } });
    await expect(saveLinkedQuoteDraft({ rpc }, { id: "quote-1", actorId: "rep-1", expectedAt: "old", row: {}, lines })).rejects.toThrow("could not be saved together");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});