import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ tables: {} as Record<string, any[]>, urls: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: (table: string) => {
    const filters: ((row: any) => boolean)[] = [];
    const q: any = {
      select: () => q, eq: (key: string, value: unknown) => { filters.push((r) => r[key] === value); return q; },
      is: (key: string, value: unknown) => { filters.push((r) => (r[key] ?? null) === value); return q; },
      in: (key: string, values: unknown[]) => { filters.push((r) => values.includes(r[key])); return q; },
      order: () => q,
      maybeSingle: async () => ({ data: (mock.tables[table] ?? []).filter((r) => filters.every((f) => f(r)))[0] ?? null }),
      then: (resolve: any) => Promise.resolve({ data: (mock.tables[table] ?? []).filter((r) => filters.every((f) => f(r))) }).then(resolve),
    };
    return q;
  },
  storage: { from: (bucket: string) => ({ createSignedUrl: async (path: string) => { mock.urls(bucket, path); return { data: { signedUrl: `https://synthetic.test/${bucket}/${path}` } }; } }) },
} }));
import { investorDetail, investorGrid, listFiles } from "./fund-tabs.server";
import { einComplete } from "./fund-setup-complete";

describe("shared IRS evidence read-back", () => {
  beforeEach(() => {
    mock.urls.mockClear();
    mock.tables = {
      fund_files: [], fund_setups: [{ id: "setup", offering_id: "series-fund" }],
      fund_setup_documents: [
        { id: "letter", setup_id: "setup", doc_type: "ein_letter", is_current: true, storage_path: "current.pdf", title: "IRS EIN letter", created_at: "2026-10-18" },
        { id: "old", setup_id: "setup", doc_type: "ein_letter", is_current: false, storage_path: "old.pdf" },
        { id: "other", setup_id: "other-setup", doc_type: "ein_letter", is_current: true, storage_path: "other.pdf" },
      ],
    };
  });
  it("the current canonical IRS upload completes the EIN box without duplicating a fund file", async () => {
    const files = await listFiles("series-fund", true);
    expect(files.map((f) => f.id)).toEqual(["letter"]);
    expect(files[0]?.category).toBe("ein_letter");
    expect(einComplete({ status: "recorded", hasLetter: files.some((f) => f.category === "ein_letter") })).toBe(true);
    expect(mock.tables["fund_files"]).toEqual([]);
    expect(mock.urls).toHaveBeenCalledWith("fund-formation", "current.pdf");
  });
  it("ordinary fund viewers never receive restricted setup evidence", async () => {
    expect(await listFiles("series-fund", false)).toEqual([]);
    expect(mock.urls).not.toHaveBeenCalled();
  });
});

describe("verified investor identity read-back", () => {
  beforeEach(() => {
    mock.tables = {
      offerings: [{ id: "fund", has_multiple_classes: false }],
      investor_onboardings: [{ id: "investor", offering_id: "fund", person_id: "person", investment_profiles: { profile_type: "individual", tax_id_last4: "6789" } }],
      persons: [{ id: "person", date_of_birth: null, citizenship_country: null }],
      kyc_verifications: [{ person_id: "person", status: "approved", completed_at: "2026-10-21", verified_date_of_birth: "1990-02-03", decision: { id_verification: { nationality: "US", document_number: "not-a-tax-id" } } }],
    };
  });
  it("uses approved verification birthday in details and missing-info warnings", async () => {
    const row = await investorDetail("fund", "investor");
    expect(row.dateOfBirth).toBe("1990-02-03");
    expect(row.missing).not.toContain("Date of birth");
  });
  it("uses verified nationality for citizenship", async () => {
    expect((await investorDetail("fund", "investor")).citizenship).toBe("US");
  });
  it("reuses the investing profile tax ID without returning a full ID", async () => {
    const row = await investorDetail("fund", "investor");
    expect(row.taxIdLast4).toBe("6789");
    expect(row.missing).not.toContain("Tax ID");
    expect(JSON.stringify(row)).not.toContain("not-a-tax-id");
  });
  it("does not use pending verification as verified identity", async () => {
    mock.tables["kyc_verifications"] = [{ person_id: "person", status: "pending", completed_at: "2026-10-21", verified_date_of_birth: "1990-02-03", decision: { id_verification: { nationality: "US" } } }];
    const [row] = await investorGrid("fund");
    expect(row?.dateOfBirth).toBeNull();
    expect(row?.citizenship).toBeNull();
    expect(row?.missing).toContain("Date of birth");
  });
  it.each(["w9", "w8ben", "w8bene"])("reads tax ID from the profile's certified %s without duplicate entry", async (formType) => {
    mock.tables["investor_onboardings"][0].investment_profile_id = "profile";
    mock.tables["investor_onboardings"][0].investment_profiles.tax_id_last4 = null;
    mock.tables["investor_tax_forms"] = [{ investment_profile_id: "profile", form_type: formType, status: "certified", certified_at: "2026-10-21", tin_last4: "4321", superseded_by: null }];
    const row = await investorDetail("fund", "investor");
    expect(row.taxIdLast4).toBe("4321");
    expect(row.missing).not.toContain("Tax ID");
  });
  it("ignores unsigned, superseded, expired and other-profile tax forms", async () => {
    mock.tables["investor_onboardings"][0].investment_profile_id = "profile";
    mock.tables["investor_onboardings"][0].investment_profiles.tax_id_last4 = null;
    mock.tables["investor_tax_forms"] = [
      { investment_profile_id: "profile", status: "draft", tin_last4: "1111" },
      { investment_profile_id: "profile", status: "certified", certified_at: "2020-01-01", expires_on: "2020-12-31", tin_last4: "2222" },
      { investment_profile_id: "profile", status: "certified", certified_at: "2026-10-21", superseded_by: "replacement", tin_last4: "3333" },
      { investment_profile_id: "other", status: "certified", certified_at: "2026-10-21", tin_last4: "4444" },
    ];
    const row = await investorDetail("fund", "investor");
    expect(row.taxIdLast4).toBeNull();
    expect(row.missing).toContain("Tax ID");
  });
  it("does not use a business signer's personal tax ID as the business EIN", async () => {
    mock.tables["persons"] = [{ id: "person", tax_id_last4: "1234" }];
    mock.tables["investor_onboardings"] = [{ id: "investor", offering_id: "fund", person_id: "person", investment_profiles: { profile_type: "llc" } }];
    const [row] = await investorGrid("fund");
    expect(row?.taxIdLast4).toBeNull();
    expect(row?.missing).toContain("Tax ID");
  });
});

describe("investor class applicability", () => {
  beforeEach(() => {
    mock.tables = {
      offerings: [{ id: "fund", has_multiple_classes: false }],
      investor_onboardings: [{ id: "investor", offering_id: "fund", person_id: "person", offering_class_key: null }],
      persons: [{ id: "person" }],
    };
  });
  it("does not require a class for a fund without multiple classes", async () => {
    const [row] = await investorGrid("fund");
    expect(row?.classApplicable).toBe(false);
    expect(row?.missing.includes("Class")).toBe(false);
  });
  it("requires a missing class when the fund has multiple classes", async () => {
    mock.tables["offerings"] = [{ id: "fund", has_multiple_classes: true }];
    const [row] = await investorGrid("fund");
    expect(row?.classApplicable).toBe(true);
    expect(row?.missing.includes("Class")).toBe(true);
  });
  it("does not flag an assigned class in a multiple-class fund", async () => {
    mock.tables["offerings"] = [{ id: "fund", has_multiple_classes: true }];
    mock.tables["investor_onboardings"] = [{ id: "investor", offering_id: "fund", person_id: "person", offering_class_key: "class_a" }];
    const [row] = await investorGrid("fund");
    expect(row?.classApplicable).toBe(true);
    expect(row?.missing.includes("Class")).toBe(false);
  });
});