import { describe, expect, it } from "vitest";
import { newTabSigningUrl } from "./sign-window-url";
describe("newTabSigningUrl", () => {
  it("turns an embedded signing link into the full-page link", () => {
    expect(newTabSigningUrl("https://harmonious.app.box.com/embed/sign/document/abc/def/")).toBe("https://harmonious.app.box.com/sign/document/abc/def/");
  });
  it("refuses non-https or missing links", () => {
    expect(newTabSigningUrl("javascript:alert(1)")).toBeNull();
    expect(newTabSigningUrl(null)).toBeNull();
  });
});

import { fundSignerReturnUrl } from "@/lib/sign-window-url";

describe("fundSignerReturnUrl", () => {
  it("sends a fund countersigner to the fund's Documents page, never the investor's page", () => {
    const url = fundSignerReturnUrl("fa5ff8b9-e69e-40b9-b9dc-5c6f54d6c88f");
    expect(url).toBe("https://app.harmonious.co/manager/fund/fa5ff8b9-e69e-40b9-b9dc-5c6f54d6c88f/documents");
    expect(url).not.toContain("/onboard/");
  });
});

import { preparedSignerReturnUrl, signerDoneUrl } from "@/lib/sign-window-url";

describe("preparedSignerReturnUrl", () => {
  const fund = "fa5ff8b9-e69e-40b9-b9dc-5c6f54d6c88f";
  it("returns the GP and fund manager to the fund's Documents page", () => {
    expect(preparedSignerReturnUrl("general_partner", fund)).toBe(`https://app.harmonious.co/manager/fund/${fund}/documents`);
    expect(preparedSignerReturnUrl("fund_manager", fund)).toBe(`https://app.harmonious.co/manager/fund/${fund}/documents`);
  });
  it("returns the investor to their portal", () => {
    expect(preparedSignerReturnUrl("investor", fund)).toBe("https://app.harmonious.co/portal");
  });
  it("returns trustees, joint owners and other signers to the public thank-you page", () => {
    for (const role of ["trustee", "joint_owner", "authorized_signatory", "company_representative", "other"]) {
      expect(preparedSignerReturnUrl(role, fund)).toBe(signerDoneUrl());
    }
  });
});
