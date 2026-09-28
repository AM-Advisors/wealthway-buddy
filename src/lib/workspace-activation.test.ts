import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const inv = readFileSync("src/lib/invitations.functions.ts", "utf8");
const slice = (name: string) => inv.slice(inv.indexOf(`export const ${name}`), inv.indexOf("export const", inv.indexOf(`export const ${name}`) + 10) >>> 0 || undefined);

describe("Operational workspace activation — server authorization", () => {
  it("search existing people: fund-scoped and Harmonious staff only; email masked", () => {
    const s = slice("searchExistingInvestors");
    expect(s).toMatch(/assertFundAllowed\(ctx, data\.fundId\)/);
    expect(s).toMatch(/if \(!ctx\.isAdmin\) throw/);
    expect(s).toMatch(/maskEmail\(p\.email\)/);
    expect(s).not.toMatch(/tax|tin|government|kyc/i);
  });
  it("add existing: exact fund, staff only, no duplicates, reuses grantFundAccess (audited)", () => {
    const s = slice("addExistingInvestorToFund");
    expect(s).toMatch(/assertFundAllowed\(ctx, data\.fundId\)/);
    expect(s).toMatch(/if \(!ctx\.isAdmin\) throw/);
    expect(s).toMatch(/already_added/);
    expect(s).toMatch(/offeringIds: \[data\.fundId\]/);
    expect(s).toMatch(/grantFundAccess\(/);
    expect(inv).toMatch(/logAccessChange\(/);
  });
  it("row-action lookup is fund-scoped", () => {
    expect(slice("getFundInvestorActions")).toMatch(/assertFundAllowed\(ctx, data\.fundId\)/);
  });
  it("assets: saves go through the existing scoped, staff-only, audited path", () => {
    const v = readFileSync("src/lib/valuation.server.ts", "utf8");
    const up = v.slice(v.indexOf("export async function upsertPortfolioAsset"), v.indexOf("export async function listPortfolioAssets"));
    expect(up).toMatch(/assertScopeAllows\(scope, input\.offeringId\)/);
    expect(up).toMatch(/Only Harmonious can add/);
    expect(up).toMatch(/asset_created/);
    const ui = readFileSync("src/components/fund-assets.tsx", "utf8");
    expect(ui).toMatch(/fundId, issuerName/);
    expect(ui).not.toMatch(/journal|postJournal/);
  });
  it("revoking fund access keeps the person (no account delete)", () => {
    const s = slice("removeFundAccess");
    expect(s).not.toMatch(/deleteUser|auth\.admin\.delete/);
  });
});
