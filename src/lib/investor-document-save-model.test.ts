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
