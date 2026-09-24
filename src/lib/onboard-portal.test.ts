import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type { RequirementResult } from "@/lib/investor-onboarding-model";
import { canonicalRedirect, surfaceForPath } from "@/lib/host-routing";
import { invitationUsableError } from "@/lib/investor-onboarding-model";
import { invitationRecipientError } from "@/lib/investor-journey-model";
import {
  managerPortalStatus,
  onboardInvitationUrl,
  portalComplete,
  portalResumeStep,
  portalSteps,
  safeOnboardReturnPath,
} from "@/lib/onboard-portal-model";

const r = (key: RequirementResult["key"], state: RequirementResult["state"]): RequirementResult => ({ key, label: key, state });

const base = (over: Partial<Record<RequirementResult["key"], RequirementResult["state"]>> = {}) =>
  (
    [
      ["investment_profile", "valid"],
      ["beneficial_owners", "not_applicable"],
      ["identity_verification", "missing"],
      ["entity_verification", "not_applicable"],
      ["aml", "missing"],
      ["accreditation", "missing"],
      ["subscription_questionnaire", "not_applicable"],
      ["subscription_documents", "missing"],
      ["signature", "missing"],
      ["funding", "missing"],
    ] as const
  ).map(([k, s]) => r(k, (over as any)[k] ?? s));

const src = (p: string) => readFileSync(p, "utf8");

describe("portal steps derive from authoritative requirements", () => {
  it("new investor starts at verification", () => {
    expect(portalResumeStep(portalSteps(base({ investment_profile: "missing" })))).toBe("verification");
  });
  it("KYC complete + accreditation incomplete resumes at accreditation", () => {
    expect(portalResumeStep(portalSteps(base({ identity_verification: "valid", aml: "valid" })))).toBe("accreditation");
  });
  it("KYC + accreditation complete resumes at documents", () => {
    const s = portalSteps(base({ identity_verification: "valid", aml: "valid", accreditation: "valid" }));
    expect(portalResumeStep(s)).toBe("documents");
  });
  it("506(b) with no accreditation action skips the step", () => {
    const s = portalSteps(base({ identity_verification: "valid", aml: "valid", accreditation: "not_applicable" }));
    expect(s[1]!.state).toBe("not_applicable");
    expect(portalResumeStep(s)).toBe("documents");
  });
  it("only a provider-confirmed signature completes documents; funding is ignored", () => {
    const signed = base({ identity_verification: "valid", aml: "valid", accreditation: "valid", subscription_documents: "valid", signature: "valid" });
    expect(portalComplete(portalSteps(signed))).toBe(true);
    expect(portalResumeStep(portalSteps(signed))).toBe("completed");
    const pending = base({ identity_verification: "valid", aml: "valid", accreditation: "valid", subscription_documents: "valid", signature: "review_required" });
    expect(portalComplete(portalSteps(pending))).toBe(false);
  });
  it("entity KYB requirements keep verification open", () => {
    const s = portalSteps(base({ identity_verification: "valid", aml: "valid", entity_verification: "missing", beneficial_owners: "missing" }));
    expect(s[0]!.state).toBe("action_required");
  });
  it("documents stay locked until verification and accreditation are done or in review", () => {
    expect(portalSteps(base())[2]!.state).toBe("locked");
  });
});

describe("manager status is progress-only", () => {
  it("labels", () => {
    expect(managerPortalStatus({ invitedOnly: true, requirements: [] })).toBe("Invitation sent");
    expect(managerPortalStatus({ requirements: base() })).toBe("Verification");
    expect(managerPortalStatus({ requirements: base({ identity_verification: "valid", aml: "valid" }) })).toBe("Accreditation");
    expect(managerPortalStatus({ requirements: base({ identity_verification: "review_required", aml: "valid", accreditation: "review_required", subscription_documents: "valid", signature: "valid" }) })).toBe("Harmonious review");
    expect(managerPortalStatus({ requirements: base(), acceptedAt: "2026-01-01" })).toBe("Complete");
  });
});

describe("invitation links and identity binding", () => {
  it("URL carries only the opaque reference", () => {
    expect(onboardInvitationUrl("a".repeat(32))).toBe(`https://onboard.harmonious.co/onboard/${"a".repeat(32)}`);
    expect(() => onboardInvitationUrl("a@b.com")).toThrow();
    expect(() => onboardInvitationUrl("../x")).toThrow();
  });
  it("forwarded / wrong email is refused", () => {
    expect(invitationRecipientError("a@x.com", "b@x.com")).toMatch(/different email/);
    expect(invitationRecipientError("A@x.com", "a@x.com")).toBeNull();
  });
  it("expired and revoked invitations are unusable", () => {
    expect(invitationUsableError({ status: "pending", expires_at: "2020-01-01" }, "2026-01-01")).toMatch(/expired/);
    expect(invitationUsableError({ status: "revoked" }, "2026-01-01")).toMatch(/no longer/);
  });
  it("provider return paths are limited to a portal investment", () => {
    expect(safeOnboardReturnPath("/onboard/i/0b0e0f10-1111-4222-8333-444455556666")).not.toBeNull();
    expect(safeOnboardReturnPath("https://evil.example/onboard/i/x")).toBeNull();
    expect(safeOnboardReturnPath("/dashboard")).toBeNull();
  });
});

describe("server-side enforcement (source guards)", () => {
  const engine = src("src/lib/investor-onboarding.server.ts");
  it("claim requires verified email, matching recipient and blocks takeover", () => {
    const claim = engine.slice(engine.indexOf("export async function claimOnboardInvitation"));
    expect(claim).toMatch(/email_confirmed_at/);
    expect(claim).toMatch(/invitationRecipientError/);
    expect(claim).toMatch(/already been used/);
    expect(claim).toMatch(/invitationUsableError/);
  });
  it("portal detail is scoped to the investor who owns the investment", () => {
    const start = engine.indexOf("export async function onboardPortalDetail");
    // Only the detail function itself: wire instructions live behind the separate fresh-auth reveal.
    const detail = engine.slice(start, engine.indexOf("\n}\n", start));
    expect(detail.slice(0, 200)).toMatch(/assertInvestorOwns/);
    expect(detail).not.toMatch(/fundingInstructions|bank_/);
  });
  it("Box signing via the portal checks investment ownership", () => {
    const box = src("src/lib/box-sign.functions.ts");
    expect(box).toMatch(/investor_user_id !== userId/);
  });
  it("portal pages are noindex and never render workspace navigation", () => {
    for (const p of ["src/routes/onboard.$ref.tsx", "src/routes/onboard.i.$onboardingId.tsx"]) {
      expect(src(p)).toMatch(/noindex/);
      expect(src(p)).not.toMatch(/Sidebar/);
    }
    expect(src("src/components/onboard-portal.tsx")).not.toMatch(/Sidebar|fundingInstructionsFn/);
    expect(src("public/robots.txt")).toMatch(/Disallow: \/onboard\//);
  });
});

describe("domain behavior", () => {
  it("portal paths stay on onboard.harmonious.co", () => {
    expect(surfaceForPath("/onboard/abc")).toBe("shared");
    expect(canonicalRedirect({ url: "https://onboard.harmonious.co/onboard/i/abc" })).toBeNull();
    expect(surfaceForPath("/onboarding/kyc")).toBe("client");
  });
});
