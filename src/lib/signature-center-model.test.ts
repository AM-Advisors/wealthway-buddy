import { describe, expect, it } from "vitest";
import { agreementKind, isViewersTurn, itemView, matchesFilters, type RawItem, type RawSigner } from "./signature-center-model";

const signer = (over: Partial<RawSigner>): RawSigner => ({ id: "s", name: "Pat", email: "pat@example.com", userId: "u-pat", role: "investor", order: 1, status: "sent", sentAt: null, signedAt: null, ...over });
const item = (over: Partial<RawItem>): RawItem => ({ id: "i", source: "fund_file", offeringId: "f", fundName: "Fund", title: "Side Letter", kindHint: null, investorName: "Pat", onboardingId: null, createdAt: "2026-11-01T00:00:00Z", executedAt: null, signers: [], ...over });
const now = new Date("2026-11-20T00:00:00Z");

describe("agreement grouping", () => {
  it("groups side letters, subscription and operating agreements", () => {
    expect(agreementKind("Side Letter: Kimberly", null)).toBe("side_letter");
    expect(agreementKind("Anything", "sl_combined")).toBe("side_letter");
    expect(agreementKind("Subscription Agreement", "subscription_agreement")).toBe("subscription");
    expect(agreementKind("Operating Agreement", null)).toBe("operating_agreement");
    expect(agreementKind("Limited Partnership Agreement", "lpa")).toBe("operating_agreement");
    expect(agreementKind("Investor Certification", "certification")).toBe("other");
  });
});

describe("whose turn it is", () => {
  it("Thomas signs first, then the investor: waiting on Thomas until he signs", () => {
    const v = itemView(item({ signers: [signer({ id: "m", name: "Thomas", userId: "u-tom", role: "fund_signatory", order: 1, status: "sent", sentAt: "2026-11-19T00:00:00Z" }), signer({ id: "inv", order: 2, status: "waiting" })] }), now);
    expect(v.status).toBe("waiting");
    expect(v.waitingOn?.id).toBe("m");
    expect(v.label).toBe("Waiting on Thomas (fund signatory)");
    expect(isViewersTurn(v, { userId: "u-tom" })).toBe(true);
    expect(isViewersTurn(v, { userId: "u-pat" })).toBe(false);
  });
  it("moves to the investor once the fund signatory has signed", () => {
    const v = itemView(item({ signers: [signer({ id: "m", role: "fund_signatory", order: 1, status: "signed", signedAt: "2026-11-18T00:00:00Z" }), signer({ id: "inv", order: 2, status: "waiting" })] }), now);
    expect(v.waitingOn?.id).toBe("inv");
    expect(v.waitingDays).toBe(2);
    expect(isViewersTurn(v, { userId: "someone-else", email: "PAT@example.com" })).toBe(true);
  });
  it("is signed only when every active signer has signed; cancelled rows are ignored", () => {
    const v = itemView(item({ signers: [signer({ status: "signed" }), signer({ id: "old", order: 2, status: "cancelled" })] }), now);
    expect(v.status).toBe("signed");
    expect(v.label).toBe("Signed by everyone");
  });
  it("a declined signer is shown as a problem, never as signed", () => {
    const v = itemView(item({ signers: [signer({ status: "declined" })] }), now);
    expect(v.status).toBe("problem");
    expect(v.stuck).toBe(true);
  });
});

describe("stuck items for Harmonious", () => {
  it("is stuck after 7 days waiting on the same person", () => {
    expect(itemView(item({ signers: [signer({ sentAt: "2026-11-13T00:00:00Z" })] }), now).stuck).toBe(true);
    expect(itemView(item({ signers: [signer({ sentAt: "2026-11-14T00:00:00Z" })] }), now).stuck).toBe(false);
  });
  it("a subscription not opened yet waits on the investor", () => {
    const v = itemView(item({ source: "subscription_not_started", signers: [signer({ status: "waiting" })] }), now);
    expect(v.label).toBe("Waiting on Pat (investor)");
    expect(v.waitingDays).toBe(19);
  });
});

describe("filters", () => {
  const row = { view: itemView(item({ signers: [signer({ sentAt: "2026-11-01T00:00:00Z" })] }), now), kind: "side_letter" as const, title: "Side Letter", fundName: "Corps Erebor", investorName: "Kimberly Trust", signers: [signer({})] };
  it("finds by fund, investor or signer", () => {
    expect(matchesFilters(row, { status: "all", kind: "all", search: "erebor" })).toBe(true);
    expect(matchesFilters(row, { status: "all", kind: "all", search: "kimberly" })).toBe(true);
    expect(matchesFilters(row, { status: "all", kind: "all", search: "pat@example" })).toBe(true);
    expect(matchesFilters(row, { status: "all", kind: "all", search: "upper90" })).toBe(false);
  });
  it("filters by type and status", () => {
    expect(matchesFilters(row, { status: "stuck", kind: "side_letter", search: "" })).toBe(true);
    expect(matchesFilters(row, { status: "signed", kind: "all", search: "" })).toBe(false);
    expect(matchesFilters(row, { status: "all", kind: "subscription", search: "" })).toBe(false);
  });
});

describe("signing window never loaded", () => {
  const now = new Date("2026-11-23T20:00:00Z");
  const item = (signer: Record<string, unknown>) => ({
    id: "ds:1", source: "subscription" as const, offeringId: "f", fundName: "Fund", title: "Subscription Agreement", kindHint: "subscription",
    investorName: "Chris", onboardingId: "o", createdAt: "2026-11-23T19:17:00Z", executedAt: null,
    signers: [{ id: "s", name: "Chris", email: null, userId: "u", role: "investor" as const, order: 1, status: "sent", sentAt: "2026-11-23T19:17:00Z", signedAt: null, ...signer }],
  });
  it("marks the item stuck the same day when the window never loaded", () => {
    const v = itemView(item({ windowOpenedAt: "2026-11-23T19:17:00Z", viewedAt: null }), now);
    expect(v.stuck).toBe(true);
    expect(v.neverLoaded).toBe(true);
    expect(v.status).toBe("waiting");
  });
  it("does not mark it stuck once the document loaded", () => {
    const v = itemView(item({ status: "viewed", windowOpenedAt: "2026-11-23T19:17:00Z", viewedAt: "2026-11-23T19:17:30Z" }), now);
    expect(v.stuck).toBe(false);
    expect(v.neverLoaded).toBe(false);
  });
});
