import { describe, expect, it, vi } from "vitest";
import { persistFundRequestDraft } from "./fund-request-draft";

function database(result: { data: { id: string } | null; error: unknown }) {
  const chain: any = {};
  for (const method of ["update", "insert", "eq", "select"]) chain[method] = vi.fn(() => chain);
  chain.single = vi.fn(async () => result);
  chain.maybeSingle = vi.fn(async () => result);
  return { db: { from: vi.fn(() => chain) }, chain };
}
const input = { clientId: "client", draftId: "draft", request: { fund_name: "Synthetic SPV" }, userId: "manager" };
describe("fund request draft persistence", () => {
  it("never acknowledges a failed update", async () => {
    const { db } = database({ data: null, error: { message: "write failed" } });
    await expect(persistFundRequestDraft(db, input)).rejects.toThrow("could not be saved");
  });
  it("refuses missing or submitted drafts instead of reporting success", async () => {
    const { db } = database({ data: null, error: null });
    await expect(persistFundRequestDraft(db, input)).rejects.toThrow("no longer editable");
  });
  it("scopes an update to this client and editable status and retains every answer", async () => {
    const { db, chain } = database({ data: { id: "draft" }, error: null });
    expect(await persistFundRequestDraft(db, input)).toEqual({ id: "draft" });
    expect(chain.eq.mock.calls).toEqual([["id", "draft"], ["client_id", "client"], ["status", "request_draft"]]);
    expect(chain.update).toHaveBeenCalledWith({ details: { fund_name: "Synthetic SPV", _kind: "fund_request_v2" } });
  });
  it("attributes a new draft to the server-verified account", async () => {
    const { db, chain } = database({ data: { id: "new" }, error: null });
    await persistFundRequestDraft(db, { ...input, draftId: null });
    expect(chain.insert).toHaveBeenCalledWith({ client_id: "client", status: "request_draft", details: { fund_name: "Synthetic SPV", _kind: "fund_request_v2" }, created_by: "manager" });
  });
});