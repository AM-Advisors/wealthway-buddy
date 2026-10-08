import { describe, expect, it } from "vitest";
import { categorize, dedupeByIssuer, freshnessWarning, mainFeed, newsworthiness, parseAtomTitle, parseFormDXml, weeklyDigest, type FormD } from "./marketing-formd-model";

const xml = `<edgarSubmission><primaryIssuer><issuerAddress><stateOrCountry>DE</stateOrCountry></issuerAddress></primaryIssuer>
<offeringData><industryGroup><industryGroupType>Pooled Investment Fund</industryGroupType><investmentFundInfo><investmentFundType>Private Equity Fund</investmentFundType></investmentFundInfo></industryGroup>
<federalExemptionsExclusions><item>06b</item><item>3C.1</item></federalExemptionsExclusions><typeOfFiling><newOrAmendment><isAmendment>false</isAmendment></newOrAmendment></typeOfFiling>
<offeringSalesAmounts><totalOfferingAmount>Indefinite</totalOfferingAmount><totalAmountSold>260000</totalAmountSold><totalRemaining>Indefinite</totalRemaining></offeringSalesAmounts><investors><totalNumberAlreadyInvested>9</totalNumberAlreadyInvested></investors></offeringData></edgarSubmission>`;
const f = (x: Partial<FormD>): FormD => ({ accession: "a", cik: "1", issuer: "X", form_type: "D", is_amendment: false, filed_at: "2026-10-08", industry: "Pooled Investment Fund", fund_type: "Venture Capital Fund", state: "DE", exemptions: ["06b"], total_offering: 1e6, offering_indefinite: false, total_sold: null, investors: 1, ...x });

describe("Form D intelligence", () => {
  it("parses titles and official XML; indefinite offering is not a number", () => {
    expect(parseAtomTitle("D/A - Hit Studio Movie LLC (0002093244) (Filer)")).toEqual({ form_type: "D/A", issuer: "Hit Studio Movie LLC", cik: "0002093244" });
    const p = parseFormDXml(xml);
    expect(p).toMatchObject({ industry: "Pooled Investment Fund", fund_type: "Private Equity Fund", state: "DE", exemptions: ["06b", "3C.1"], total_offering: null, offering_indefinite: true, total_sold: 260000, investors: 9, is_amendment: false, total_remaining: null, remaining_indefinite: true });
  });
  it("only large new filings are newsworthy; amendments never", () => {
    expect(newsworthiness(f({ total_offering: 5e8 })).newsworthy).toBe(true);
    expect(newsworthiness(f({ total_offering: 5e8, is_amendment: true })).newsworthy).toBe(false);
    expect(newsworthiness(f({ total_offering: 2e6 })).newsworthy).toBe(false);
  });
  it("digest never calls offering amounts capital raised", () => {
    const d = weeklyDigest([f({}), f({ cik: "2", is_amendment: true, total_sold: 5e5 })]);
    expect(d.total).toBe(2); expect(d.amendments).toBe(1);
    expect(d.patterns.join(" ")).toContain("not completed fundraising");
    expect(d.patterns.join(" ")).toContain("not independently verified");
    expect(d.patterns.join(" ")).not.toMatch(/\btargets?\b/);
    expect(d.patterns.join(" ")).not.toMatch(/\braised \$/);
  });
  it("dedupes amendments by issuer while keeping history", () => {
    const g = dedupeByIssuer([f({ accession: "1", filed_at: "2026-10-01" }), f({ accession: "2", filed_at: "2026-10-08", is_amendment: true })]);
    expect(g).toHaveLength(1); expect(g[0]!.latest.accession).toBe("2"); expect(g[0]!.history).toHaveLength(1);
  });
  it("routine filings stay out of the main feed", () => {
    expect(mainFeed([{ category: "form_d", promoted: false }, { category: "form_d", promoted: true }, { category: "regulatory", promoted: true }])).toHaveLength(2);
  });
  it("categorizes and warns on stale items by publication date", () => {
    const now = new Date("2026-10-08T12:00:00Z");
    expect(categorize({ source_key: "fr_sec", headline: "Proposed rule", published_at: "2026-10-07" }, now)).toBe("regulatory");
    expect(categorize({ source_key: "sec_press", headline: "SEC charges adviser", published_at: "2026-10-08" }, now)).toBe("breaking");
    expect(categorize({ source_key: "sec_press", headline: "Venture secondary market", published_at: "2026-10-06" }, now)).toBe("private_market");
    expect(categorize({ source_key: "fr_fincen", headline: "Notice", published_at: "2026-01-13" }, now)).toBe("evergreen");
    expect(freshnessWarning("2026-09-01", now)).toMatch(/days ago/);
    expect(freshnessWarning("2026-10-07", now)).toBeNull();
  });
});
