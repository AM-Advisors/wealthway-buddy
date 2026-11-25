import { describe, it, expect } from "vitest";
import { outsideSubscriptionStates } from "./prior-signed-documents.server";

function fakeDb(docs: any[]) {
  const q = (data: any[]) => { const o: any = { select: () => o, in: () => o, eq: () => o, order: () => Promise.resolve({ data, error: null }), then: (r: any) => r({ data, error: null }) }; return o; };
  return { from: (t: string) => q(t === "prior_signed_documents" ? docs : []) };
}

describe("signed copy loaded by Harmonious", () => {
  it("completes the Sign step with no separate mark, using the copy's signed date", async () => {
    const s = (await outsideSubscriptionStates(fakeDb([{ id: "d1", onboarding_id: "ob1", uploaded_by_role: "harmonious", document_kind: "subscription_agreement", signed_on: "2025-11-14" }]), ["ob1"])).get("ob1")!;
    expect(s.complete).toBe(true);
    expect(s.signedOn).toBe("2025-11-14");
  });
  it("a fund-manager copy alone does not complete it", async () => {
    const s = (await outsideSubscriptionStates(fakeDb([{ id: "d2", onboarding_id: "ob2", uploaded_by_role: "fund_manager", document_kind: "subscription_agreement", signed_on: "2025-11-14" }]), ["ob2"])).get("ob2")!;
    expect(s.complete).toBe(false);
  });
});
