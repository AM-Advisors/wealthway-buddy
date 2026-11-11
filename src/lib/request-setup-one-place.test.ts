import { describe, expect, it } from "vitest";
import { emptyRequest, offeringFieldsFor, setupDetailsFor, setupPrefillFor, singleClassOf, type FundRequest } from "@/lib/fund-request-model";
import { applyDetailEdit, cleanSetupDetails, fillDetailsFromRequest, fillProvidersFromRequest } from "@/lib/fund-setup-details";
import { requestDocumentCategory } from "@/lib/offering-document-model";
import { checkRequestAgainstSetup, type SetupSnapshot } from "@/lib/setup-request-check";

const chapter2 = (): FundRequest => ({
  ...emptyRequest("spv"),
  fund_name: "Chapter 2, a series of Storybook Ventures",
  legal_name: "Chapter 2",
  vehicle_structure: "Series LLC",
  series_home: "am_spv",
  investor_eligibility: "Unlimited accredited investors and up to 35 non-accredited, sophisticated investors.",
  gp_commitment: "0",
  documents_path: "prepare",
  counsel: "Fabian Vancott",
  tax_preparer: "Harmonious",
  service_keys: ["entity_formation", "form_d"],
  signatory: { name: "Alyssa McEwen Pettit", email: "alyssa@storybookvc.com", title: "Managing Partner" },
});

const snap = (over: Partial<SetupSnapshot> = {}): SetupSnapshot => ({
  legalName: null, displayName: null, fundType: null, entityType: null, jurisdiction: null, formationDate: null, regType: null,
  targetRaiseCents: null, minInvestmentCents: null, offeringCloseDate: null, gpName: null, signatoryNames: [], signatoryTitles: [], teamNames: [],
  managementFeePct: null, carryPct: null, preferredReturnPct: null, fundTermMonths: null, investmentPeriodMonths: null, classNames: [],
  hasEin: false, bankingStarted: false, documentCount: 0, serviceProviders: {}, investmentStrategy: null, setupDetails: {}, documentFileNames: [], ...over,
});

describe("request answers land in Setup", () => {
  it("keeps eligibility, GP commitment, documents choice, series master and services as Setup details", () => {
    const d = setupDetailsFor(chapter2());
    expect(d.investor_eligibility).toMatch(/35 non-accredited/);
    expect(d.gp_commitment).toBe("0");
    expect(d.documents_path).toBe("prepare");
    expect(d.series_master).toContain("AM SPV Fund Management");
    expect(d.requested_services).toEqual(["entity_formation", "form_d"]);
  });

  it("carries the tax preparer and counsel as service providers", () => {
    const p = setupPrefillFor(chapter2()).service_providers;
    expect(p.counsel).toBe("Fabian Vancott");
    expect(p.tax_preparer).toBe("Harmonious");
  });

  it("a one-class fund keeps its class name and uses the class minimum when no fund minimum was given", () => {
    const r: FundRequest = { ...chapter2(), minimum_investment: "", classes: [{ name: "Class A", fee: "2%", carry: "20%", hurdle: "", minimum: "25000" }] };
    expect(singleClassOf(r)).toEqual({ name: "Class A", minimumCents: 2_500_000 });
    expect(offeringFieldsFor(r)["min_investment_cents"]).toBe(2_500_000);
    expect(setupDetailsFor(r).class_name).toBe("Class A");
  });

  it("a fund minimum given on the request wins over the class minimum", () => {
    const r: FundRequest = { ...chapter2(), minimum_investment: "100000", classes: [{ name: "Class A", fee: "2%", carry: "", hurdle: "", minimum: "25000" }] };
    expect(offeringFieldsFor(r)["min_investment_cents"]).toBe(10_000_000);
  });

  it("blanks on the request never erase what Setup already has", () => {
    const next = fillDetailsFromRequest({ gp_commitment: "1%" }, { gp_commitment: "", investor_eligibility: "Accredited only" });
    expect(next.gp_commitment).toBe("1%");
    expect(next.investor_eligibility).toBe("Accredited only");
    expect(fillProvidersFromRequest({ counsel: "Firm A" }, { counsel: "Firm B", auditor: "Audit Co" })).toMatchObject({ counsel: "Firm A", auditor: "Audit Co" });
  });

  it("editing in Setup can clear a value, and unknown choices are refused", () => {
    expect(applyDetailEdit({ gp_commitment: "1%", bank_name: "Bank" }, { gp_commitment: "" })).toEqual({ bank_name: "Bank" });
    expect(cleanSetupDetails({ documents_path: "somewhere", bank_name: " Bank " })).toEqual({ bank_name: "Bank" });
  });

  it("uploaded request documents go to the matching Setup document type", () => {
    expect(requestDocumentCategory("Subscription agreement")?.category).toBe("subscription_agreement");
    expect(requestDocumentCategory("Operating agreement / LPA")?.category).toBe("operating_agreement");
    expect(requestDocumentCategory("PPM")?.category).toBe("ppm");
    expect(requestDocumentCategory("Side letter")).toEqual({ category: "other", title: "Side letter" });
    expect(requestDocumentCategory("Formation document")).toBeNull();
  });

  it("a copied file with a download suffix counts as the same document; formation papers are checked by hand", () => {
    const details = { _kind: "fund_request_v2", fund_name: "F", documents: [
      { kind: "Subscription agreement", fileName: "Subscription Agreement - Firehawk.pdf", path: "x" },
      { kind: "Formation document", fileName: "IRS EIN Confirmation.pdf", path: "y" },
    ] };
    const rows = checkRequestAgainstSetup(details, snap({ documentFileNames: ["Subscription Agreement - Firehawk (1).pdf"] }));
    expect(rows.find((r) => r.answer === "Subscription Agreement - Firehawk.pdf")?.state).toBe("in_setup");
    expect(rows.find((r) => r.answer === "IRS EIN Confirmation.pdf")?.state).toBe("reference");
  });

  it("the Setup check compares the real stored values, not just whether something exists", () => {
    const details = { ...chapter2(), _kind: "fund_request_v2", bank_name: "First Bank", documents: [{ kind: "PPM", fileName: "ppm.pdf", path: "x" }] };
    const before = checkRequestAgainstSetup(details, snap({ documentCount: 3, bankingStarted: true }));
    expect(before.find((r) => r.key === "bank")?.state).toBe("missing");
    expect(before.find((r) => r.key === "document_ppm.pdf")?.state).toBe("missing");
    expect(before.find((r) => r.key === "investor_eligibility")?.state).toBe("missing");
    const after = checkRequestAgainstSetup(details, snap({
      documentFileNames: ["ppm.pdf"],
      setupDetails: setupDetailsFor({ ...chapter2(), bank_name: "First Bank" }) as Record<string, unknown>,
      serviceProviders: { counsel: "Fabian Vancott", tax_preparer: "Harmonious" },
    }));
    for (const k of ["bank", "document_ppm.pdf", "investor_eligibility", "gp_commitment", "documents_path", "provider_counsel", "provider_tax_preparer"]) {
      expect(after.find((r) => r.key === k)?.state, k).toBe("in_setup");
    }
  });
});

describe("first fund setup fee", () => {
  const fake = (o: { role: string; funds: number; intakes: string[]; createdBy: string | null }) => ({
    from(table: string) {
      const api: any = { select: () => api, eq: () => api };
      if (table === "client_users") api.then = (r: any) => r({ data: [{ client_role: o.role }] });
      if (table === "offerings") api.then = (r: any) => r({ count: o.funds });
      if (table === "client_fund_intakes") api.then = (r: any) => r({ data: o.intakes.map((status) => ({ status })) });
      if (table === "clients") api.maybeSingle = async () => ({ data: { created_by: o.createdBy } });
      return api;
    },
  });
  it("an invited client's first fund is covered; a second fund or a self-started organization pays", async () => {
    const { firstFundCovered } = await import("@/lib/fund-payments.server");
    expect(await firstFundCovered(fake({ role: "client_gp", funds: 0, intakes: ["request_draft"], createdBy: "staff" }), "c", "u")).toBe(true);
    expect(await firstFundCovered(fake({ role: "client_gp", funds: 1, intakes: [], createdBy: "staff" }), "c", "u")).toBe(false);
    expect(await firstFundCovered(fake({ role: "client_gp", funds: 0, intakes: ["submitted"], createdBy: "staff" }), "c", "u")).toBe(false);
    expect(await firstFundCovered(fake({ role: "client_gp", funds: 0, intakes: [], createdBy: "u" }), "c", "u")).toBe(false);
    expect(await firstFundCovered(fake({ role: "client_viewer", funds: 0, intakes: [], createdBy: "staff" }), "c", "u")).toBe(false);
  });
});
