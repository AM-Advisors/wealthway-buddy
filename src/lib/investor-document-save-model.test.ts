import { describe, expect, it } from "vitest";
import { guessSaveTarget, saveTarget } from "@/lib/investor-document-save-model";

describe("saving AI-read investor documents", () => {
  it("files a W-9 as the tax form, usable as the investor's tax form", () => {
    expect(guessSaveTarget("IRS Form W-9")).toBe("tax_form");
    expect(saveTarget("tax_form")?.use).toBe("tax_outside");
  });
  it("files an accreditation letter as accreditation proof", () => {
    expect(guessSaveTarget("CPA accreditation letter")).toBe("accreditation_proof");
  });
  it("files a subscription agreement as a signed copy, not an upload", () => {
    expect(guessSaveTarget("Subscription agreement")).toBe("subscription_agreement");
    expect(saveTarget("subscription_agreement")?.store).toBe("prior");
  });
  it("never offers a direct use for a government ID (identity keeps its own review)", () => {
    expect(saveTarget("identification")?.use).toBeNull();
  });
  it("leaves unknown documents for a person to pick", () => {
    expect(guessSaveTarget("Bank statement summary page")).toBeNull();
  });
});

import { duplicateOf, expiryWarnings, ownerMatch, taxFormFit } from "@/lib/investor-document-save-model";
describe("owner and quality checks", () => {
  const parties = [{ name: "J GIRARDI K GIRARDI REV TRUST", role: "investing_party" as const }, { name: "Kimberly Girardi", role: "person" as const }];
  it("matches the trust name even with suffixes", () => {
    expect(ownerMatch([{ name: "J. Girardi & K. Girardi Revocable Trust", role: "entity" }], parties).status).toBe("match");
  });
  it("matches the person behind the investment", () => {
    expect(ownerMatch([{ name: "Kimberly A Girardi", role: "person" }], parties).status).toBe("match");
  });
  it("flags a different name for confirmation", () => {
    expect(ownerMatch([{ name: "Marcus Williams", role: "person" }], parties).status).toBe("different");
  });
  it("warns on an expired ID and an accreditation letter over 90 days old", () => {
    expect(expiryWarnings({ target: "identification", documentDate: null, expiresOn: "2026-03-01", today: "2026-11-17" })).toHaveLength(1);
    expect(expiryWarnings({ target: "accreditation_proof", documentDate: "2026-07-01", expiresOn: null, today: "2026-11-17" })).toHaveLength(1);
    expect(expiryWarnings({ target: "accreditation_proof", documentDate: "2026-10-01", expiresOn: null, today: "2026-11-17" })).toHaveLength(0);
  });
  it("expects a W-8BEN, not a W-9, for a non-US individual", () => {
    expect(taxFormFit({ form: "W-9", profileType: "individual", country: "Germany" })).toMatch(/W-8BEN/);
    expect(taxFormFit({ form: "W-9", profileType: "individual", country: "US" })).toBeNull();
  });
  it("finds a file already saved with the same name and type", () => {
    expect(duplicateOf([{ fileName: "W9 signed.pdf", kind: "tax_form", savedAt: "2026-11-01" }], "W9_signed.pdf", "tax_form")).not.toBeNull();
  });
});
