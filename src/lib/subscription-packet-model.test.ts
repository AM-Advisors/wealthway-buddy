import { describe, expect, it } from "vitest";
import { packetChecklist, selectPacketDocuments } from "./subscription-packet-model";

const doc = (o: { title: string; docType: string; approvalStatus?: string }) => ({ versionId: o.title, category: o.docType, usage: "acknowledgment", approvalStatus: "approved", supersededAt: null, fileName: "f.pdf", ...o });

describe("subscription packet contents", () => {
  it("links checklist documents to exact included versions, even when titles repeat", () => {
    const first = { ...doc({ title: "Agreement", docType: "subscription_agreement" }), versionId: "version-1" };
    const second = { ...doc({ title: "Agreement", docType: "side_letter" }), versionId: "version-2" };
    expect(packetChecklist([first, second]).filter((r) => r.targetKey.startsWith("version-")).map((r) => r.targetKey)).toEqual(["version-1", "version-2"]);
    expect(packetChecklist([first, second]).some((r) => r.targetKey === "omitted-version")).toBe(false);
  });
  it("orders PPM, Operating Agreement, Subscription Agreement, side letters, then others", () => {
    const { included } = selectPacketDocuments([
      doc({ title: "Other", docType: "faq" }), doc({ title: "SL", docType: "side_letter" }),
      doc({ title: "SA", docType: "subscription_agreement" }), doc({ title: "OA", docType: "operating_agreement" }), doc({ title: "PPM", docType: "ppm" }),
    ], new Set());
    expect(included.map((d) => d.title)).toEqual(["PPM", "OA", "SA", "SL", "Other"]);
  });
  it("leaves out unapproved and sealed versions, and lists the unapproved as missing", () => {
    const r = selectPacketDocuments([doc({ title: "SA", docType: "subscription_agreement", approvalStatus: "uploaded_review_required" }), doc({ title: "PPM", docType: "ppm" })], new Set(["PPM"]));
    expect(r.included).toEqual([]);
    expect(r.missing).toEqual(["SA"]);
  });
  it("never includes identity, tax or bank documents", () => {
    expect(selectPacketDocuments([doc({ title: "Bank letter", docType: "bank_statement" }), doc({ title: "W-9", docType: "tax_w9" })], new Set()).included).toEqual([]);
  });
});
