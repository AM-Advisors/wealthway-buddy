import { describe, expect, it } from "vitest";
import { matchesQueueSearch, queueInvestorLabel } from "./review-queue-label";

describe("queueInvestorLabel", () => {
  it("names an individual added before sign-in from the person record", () => {
    const l = queueInvestorLabel({
      person: { legal_first_name: "Marius", legal_last_name: "Smyth", email: "marius@example.com" },
      profile: { profile_type: "individual", display_label: "Marius Smyth" },
      account: null,
    });
    expect(l.investorName).toBe("Marius Smyth");
    expect(l.contactName).toBeNull();
    expect(l.investorEmail).toBe("marius@example.com");
  });

  it("shows the entity first with the person as contact", () => {
    const l = queueInvestorLabel({
      person: { legal_first_name: "Karl", legal_last_name: "Buckman" },
      profile: { profile_type: "trust", legal_name: "The Buckman Family Trust" },
    });
    expect(l.investorName).toBe("The Buckman Family Trust");
    expect(l.contactName).toBe("Karl Buckman");
  });

  it("falls back to the account name, then email, then Investor", () => {
    expect(queueInvestorLabel({ account: { legal_name: "Ann Lee", email: "a@x.com" } }).investorName).toBe("Ann Lee");
    expect(queueInvestorLabel({ person: { email: " b@x.com " } }).investorName).toBe("b@x.com");
    expect(queueInvestorLabel({}).investorName).toBe("Investor");
  });
});

describe("matchesQueueSearch", () => {
  const item = {
    investorName: "The Buckman Family Trust",
    contactName: "Karl Buckman",
    investorEmail: "karl@example.com",
    offeringName: "Star Castle Ventures VC - Blacklake",
    bucket: "needs_review",
  };
  it("matches name, contact, email, fund and status words", () => {
    expect(matchesQueueSearch(item, "buckman")).toBe(true);
    expect(matchesQueueSearch(item, "karl blacklake")).toBe(true);
    expect(matchesQueueSearch(item, "karl@example")).toBe(true);
    expect(matchesQueueSearch(item, "needs review")).toBe(true);
    expect(matchesQueueSearch(item, "")).toBe(true);
  });
  it("rejects when any word is missing", () => {
    expect(matchesQueueSearch(item, "karl erebor")).toBe(false);
  });
});
