import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ details: {} as Record<string, unknown>, allowed: true, uploads: vi.fn(), notify: vi.fn(), writes: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const chain: any = { middleware: () => chain, validator: () => chain, handler: (h: any) => h };
  return chain;
} }));
vi.mock("@/lib/require-auth", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/fund-access.server", () => ({ fundAccessAllows: async () => mock.allowed }));
vi.mock("@/lib/ops-slack-notify.server", () => ({ notifySubmission: mock.notify }));
vi.mock("@/lib/close-harmonious-fees.server", () => ({ loadCloseHarmoniousFees: async () => ({ lines: [], oneTimeCents: 0, raiseCents: null, needsReview: false, sideLetterPaidCount: 0, clientId: "client" }) }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: (table: string) => {
    let writing = false;
    const result = () => ({ data: table === "investor_onboardings" ? [{ id: "investor", commitment_amount_cents: 100000, persons: { legal_first_name: "Fictional" } }] : table === "fund_close_requests" ? writing ? [{ id: "close" }] : [{ id: "close", offering_id: "fund", status: "draft", details: mock.details }] : [], error: null });
    const q: any = { select: () => q, eq: () => q, is: () => q, in: () => q, order: () => q,
      update: (value: unknown) => { writing = true; mock.writes(table, value); return q; },
      insert: (value: unknown) => { writing = true; mock.writes(table, value); return q; },
      maybeSingle: async () => table === "offerings" ? { data: { client_id: "client" } } : { data: result().data[0] ?? null },
      single: async () => ({ data: { id: "close" } }),
      then: (resolve: any) => Promise.resolve(result()).then(resolve),
    };
    return q;
  },
  storage: { from: () => ({ upload: async (...args: unknown[]) => { mock.uploads(...args); return { error: null }; }, createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://fictional.test/${path}` }, error: null }) }) },
} }));

import { createFundCloseRequest, getCloseHarmoniousFees, openCloseAttachment } from "./fund-close-requests.functions";
// The isolated builder exposes handlers; no network or real storage is available.
const create = createFundCloseRequest as unknown as (input: any) => Promise<any>;
const open = openCloseAttachment as unknown as (input: any) => Promise<any>;
const file = { fileName: "fictional.pdf", contentType: "application/pdf", base64: "RmljdGlvbmFs" };
const details = () => ({ assetMode: "existing", existingAsset: "Fictional asset", asset: { name: "", issuer: "", type: "", amountCents: null, notes: "" }, purchaseAgreement: file, purchaseAgreementSigned: true, wireInstructions: file, managementFeePct: 0, managementFeeCents: 0, feeConfirmed: true, wire: {}, investorStates: [] });
const input = (d: unknown, intent = "submit") => ({ data: { fundId: "fund", onboardingIds: ["investor"], intent, targetDate: null, notes: "", details: d }, context: { userId: "fictional-user" } });

beforeEach(() => { mock.details = {}; mock.allowed = true; mock.uploads.mockClear(); mock.notify.mockClear(); mock.writes.mockClear(); });
describe("server-enforced close paperwork", () => {
  it("recomputes Harmonious fee snapshots instead of trusting a browser amount", async () => {
    await create(input({ ...details(), harmoniousFees: { oneTimeCents: 99999999 } }));
    const saved = mock.writes.mock.calls.find(call => call[1]?.details?.harmoniousFees);
    expect(saved?.[1]?.details?.harmoniousFees.oneTimeCents).toBe(0);
  });
  it("refuses fee reads without exact-fund access", async () => {
    mock.allowed = false;
    const fees = getCloseHarmoniousFees as unknown as (input: any) => Promise<any>;
    await expect(fees({ data: { fundId: 'fund', onboardingIds: [] }, context: { userId: 'other', supabase: {} } })).rejects.toThrow("don't have access");
    expect(mock.writes).not.toHaveBeenCalled();
  });
  it("refuses missing details on direct submission before writes or notices", async () => {
    await expect(create(input(undefined))).rejects.toThrow("Upload the signed purchase agreement.");
    expect(mock.writes).not.toHaveBeenCalled(); expect(mock.notify).not.toHaveBeenCalled();
  });
  it("refuses an unsigned-copy submission", async () => {
    await expect(create(input({ ...details(), purchaseAgreementSigned: false }))).rejects.toThrow("Confirm the purchase agreement copy is signed.");
    expect(mock.writes).not.toHaveBeenCalled();
  });
  it("refuses missing wire copy even with receiving-account details", async () => {
    await expect(create(input({ ...details(), wireInstructions: null, wire: { bankName: "Fictional bank" } }))).rejects.toThrow("Upload a copy of the wire instructions.");
    expect(mock.writes).not.toHaveBeenCalled();
  });
  it("allows incomplete drafts without submission or notification", async () => {
    expect(await create(input(undefined, "draft"))).toEqual({ id: "close", status: "draft" });
    expect(mock.notify).not.toHaveBeenCalled();
  });
  it("uploads both copies privately, records confirmation and sends only after saving", async () => {
    expect(await create(input(details()))).toEqual({ id: "close", status: "submitted" });
    expect(mock.uploads).toHaveBeenCalledTimes(2);
    const saved = mock.writes.mock.calls.find(call => call[0] === "fund_close_requests" && call[1]?.details?.wireInstructionsPath);
    expect(saved?.[1]?.details?.purchaseAgreementSignedConfirmedBy).toBe("fictional-user");
    expect(saved?.[1]?.details?.wireInstructionsPath).toContain("close-requests/fund/close/wire-");
    expect(saved?.[1]?.details?.wireInstructions).toBeUndefined();
    expect(mock.notify).toHaveBeenCalledTimes(1);
  });
  it("reuses already saved exact-close files on draft submission", async () => {
    mock.details = { purchaseAgreementPath: "close-requests/fund/close/signed.pdf", wireInstructionsPath: "close-requests/fund/close/wire.pdf" };
    expect(await create({ ...input({ ...details(), purchaseAgreement: null, wireInstructions: null }), data: { ...input({ ...details(), purchaseAgreement: null, wireInstructions: null }).data, id: "close" } })).toEqual({ id: "close", status: "submitted" });
    expect(mock.uploads).not.toHaveBeenCalled();
  });
  it("denies private attachment opening without live fund access", async () => {
    mock.allowed = false;
    await expect(open({ data: { id: "close", kind: "wire_instructions" }, context: { userId: "other" } })).rejects.toThrow("don't have access");
  });
  it("never opens a file belonging to another close", async () => {
    mock.details = { wireInstructionsPath: "close-requests/fund/another/wire.pdf" };
    await expect(open({ data: { id: "close", kind: "wire_instructions" }, context: { userId: "fictional-user" } })).rejects.toThrow("Attachment not found");
  });
});