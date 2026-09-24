import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";

import { irsFieldValues, missingTaxFormFacts, type TaxFormFill } from "@/lib/onboarding-intake-model";
import { currentIrsForm } from "@/lib/onboarding-compliance-model";
import {
  INVESTOR_PREFLIGHT_MESSAGE,
  approvedWording,
  productionPreflight,
  resolveAmlPolicy,
  type PolicyEntry,
  type PreflightInput,
} from "@/lib/onboarding-production-model";
import bene from "@/assets/irs/fw8bene.pdf.asset.json";
import eci from "@/assets/irs/fw8eci.pdf.asset.json";
import exp from "@/assets/irs/fw8exp.pdf.asset.json";
import imy from "@/assets/irs/fw8imy.pdf.asset.json";

const fill: TaxFormFill = {
  legalName: "QA Foreign Holdings Ltd",
  country: "GB",
  addressLine: "1 Test Street",
  cityStateZip: "London EC1A 1AA",
  tin: "123456789",
  foreignTin: "GB-FTIN-1",
  dateOfBirth: "01-02-1980",
  eciIncomeItems: "Partnership distributions",
  signerName: "Alex Signer",
  signedDate: "2026-09-24",
};

const expected: Record<string, Record<string, string>> = {
  w8bene: {
    "topmostSubform[0].Page1[0].f1_1[0]": fill.legalName,
    "topmostSubform[0].Page1[0].f1_2[0]": "GB",
    "topmostSubform[0].Page1[0].f1_4[0]": "1 Test Street",
    "topmostSubform[0].Page1[0].f1_5[0]": "London EC1A 1AA",
    "topmostSubform[0].Page1[0].f1_6[0]": "GB",
    "topmostSubform[0].Page2[0].f2_1[0]": "123456789",
    "topmostSubform[0].Page2[0].Line9b_ReadOrder[0].f2_3[0]": "GB-FTIN-1",
    "topmostSubform[0].Page8[0].f8_31[0]": "Alex Signer",
    "topmostSubform[0].Page8[0].f8_32[0]": "2026-09-24",
  },
  w8eci: {
    "topmostSubform[0].Page1[0].f1_4[0]": "1 Test Street",
    "topmostSubform[0].Page1[0].f1_9[0]": "123456789",
    "topmostSubform[0].Page1[0].f1_10[0]": "GB-FTIN-1",
    "topmostSubform[0].Page1[0].f1_12[0]": "01-02-1980",
    "topmostSubform[0].Page1[0].f1_13[0]": "Partnership distributions",
    "topmostSubform[0].Page1[0].f1_16[0]": "Alex Signer",
    "topmostSubform[0].Page1[0].f1_17[0]": "2026-09-24",
  },
  w8exp: {
    "topmostSubform[0].Page1[0].f1_3[0]": "1 Test Street",
    "topmostSubform[0].Page1[0].f1_5[0]": "GB",
    "topmostSubform[0].Page1[0].f1_9[0]": "123456789",
    "topmostSubform[0].Page1[0].f1_11[0]": "GB-FTIN-1",
    "topmostSubform[0].Page3[0].f3_3[0]": "Alex Signer",
    "topmostSubform[0].Page3[0].f3_4[0]": "2026-09-24",
  },
  w8imy: {
    "topmostSubform[0].Page1[0].f1_4[0]": "1 Test Street",
    "topmostSubform[0].Page1[0].f1_10[0]": "123456789",
    "topmostSubform[0].Page1[0].f1_10[2]": "GB-FTIN-1",
    "topmostSubform[0].Page8[0].PrintName[0]": "Alex Signer",
    "topmostSubform[0].Page8[0].Date[0]": "2026-09-24",
  },
};

describe("Stage 4 — W-8 field mapping", () => {
  for (const [form, fields] of Object.entries(expected)) {
    it(`${form}: values map to the verified official field names`, () => {
      const { text } = irsFieldValues(form, fill);
      for (const [name, value] of Object.entries(fields)) expect(text[name]).toBe(value);
    });
  }

  it("W-8ECI never writes the date of birth into the income line", () => {
    const { text } = irsFieldValues("w8eci", fill);
    expect(text["topmostSubform[0].Page1[0].f1_13[0]"]).not.toBe(fill.dateOfBirth);
  });

  const pinned: Record<string, string> = { w8bene: bene.url, w8eci: eci.url, w8exp: exp.url, w8imy: imy.url };
  for (const form of Object.keys(expected)) {
    it(`${form}: every mapped field exists on the pinned official PDF and lands there`, async () => {
      let bytes: Uint8Array | null = null;
      for (const url of [`https://wealthway-buddy.lovable.app${pinned[form]}`, currentIrsForm(form as any).sourceUrl]) {
        try {
          const res = await fetch(url);
          if (res.ok) { bytes = new Uint8Array(await res.arrayBuffer()); break; }
        } catch { /* next copy */ }
      }
      if (!bytes) { console.warn(`offline: ${form} PDF check skipped`); return; }
      const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
      const sha = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
      expect(sha).toBe(currentIrsForm(form as any).templateSha256);
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const f = doc.getForm();
      const { text } = irsFieldValues(form, fill);
      for (const [name, value] of Object.entries(text)) {
        const field = f.getTextField(name);
        field.setMaxLength(undefined);
        field.setText(value);
        expect(field.getText()).toBe(value);
      }
    }, 30000);
  }
});

describe("Stage 4 — Needs Information instead of guessing", () => {
  it("W-8BEN-E, W-8IMY and W-8EXP stop when chapter 3/4 status is not collected", () => {
    for (const f of ["w8bene", "w8imy", "w8exp"]) {
      expect(missingTaxFormFacts(f, fill)).toEqual(expect.arrayContaining(["Chapter 4 (FATCA) status"]));
    }
  });
  it("W-8ECI requires a U.S. TIN and income items", () => {
    expect(missingTaxFormFacts("w8eci", { ...fill, tin: null, eciIncomeItems: null })).toEqual(
      expect.arrayContaining(["U.S. taxpayer identification number (line 7)", "Effectively connected income items (line 11)"]),
    );
  });
  it("W-8BEN-E is complete once every required fact is held", () => {
    expect(missingTaxFormFacts("w8bene", { ...fill, chapter3Status: "corporation", chapter4Status: "active_nffe" })).toEqual([]);
  });
  it("W-9 and W-8BEN are unchanged", () => {
    expect(missingTaxFormFacts("w9", fill)).toEqual([]);
    expect(missingTaxFormFacts("w8ben", fill)).toEqual([]);
  });
});

const entry = (p: Partial<PolicyEntry>): PolicyEntry => ({
  id: Math.random().toString(), kind: "high_risk_jurisdiction", country_code: "XX", risk_classification: "high",
  threshold_cents: null, currency: null, scope: "global", offering_id: null, effective_date: "2026-01-01",
  status: "approved", approved_by: "u2", ...p,
});

describe("Stage 4 — compliance policy", () => {
  it("no approved policy means no country and no amount trigger", () => {
    const p = resolveAmlPolicy([], "f1", "2026-09-24");
    expect(p.highRiskCountries).toEqual([]);
    expect(p.eddThresholdCents).toBeNull();
    expect(p.configured).toEqual({ countries: false, threshold: false });
  });
  it("drafts, unapproved and future entries are ignored", () => {
    const p = resolveAmlPolicy([
      entry({ status: "draft" }), entry({ approved_by: null }), entry({ effective_date: "2027-01-01" }),
    ], "f1", "2026-09-24");
    expect(p.highRiskCountries).toEqual([]);
  });
  it("fund-specific threshold overrides the global one; other funds get the global", () => {
    const rows = [
      entry({ kind: "edd_amount_threshold", country_code: null, threshold_cents: 100_000_00, currency: "USD" }),
      entry({ kind: "edd_amount_threshold", country_code: null, threshold_cents: 50_000_00, currency: "USD", scope: "fund", offering_id: "f1" }),
    ];
    expect(resolveAmlPolicy(rows, "f1", "2026-09-24").eddThresholdCents).toBe(50_000_00);
    expect(resolveAmlPolicy(rows, "f2", "2026-09-24").eddThresholdCents).toBe(100_000_00);
  });
});

describe("Stage 4 — legal wording", () => {
  const w = (p: any) => ({ id: "x", requirement_key: "k", title: "t", wording: "w", version: 1, effective_date: "2026-01-01", status: "approved", approved_by: "u", ...p });
  it("only approved, effective versions are shown; latest version wins", () => {
    const m = approvedWording([w({ version: 1 }), w({ version: 2, id: "v2" }), w({ version: 3, status: "draft" }), w({ version: 4, status: "retired" })], "2026-09-24");
    expect(m.get("k")?.id).toBe("v2");
  });
  it("nothing approved → nothing shown", () => {
    expect(approvedWording([w({ status: "draft" })], "2026-09-24").size).toBe(0);
  });
});

describe("Stage 4 — production preflight", () => {
  const base: PreflightInput = {
    badActorApplies: false, certificationKeys: [], representationEligibilityKeys: [], approvedWordingKeys: new Set(),
    taxRequired: true, taxRouting: { status: "determined", formType: "w9" }, taxFormMissingFacts: [],
    policyRequired: { countries: false, threshold: false }, policyConfigured: { countries: false, threshold: false },
    signatureTemplateReady: true,
  };
  it("clean investment passes", () => expect(productionPreflight(base)).toEqual([]));
  it("each unresolved dependency returns a precise internal reason", () => {
    const codes = productionPreflight({
      ...base, badActorApplies: true, certificationKeys: ["accuracy"],
      taxRouting: { status: "needs_review" }, policyRequired: { countries: true, threshold: false }, signatureTemplateReady: false,
    }).map((b) => b.code);
    expect(codes).toEqual(expect.arrayContaining(["legal_wording_missing", "tax_classification_review", "compliance_policy_missing", "signature_template_not_ready"]));
  });
  it("incomplete W-8 mapping blocks", () => {
    expect(productionPreflight({ ...base, taxRouting: { status: "determined", formType: "w8bene" }, taxFormMissingFacts: ["Chapter 4 (FATCA) status"] })[0]?.code).toBe("tax_form_mapping_incomplete");
  });
  it("approved wording clears the wording blocker", () => {
    expect(productionPreflight({ ...base, certificationKeys: ["accuracy"], approvedWordingKeys: new Set(["certification:accuracy"]) })).toEqual([]);
  });
  it("investor copy never exposes internal configuration", () => {
    expect(INVESTOR_PREFLIGHT_MESSAGE).toBe("Harmonious needs to complete part of the setup before you can continue.");
  });
});
