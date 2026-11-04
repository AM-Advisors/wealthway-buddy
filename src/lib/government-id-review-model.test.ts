import { describe, expect, it } from "vitest";
import { projectGovernmentIdReview, type GovernmentIdReviewItem } from "./government-id-review-model";

const login: GovernmentIdReviewItem = {
  applicationId: "login:check-1", reviewStatus: "approved", providerStatus: "approved",
  documentType: "drivers_license", issuingCountry: "USA", expiration: "2030-01-01",
  last4: "1234", providedByVerification: true,
};
const fund: GovernmentIdReviewItem = {
  applicationId: "application-1", reviewStatus: "approved", providerStatus: "not_started",
  documentType: null, issuingCountry: null, expiration: null, last4: null, providedByVerification: false,
};

describe("government ID review display", () => {
  it("shows approved login evidence for a canonically approved fund instead of its unused check", () => {
    const result = projectGovernmentIdReview([login, fund]);
    expect(result[1]).toMatchObject({ usesLogin: true, providerStatus: "approved", documentType: "drivers_license", issuingCountry: "USA", expiration: "2030-01-01", last4: "1234", providedByVerification: true, originalProviderStatus: "not_started" });
    expect(fund.providerStatus).toBe("not_started");
    expect(fund.documentType).toBeNull();
  });
  it.each(["review", "declined", "not_started"])("does not replace a fund's %s result with login approval", (status) => {
    expect(projectGovernmentIdReview([login, { ...fund, reviewStatus: status }])[1]).toMatchObject({ usesLogin: false, providerStatus: "not_started", reviewStatus: status });
  });
  it.each(["review", "declined", "not_started"])("does not reuse a %s login result", (status) => {
    expect(projectGovernmentIdReview([{ ...login, reviewStatus: status }, fund])[1]?.usesLogin).toBe(false);
  });
  it("retains investment evidence and does not invent missing login metadata", () => {
    const files = [{ id: "original-file" }];
    const result = projectGovernmentIdReview([{ ...login, last4: null }, { ...fund, files }]);
    expect(result[1]?.last4).toBeNull();
    expect(result[1]).toMatchObject({ files });
  });
  it("preserves investment-only evidence when no login check exists", () => {
    expect(projectGovernmentIdReview([fund])[0]).toMatchObject({ ...fund, usesLogin: false });
  });
});