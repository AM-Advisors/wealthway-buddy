import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  canCountersign, freshAuthAge, fundStepState, isFreshAuth, managerFundingLabel, signingConfigComplete, signingStage,
} from "./fund-onboarding-model";

const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("dual signature sequencing", () => {
  const inv = (status: string) => ({ role: "investor" as const, order: 1, status });
  const fm = (status: string) => ({ role: "fund_manager" as const, order: 2, status });
  it("investor-only signed + completed is fully executed", () => {
    expect(signingStage({ mode: "investor_only", providerStatus: "completed", signers: [inv("signed")] })).toBe("fully_executed");
  });
  it("investor signing alone never fully executes a dual document", () => {
    expect(signingStage({ mode: "dual", providerStatus: "out_for_signature", signers: [inv("signed"), fm("sent")] })).toBe("awaiting_fund_manager");
    expect(signingStage({ mode: "dual", providerStatus: "completed", signers: [inv("signed"), fm("sent")] })).not.toBe("fully_executed");
  });
  it("manager signing first does not satisfy investor-first", () => {
    const stage = signingStage({ mode: "dual", providerStatus: "out_for_signature", signers: [inv("sent"), fm("signed")] });
    expect(stage).toBe("sent_to_investor");
    expect(canCountersign({ mode: "dual", stage, hasFundAuthority: true }).allowed).toBe(false);
  });
  it("cancelled, replaced, expired and declined are never executed", () => {
    for (const p of ["cancelled", "replaced", "expired", "declined"]) {
      expect(signingStage({ mode: "dual", providerStatus: p, signers: [inv("signed"), fm("signed")] })).not.toBe("fully_executed");
    }
  });
  it("replayed provider state is idempotent", () => {
    const a = { mode: "dual" as const, providerStatus: "completed", signers: [inv("signed"), fm("signed")] };
    expect(signingStage(a)).toBe(signingStage(a));
    expect(signingStage(a)).toBe("fully_executed");
  });
  it("countersign requires fund authority, not a role label", () => {
    expect(canCountersign({ mode: "dual", stage: "awaiting_fund_manager", hasFundAuthority: false }).allowed).toBe(false);
    expect(canCountersign({ mode: "dual", stage: "awaiting_fund_manager", hasFundAuthority: true }).allowed).toBe(true);
  });
  it("preparation must be complete before sending", () => {
    expect(signingConfigComplete({ mode: "dual", countersignerUserId: null, blocks: [{ signer_role: "investor", block_type: "signature" }] }).ready).toBe(false);
    expect(signingConfigComplete({ mode: "dual", countersignerUserId: "u", blocks: [{ signer_role: "investor", block_type: "signature" }, { signer_role: "fund_manager", block_type: "signature" }] }).ready).toBe(true);
  });
});

describe("funding is authoritative", () => {
  it("investor 'sent' never produces Funded", () => {
    expect(managerFundingLabel({ approvedToFund: true, instructionsReleased: true, fundingStatus: "investor_reports_sent", investorReportsSent: true })).toBe("Investor says sent");
    expect(fundStepState({ onboardingComplete: true, fundingUnlocked: true, fundingStatus: "investor_reports_sent", investorReportsSent: true })).toBe("investor_sent");
  });
  it("only funding_status=funded is Funded", () => {
    expect(managerFundingLabel({ approvedToFund: true, instructionsReleased: true, fundingStatus: "funded", investorReportsSent: false })).toBe("Funded");
  });
  it("there is no manager path that writes funded", () => {
    const fns = src("./fund-onboarding.functions.ts");
    expect(fns).not.toMatch(/funding_status/);
    expect(src("./investor-onboarding.server.ts")).toMatch(/investorReportsFundsSent[\s\S]*?investor_reports_sent/);
  });
});

describe("wire reveal needs fresh authentication", () => {
  const now = 1_800_000_000;
  it("stale sign-in cannot reveal", () => {
    expect(isFreshAuth({ amr: [{ method: "password", timestamp: now - 3600 }] }, now)).toBe(false);
    expect(isFreshAuth({}, now)).toBe(false);
  });
  it("recent sign-in can reveal", () => {
    expect(isFreshAuth({ amr: [{ method: "otp", timestamp: now - 30 }] }, now)).toBe(true);
    expect(freshAuthAge({ amr: [{ timestamp: now - 5 }] }, now)).toBe(5);
  });
  it("reveal is bound to the investor's own investment and audited, not URL params", () => {
    const s = src("./investor-onboarding.server.ts");
    const body = s.slice(s.indexOf("export async function revealWireInstructions"));
    expect(body).toMatch(/assertInvestorOwns\(userId, onboardingId\)/);
    expect(body).toMatch(/isFreshAuth\(claims/);
    expect(body).toMatch(/wire_instructions_revealed/);
    expect(body).toMatch(/instruction_version/);
    // Only the released, current banking record is ever used.
    expect(s).toMatch(/investor_instructions_released/);
  });
});

describe("cross-fund authority", () => {
  const fns = src("./fund-onboarding.functions.ts");
  it("settings and signing config require an assignment to that exact fund", () => {
    expect(fns).toMatch(/\.eq\("offering_id", offeringId\)/);
    expect((fns.match(/fundAuthority\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
  it("countersigner must be currently assigned to the fund", () => {
    expect(fns).toMatch(/not currently assigned to this fund/);
    expect(fns).toMatch(/no longer assigned to this fund/);
    expect(fns).toMatch(/signer_user_id !== context\.userId/);
  });
  it("Box dual requests verify the countersigner's fund relationship", () => {
    expect(src("./box-sign.functions.ts")).toMatch(/fund_managers"\)\.select\("id"\)\.eq\("offering_id", doc\.offering_id\)/);
  });
});

import { missingRelatedRoles } from "@/lib/identity-model";
import { determineOnboardingRequirements } from "@/lib/investor-onboarding-model";
import { readFileSync } from "node:fs";

describe("requirements engine — profile-specific roles", () => {
  const offering = { accreditationRequired: false, kycRequired: true, kybRequired: true, amlRequired: true, taxDocumentRequired: false, subscriptionQuestionnaireRequired: false } as any;
  const run = (profileType: string, relatedPeople: any[]) =>
    determineOnboardingRequirements({ offering, person: { personId: "p", kycStatus: "verified", amlStatus: "clear" }, profile: { profileId: "x", profileType, kybStatus: "verified", entityAmlStatus: "clear", relatedPeople }, subscription: {}, nowIso: new Date().toISOString() })
      .find((r) => r.key === "beneficial_owners")!;
  it("trust needs a trustee, not beneficial owners", () => {
    expect(missingRelatedRoles("trust", ["beneficial_owner"]).length).toBeGreaterThan(0);
    expect(missingRelatedRoles("trust", ["trustee"])).toEqual([]);
    expect(run("trust", [{ role: "beneficial_owner", kycStatus: "verified" }]).state).toBe("missing");
    expect(run("trust", [{ role: "trustee", kycStatus: "verified" }]).state).toBe("valid");
  });
  it("LLC needs owner, control person and signer", () => {
    expect(run("llc", [{ role: "beneficial_owner", kycStatus: "verified" }]).state).toBe("missing");
    expect(run("llc", [{ role: "owner", kycStatus: "verified" }, { role: "manager", kycStatus: "verified" }]).state).toBe("valid");
  });
  it("unverified related people block", () => {
    expect(run("trust", [{ role: "trustee", kycStatus: "pending" }]).state).toBe("missing");
  });
  it("joint profile requires a verified joint owner", () => {
    expect(run("joint", []).state).toBe("missing");
    expect(run("joint", [{ role: "joint_owner", kycStatus: "verified" }]).state).toBe("valid");
  });
  it("individual has no related-person requirement", () => {
    expect(run("individual", []).state).toBe("not_applicable");
  });
  it("Box send path enforces preparation server-side", () => {
    const src = readFileSync("src/lib/box-sign.functions.ts", "utf8");
    expect(src).toMatch(/signingConfigComplete\(/);
    expect(src).toMatch(/isn't prepared for signature yet/);
  });
});
