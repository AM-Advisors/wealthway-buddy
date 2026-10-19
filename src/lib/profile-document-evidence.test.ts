import { describe, expect, it, vi } from "vitest";
import { loadProfileDocumentEvidence } from "./profile-document-evidence.server";

function database(rows: any[]) {
  return { from: () => {
    let owner = "";
    let scope = "";
    const q = {
      select: () => q,
      eq: (_: string, value: string) => { owner = value; return q; },
      or: (value: string) => { scope = value; return q; },
      order: () => {
        const profile = scope.match(/investment_profile_id.eq.([^,]+)/)?.[1];
        const onboarding = scope.match(/onboarding_id.eq.([^)]*)/)?.[1];
        return Promise.resolve({ data: rows.filter((r) => r.user_id === owner && (r.investment_profile_id === profile || (r.investment_profile_id == null && r.onboarding_id === onboarding))), error: null });
      },
    };
    return q;
  } };
}
const records = [
  { id: "shared", user_id: "owner", investment_profile_id: "profile-a", onboarding_id: "first" },
  { id: "other-profile", user_id: "owner", investment_profile_id: "profile-b", onboarding_id: "second" },
  { id: "other-owner", user_id: "stranger", investment_profile_id: "profile-a", onboarding_id: "second" },
  { id: "legacy", user_id: "owner", investment_profile_id: null, onboarding_id: "first" },
];
describe("profile document evidence scope", () => {
  it("reuses a saved document for a second investment in the same profile", async () => {
    const rows = await loadProfileDocumentEvidence(database(records), { id: "second", investment_profile_id: "profile-a", investor_user_id: "owner" });
    expect(rows.map((r) => r.id)).toEqual(["shared"]);
  });
  it("does not reuse another profile or unbound legacy upload", async () => {
    const rows = await loadProfileDocumentEvidence(database(records), { id: "second", investment_profile_id: "profile-b", investor_user_id: "owner" });
    expect(rows.map((r) => r.id)).toEqual(["other-profile"]);
  });
  it("retains a legacy upload only in its original investment", async () => {
    const rows = await loadProfileDocumentEvidence(database(records), { id: "first", investment_profile_id: "profile-a", investor_user_id: "owner" });
    expect(rows.map((r) => r.id)).toEqual(["shared", "legacy"]);
  });
  it("does not infer a profile from the login account", async () => {
    const from = vi.fn();
    expect(await loadProfileDocumentEvidence({ from }, { investor_user_id: "owner" })).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });
});
describe("investors without an account", () => {
  it("returns only documents prepared for that profile", async () => {
    const rows = [{ id: "a", investment_profile_id: "p", prepared_for_person_id: "x" }, { id: "b", investment_profile_id: "other", prepared_for_person_id: "x" }];
    const chain: any = { select: () => chain, eq: () => chain, not: () => chain, order: async () => ({ data: rows, error: null }) };
    const out = await loadProfileDocumentEvidence({ from: () => chain }, { id: "o", investment_profile_id: "p", investor_user_id: null });
    expect(out.map((r: any) => r.id)).toEqual(["a"]);
  });
});
