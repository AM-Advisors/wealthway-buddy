import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
vi.mock("@/lib/fund-setup.server", () => ({ setupActor: vi.fn(), forbid: vi.fn() }));
import { decisionRefusal, managerApprovedSigned } from "@/lib/investor-document-review.server";
import { sideLetterRequired } from "@/lib/investor-onboarding-model";
import { fillSubscriptionDocx } from "@/lib/subscription-docx";

function approvals(rows: any[]) {
  const data: Record<string, unknown> = { offering_documents: { active_version: 2 }, investor_document_approvals: rows };
  return { from(t: string) { const r = { data: data[t], error: null }; const c: any = { select: () => c, eq: () => c, maybeSingle: async () => r, order: async () => r }; return c; } };
}

describe("investor signs first, manager decides after", () => {
  it("refuses a manager decision before the investor has signed", () => {
    expect(decisionRefusal({ investorSigned: false, decision: "approved", note: null })).toMatch(/hasn't finished signing/);
  });
  it("requires a reason to decline", () => {
    expect(decisionRefusal({ investorSigned: true, decision: "returned", note: null })).toMatch(/reason/);
    expect(decisionRefusal({ investorSigned: true, decision: "returned", note: "Wrong entity" })).toBeNull();
  });
  it("opens countersigning only after an approval made after the investor signed", async () => {
    const row = { onboarding_id: "calvin", offering_document_id: "sub", version: 2, decision: "approved", decided_at: "2026-10-21T10:00:00Z" };
    expect(await managerApprovedSigned(approvals([row]), "calvin", "sub", "2026-10-21T09:00:00Z")).toBe(true);
    expect(await managerApprovedSigned(approvals([row]), "calvin", "sub", "2026-10-21T11:00:00Z")).toBe(false);
    expect(await managerApprovedSigned(approvals([]), "calvin", "sub", "2026-10-21T09:00:00Z")).toBe(false);
    expect(await managerApprovedSigned(approvals([{ ...row, decision: "returned" }]), "calvin", "sub", "2026-10-21T09:00:00Z")).toBe(false);
  });
});

describe("side letter", () => {
  it("is required only when the commitment is below the fund minimum", () => {
    expect(sideLetterRequired(25_000_00, 500_000_00)).toBe(true);
    expect(sideLetterRequired(500_000_00, 500_000_00)).toBe(false);
    expect(sideLetterRequired(25_000_00, null)).toBe(false);
  });
});

describe("investor title line", () => {
  const doc = `<w:document><w:p><w:r><w:t>Subscription Amount:</w:t></w:r></w:p><w:p><w:r><w:t>Signature:</w:t></w:r></w:p><w:p><w:r><w:t>Signatory's Title:</w:t></w:r></w:p><w:p><w:r><w:t>ACCEPTANCE OF</w:t></w:r></w:p><w:p><w:r><w:t>Signatory's Title:</w:t></w:r></w:p></w:document>`;
  const run = async (values: Record<string, string | null>) => {
    const zip = new JSZip(); zip.file("word/document.xml", doc);
    const r = await fillSubscriptionDocx(await zip.generateAsync({ type: "uint8array" }), values);
    return (await (await JSZip.loadAsync(r.bytes)).file("word/document.xml")!.async("string")).match(/Signatory's Title:/g)?.length ?? 0;
  };
  it("is removed for individuals but kept on the fund's acceptance block", async () => {
    expect(await run({})).toBe(1);
  });
  it("stays for a business subscriber", async () => {
    expect(await run({ __investor_is_entity: "1" })).toBe(2);
  });
});
