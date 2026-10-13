import { describe, expect, it } from "vitest";
import { authorizedProfiles, currentGrants, decideAccess, freshSecondFactor, matchDocument, type AccessFacts } from "./portal-documents";

const doc = { id: "d1", status: "published" as const, recipient_profile_id: "pA", offering_id: "f1" };
const grantA = { principal_type: "investment_profile" as const, principal_id: "pA", action: "grant" as const, created_at: "2026-01-01" };
const base: AccessFacts = { userId: "uA", aal2: true, doc, entitlements: [grantA], authorizedProfileIds: ["pA"], freezes: [], intent: "list" };

describe("decideAccess", () => {
  it("allows the verified recipient to list", () => expect(decideAccess(base)).toEqual({ allow: true, reason: "profile_entitlement" }));
  it("denies when signed out", () => expect(decideAccess({ ...base, userId: null }).reason).toBe("not_signed_in"));
  it("denies without two-step", () => expect(decideAccess({ ...base, aal2: false }).reason).toBe("mfa_required"));
  it("denies another investor even with a granted document", () =>
    expect(decideAccess({ ...base, userId: "uB", authorizedProfileIds: ["pB"] }).reason).toBe("no_entitlement"));
  it("denies a fund manager without explicit user entitlement", () =>
    expect(decideAccess({ ...base, userId: "mgr", authorizedProfileIds: [] }).reason).toBe("no_entitlement"));
  it("allows a manager with explicit user entitlement", () =>
    expect(decideAccess({ ...base, userId: "mgr", authorizedProfileIds: [], entitlements: [grantA, { ...grantA, principal_type: "user", principal_id: "mgr" }] }).allow).toBe(true));
  it("denies unpublished", () => expect(decideAccess({ ...base, doc: { ...doc, status: "quarantined" } }).reason).toBe("not_published"));
  it("revocation wins over earlier grant", () =>
    expect(decideAccess({ ...base, entitlements: [grantA, { ...grantA, action: "revoke", created_at: "2026-02-01" }] }).reason).toBe("no_entitlement"));
  it("requires step-up to download", () => {
    expect(decideAccess({ ...base, intent: "download" }).reason).toBe("step_up_required");
    expect(decideAccess({ ...base, intent: "download", stepUpVerified: true }).allow).toBe(true);
  });
  for (const scope of ["all", "offering", "investment_profile", "user", "document"] as const) {
    it(`emergency freeze (${scope}) blocks`, () => {
      const scope_id = { all: null, offering: "f1", investment_profile: "pA", user: "uA", document: "d1" }[scope];
      expect(decideAccess({ ...base, freezes: [{ scope, scope_id, lifted_at: null }] }).reason).toBe("frozen");
    });
  }
  it("lifted freeze no longer blocks", () => expect(decideAccess({ ...base, freezes: [{ scope: "all", scope_id: null, lifted_at: "x" }] }).allow).toBe(true));
  it("grants are per principal", () => expect([...currentGrants([grantA]).profiles]).toEqual(["pA"]));
});

describe("authorizedProfiles", () => {
  const profiles = [
    { id: "ind", profile_type: "individual", owner_user_id: null, person_id: "per1" },
    { id: "llc", profile_type: "llc", owner_user_id: null, person_id: "per1" },
    { id: "llc2", profile_type: "llc", owner_user_id: null, person_id: "x" },
    { id: "own", profile_type: "trust", owner_user_id: "u1", person_id: null },
  ];
  it("individual via person, entity only via owner or verified signer", () => {
    const rels = [
      { profile_id: "llc2", person_id: "per1", status: "active", verification_status: "verified", is_authorized_signer: true },
      { profile_id: "llc", person_id: "per1", status: "active", verification_status: "not_started", is_authorized_signer: false },
    ];
    expect(authorizedProfiles("u1", ["per1"], profiles, rels).sort()).toEqual(["ind", "llc2", "own"]);
  });
});

describe("freshSecondFactor", () => {
  const now = 1_800_000_000_000;
  it("needs aal2 and a recent second factor", () => {
    expect(freshSecondFactor({ aal: "aal2", amr: [{ method: "totp", timestamp: now / 1000 - 60 }] }, now)).toBe(true);
    expect(freshSecondFactor({ aal: "aal2", amr: [{ method: "totp", timestamp: now / 1000 - 600 }] }, now)).toBe(false);
    expect(freshSecondFactor({ aal: "aal2", amr: [{ method: "password", timestamp: now / 1000 }] }, now)).toBe(false);
    expect(freshSecondFactor({ aal: "aal1", amr: [{ method: "totp", timestamp: now / 1000 }] }, now)).toBe(false);
  });
});

describe("matchDocument", () => {
  const ctx = {
    mappings: [{ folder_id: "fund", offering_id: "f1" }, { folder_id: "a", offering_id: "f1", profile_id: "pA" }, { folder_id: "bad", offering_id: "f1", profile_id: "pZ" }],
    investorsByOffering: { f1: ["pA", "pB"] },
    profileNames: { pA: "Avery Testinvestor", pB: "Blake Test Holdings LLC" },
    knownChecksums: { dupsum: "doc-old" },
  };
  it("matches only via trusted mapping", () => expect(matchDocument({ id: "1", name: "K-1 2025 Avery.pdf", parent_folder_id: "a" }, ctx).status).toBe("matched"));
  it("filename alone is only a suggestion", () => {
    const r = matchDocument({ id: "2", name: "Avery Testinvestor K-1 2024.pdf", parent_folder_id: "fund" }, ctx);
    expect(r.status).toBe("quarantined");
    expect(r.candidateProfileId).toBe("pA");
  });
  it("quarantines conflicts, unknown years, unmapped folders, duplicates", () => {
    expect(matchDocument({ id: "3", name: "K-1 2025.pdf", parent_folder_id: "bad" }, ctx).reason).toBe("mapping_conflict");
    expect(matchDocument({ id: "4", name: "K-1.pdf", parent_folder_id: "a" }, ctx).reason).toBe("tax_year_unknown");
    expect(matchDocument({ id: "5", name: "K-1 2025.pdf", parent_folder_id: "elsewhere" }, ctx).reason).toBe("outside_mapped_folders");
    expect(matchDocument({ id: "6", name: "K-1 2025.pdf", parent_folder_id: "a", checksum: "dupsum" }, ctx).reason).toBe("duplicate_checksum");
  });
});
