import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const server = readFileSync("src/lib/investor-onboarding.server.ts", "utf8");
const tax = readFileSync("src/lib/onboarding-compliance.functions.ts", "utf8");

describe("documents prepare themselves after the investor's last step", () => {
  it("submitting the questionnaire prepares documents unless held for review", () => {
    expect(server).toMatch(/input\.submit && !flagged\.length \? await autoPrepareSubscriptionDocuments/);
  });
  it("signing the tax form prepares documents", () => {
    expect(tax).toMatch(/certifyTaxForm[\s\S]*autoPrepareSubscriptionDocuments/);
  });
  it("auto-prepare reuses the manual checks and never signs", () => {
    const body = server.slice(server.indexOf("export async function autoPrepareSubscriptionDocuments"), server.indexOf("export async function autoPrepareSubscriptionDocuments") + 600);
    expect(body).toContain("assertFeesAccepted");
    expect(body).toContain("prepareSubscriptionDocuments(userId, onboardingId)");
    expect(body).not.toMatch(/recordSubscriptionSignature/);
  });
});
