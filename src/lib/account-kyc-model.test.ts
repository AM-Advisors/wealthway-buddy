import { describe, expect, it } from "vitest";
import { gateOpen, resolveGate } from "./account-kyc-model";

describe("account identity gate", () => {
  it("exempts staff", () => expect(resolveGate({ roles: ["compliance"], grandfathered: false, latest: null })).toBe("exempt"));
  it("counts an approved fund KYC", () => expect(resolveGate({ roles: ["fund_manager"], grandfathered: true, latest: null })).toBe("approved"));
  it("blocks while in review", () => { const s = resolveGate({ roles: ["investor"], grandfathered: false, latest: "review" }); expect(s).toBe("review"); expect(gateOpen(s)).toBe(false); });
  it("lets declined and expired retry", () => { expect(resolveGate({ roles: [], grandfathered: false, latest: "declined" })).toBe("retry"); expect(resolveGate({ roles: [], grandfathered: false, latest: "expired" })).toBe("retry"); });
  it("starts new accounts", () => expect(resolveGate({ roles: ["client_gp"], grandfathered: false, latest: null })).toBe("start"));
});

import { accountStatusFromProvider, isAccountDecisionEvent, isSessionDecisionFor } from "./account-kyc-model";
describe("provider notices never reverse a verification result", () => {
  it("ignores profile 'user.data.updated' notices", () => {
    expect(isAccountDecisionEvent("user.data.updated", null)).toBe(false);
    expect(isAccountDecisionEvent("business.data.updated", null)).toBe(false);
    expect(isAccountDecisionEvent("status.updated", "s-1")).toBe(true);
  });
  it("only accepts a result for the check's own session", () => {
    expect(isSessionDecisionFor({ session_id: "s-1" }, { status: "ACTIVE" })).toBe(false);
    expect(isSessionDecisionFor({ session_id: "s-1" }, { status: "Approved", session_id: "s-2" })).toBe(false);
    expect(isSessionDecisionFor({ session_id: "s-1" }, { status: "Approved", session_id: "s-1" })).toBe(true);
  });
  it("an expired session lets the person start again", () => {
    expect(accountStatusFromProvider("Expired", "review")).toBe("expired");
    expect(accountStatusFromProvider("Approved", "approved")).toBe("approved");
  });
});

import { limitedAccessWhileInReview } from "./account-kyc-model";
describe("limited access during an open review", () => {
  const pass = { idDocument: { status: "pass" }, liveness: { status: "pass" }, faceMatch: { status: "pass" } };
  it("allows it when ID, liveness and face match all passed", () => expect(limitedAccessWhileInReview({ status: "review", review_details: pass })).toBe(true));
  it("refuses when the ID itself failed or is unread", () => {
    expect(limitedAccessWhileInReview({ status: "review", review_details: { ...pass, idDocument: { status: "fail" } } })).toBe(false);
    expect(limitedAccessWhileInReview({ status: "review", review_details: null })).toBe(false);
  });
  it("refuses once a person has decided, or for declined checks", () => {
    expect(limitedAccessWhileInReview({ status: "review", decided_by: "u", review_details: pass })).toBe(false);
    expect(limitedAccessWhileInReview({ status: "declined", review_details: pass })).toBe(false);
  });
});

import { expiredKind, personProviderCheckOpensAccount } from "./account-kyc-model";
describe("expired checks say what actually expired", () => {
  const now = new Date("2026-11-24T00:00:00Z");
  it("a past ID expiration date means the ID itself expired", () => {
    expect(expiredKind({ status: "expired", decision_summary: { document: { expires: "2026-01-01" } } }, now)).toBe("id");
  });
  it("a timed-out link with no ID submitted is a session expiry, not an expired ID", () => {
    expect(expiredKind({ status: "expired", decision_summary: null }, now)).toBe("session");
    expect(expiredKind({ status: "expired", decision_summary: { document: { expires: null } } }, now)).toBe("session");
  });
  it("a submitted ID that is still current is a session expiry", () => {
    expect(expiredKind({ status: "expired", decision_summary: { document: { expires: "2030-05-01" } } }, now)).toBe("session");
  });
  it("non-expired checks have no kind", () => {
    expect(expiredKind({ status: "declined" }, now)).toBeNull();
    expect(expiredKind(null, now)).toBeNull();
  });
});

describe("verification already attached to the person by staff", () => {
  const ok = { kyc_status: "approved", aml_status: "approved" };
  const link = { mode: "link", status: "approved", id_status: "Approved", session_id: "s1" };
  it("opens the person's own login after a completed provider check", () => expect(personProviderCheckOpensAccount(ok, [link])).toBe(true));
  it("counts an automatically applied completed check", () => expect(personProviderCheckOpensAccount(ok, [{ ...link, status: "completed", id_status: "approved" }])).toBe(true));
  it("never counts a recorded prior result", () => expect(personProviderCheckOpensAccount(ok, [{ mode: "prior", status: "recorded", id_status: null, session_id: null }])).toBe(false));
  it("never counts a document-only check", () => expect(personProviderCheckOpensAccount(ok, [{ ...link, mode: "document" }])).toBe(false));
  it("never counts a link that was only sent", () => expect(personProviderCheckOpensAccount(ok, [{ ...link, status: "sent", id_status: null }])).toBe(false));
  it("stays closed while screening needs review", () => expect(personProviderCheckOpensAccount({ kyc_status: "approved", aml_status: "review" }, [link])).toBe(false));
});
