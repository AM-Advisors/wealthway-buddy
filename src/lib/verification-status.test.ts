import { describe, expect, it } from "vitest";
import { canonicalVerificationStatus, effectiveCheckStatus, personStatusByUser, withCanonicalVerification } from "./verification-status";

describe("canonicalVerificationStatus", () => {
  it("treats every historical success word as approved", () => {
    for (const s of ["approved", "clear", "passed", "verified"]) expect(canonicalVerificationStatus(s)).toBe("approved");
  });
  it("treats rejected and hit as declined", () => {
    expect(canonicalVerificationStatus("rejected")).toBe("declined");
    expect(canonicalVerificationStatus("hit")).toBe("declined");
  });
  it("treats submitted as review and blank as pending", () => {
    expect(canonicalVerificationStatus("submitted")).toBe("review");
    expect(canonicalVerificationStatus(null)).toBe("pending");
  });
});

describe("effectiveCheckStatus", () => {
  it("person approval wins over a stale application 'not started'", () => {
    expect(effectiveCheckStatus("approved", "not_started")).toBe("approved");
  });
  it("falls back to the application when the person has no result", () => {
    expect(effectiveCheckStatus(null, "approved")).toBe("approved");
  });
  it("a person decline is not hidden by an old application approval", () => {
    expect(effectiveCheckStatus("declined", "approved")).toBe("declined");
  });
});

describe("withCanonicalVerification", () => {
  it("ignores merged-away duplicate persons", () => {
    const map = personStatusByUser([
      { user_id: "u1", kyc_status: "declined", aml_status: "declined", merged_into_person_id: "p2" },
    ]);
    const app = withCanonicalVerification({ user_id: "u1", kyc_status: "approved", aml_status: "approved" }, map);
    expect(app.kyc_status).toBe("approved");
  });
});

import { canonicalizeApplications } from "./verification-status";
describe("canonicalizeApplications", () => {
  const sb = (rows: any[]) => ({ from: () => ({ select: () => ({ in: async () => ({ data: rows }) }) }) });
  it("shows the person's review result over a stale approved application copy", async () => {
    const out = await canonicalizeApplications(sb([{ user_id: "u1", kyc_status: "review", aml_status: "approved" }]), [{ id: "a", user_id: "u1", kyc_status: "approved", aml_status: "approved" }]);
    expect(out[0]!.kyc_status).toBe("review");
  });
  it("uses the fallback account when rows lack one, and keeps the copy if the person read fails", async () => {
    const out = await canonicalizeApplications(sb([{ user_id: "me", kyc_status: "declined", aml_status: null }]), [{ id: "a", kyc_status: "approved" }], "me");
    expect(out[0]!.kyc_status).toBe("declined");
    const broken = { from: () => { throw new Error("no access"); } };
    const kept = await canonicalizeApplications(broken, [{ id: "a", user_id: "u1", kyc_status: "approved" }]);
    expect(kept[0]!.kyc_status).toBe("approved");
  });
});

import { verificationLabel } from "./verification-status";
describe("verificationLabel", () => {
  it("uses the staff wording and never shows raw stored values", () => {
    expect(verificationLabel("approved")).toBe("Approved");
    expect(verificationLabel("in_review")).toBe("Needs review");
    expect(verificationLabel("rejected")).toBe("Declined");
    expect(verificationLabel("not_started")).toBe("Not started");
    expect(verificationLabel(null)).toBe("Not started");
  });
});

import { verificationLabel as vlabel } from "./verification-status";
import { describe as d2, it as i2, expect as e2 } from "vitest";
d2("verification label detail wording", () => {
  i2("keeps in-progress checks distinct from not started", () => { e2(vlabel("in_progress")).toBe("In progress"); e2(vlabel("not_started")).toBe("Not started"); });
  i2("keeps information-needed checks distinct from needs review", () => { e2(vlabel("info_requested")).toBe("More information needed"); e2(vlabel("review")).toBe("Needs review"); });
});

import { withCanonicalVerification as wcv, personStatusByUser as psu } from "./verification-status";
d2("detail survives the person-record merge", () => {
  i2("person record in progress shows In progress, not Not started", () => {
    const r = wcv({ user_id: "u", kyc_status: "not_started", aml_status: "not_started" }, psu([{ user_id: "u", kyc_status: "in_progress", aml_status: null }]));
    e2(r.kyc_status).toBe("not_started");
    e2(vlabel(r.kyc_status, r.kyc_status_detail)).toBe("In progress");
  });
  i2("an approved person result never carries a stale detail", () => {
    const r = wcv({ user_id: "u", kyc_status: "info_requested", aml_status: null as string | null }, psu([{ user_id: "u", kyc_status: "approved", aml_status: null }]));
    e2(vlabel(r.kyc_status, r.kyc_status_detail)).toBe("Approved");
  });
});

import { identityScreeningSummary } from "./verification-status";
describe("identityScreeningSummary", () => {
  it("shows one combined approval when both are clear", () => {
    const s = identityScreeningSummary("approved", "clear");
    expect(s.ok).toBe(true);
    expect(s.label).toBe("Identity and screening approved");
  });
  it("keeps one-sided progress in plain words, never raw values", () => {
    expect(identityScreeningSummary("approved", "in_review").label).toBe("ID approved · screening under review");
    expect(identityScreeningSummary("not_started", "approved").label).toBe("Screening clear · ID check under review");
    expect(identityScreeningSummary("in_review", "pending").label).toBe("ID check and screening under review");
  });
  it("flags a decline or match without exposing screening detail", () => {
    expect(identityScreeningSummary("approved", "hit").label).toBe("Check needs review");
    expect(identityScreeningSummary("rejected", "approved").ok).toBe(false);
  });
  it("distinguishes in progress from not started", () => {
    expect(identityScreeningSummary("in_progress", null).label).toBe("In progress");
    expect(identityScreeningSummary("not_started", "not_started").label).toBe("Not started");
  });
});
