import { describe, expect, it, vi } from "vitest";
import { prepareThenOpen, taxIntakeDefaults, taxReviewDetails, taxPreviewMatches } from "./investor-step-prefill";

describe("earlier steps supply later investor details", () => {
  it("requires review again after any tax form detail changes", () => {
    expect(taxPreviewMatches(null, "current")).toBe(false);
    expect(taxPreviewMatches("reviewed-name", "changed-name")).toBe(false);
    expect(taxPreviewMatches("current", "current")).toBe(true);
  });
  it("reuses the investing individual's earlier address and birthday", () => {
    expect(taxReviewDetails({ address_line1: "10 Fictional St", city: "Denver", date_of_birth: "1990-01-02" }, { profile_type: "individual", legal_name: "Fictional Investor" })).toMatchObject({ legalName: "Fictional Investor", addressLine: "10 Fictional St", cityStateZip: "Denver", dateOfBirth: "1990-01-02" });
  });
  it("uses entity details rather than the login person's home or birthday", () => {
    expect(taxReviewDetails({ address_line1: "Signer home", residence_country: "US", date_of_birth: "1990-01-02" }, { profile_type: "trust", legal_name: "Fictional Trust", address_line1: "Trust office", country: "CA" })).toMatchObject({ legalName: "Fictional Trust", addressLine: "Trust office", country: "CA", dateOfBirth: null });
  });
  it("uses questionnaire details when earlier party facts are missing", () => {
    expect(taxReviewDetails(null, { profile_type: "llc" }, { name_of_subscriber: "Fictional LLC", subscriber_s_address_of_residence: "20 Example St" })).toMatchObject({ legalName: "Fictional LLC", addressLine: "20 Example St" });
  });
  it("does not carry tax IDs or signatures into review defaults", () => {
    const details = taxReviewDetails({ tax_id: "123456789" }, { profile_type: "individual" }, { signature: "Signed", tin: "123456789" });
    expect(details).not.toHaveProperty("tin");
    expect(details).not.toHaveProperty("signerName");
  });
  it("reuses determined W9 routing without overriding a saved tax answer", () => {
    expect(taxIntakeDefaults(null, "w9")).toEqual({ usPerson: "yes" });
    expect(taxIntakeDefaults({ usPerson: "unsure" }, "w9")).toEqual({ usPerson: "unsure" });
  });
  it("never invents foreign tax elections", () => {
    expect(taxIntakeDefaults(null, "w8ben")).toEqual({});
  });
  it("finishes preparing before opening signing", async () => {
    const events: string[] = [];
    await prepareThenOpen(false, async () => { events.push("prepared"); }, () => { events.push("opened"); });
    expect(events).toEqual(["prepared", "opened"]);
  });
  it("stays on the current step when preparation fails", async () => {
    const open = vi.fn();
    await expect(prepareThenOpen(false, async () => { throw new Error("Missing details"); }, open)).rejects.toThrow("Missing details");
    expect(open).not.toHaveBeenCalled();
  });
  it("reuses an existing prepared version", async () => {
    const prepare = vi.fn();
    const open = vi.fn();
    await prepareThenOpen(true, prepare, open);
    expect(prepare).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledOnce();
  });
});