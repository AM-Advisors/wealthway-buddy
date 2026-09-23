import { describe, expect, it, vi } from "vitest";

/**
 * Agreement preparation — adversarial tests.
 *
 * Preparation decides who signs and where the Box Sign fields go. None of it
 * may be taken on trust from the browser: the fund or company relationship is
 * re-read at send time, a role can only receive its own fields, prefill can
 * never stand in for a signature, published layouts are frozen, and nothing
 * here can declare an agreement executed.
 */

import {
  boxInputsByRole,
  buildSendReview,
  canPrepare,
  canUseTemplate,
  capacityForRole,
  pipelineBucket,
  preparationAllowed,
  requestUsesCurrentTemplate,
  resolvePrefill,
  validateLayout,
  type PlacedField,
  type PreparerActor,
  type TemplateRole,
} from "@/lib/agreement-prep";

const FUND_A = "33333333-3333-4333-8333-333333333333";
const FUND_B = "44444444-4444-4444-8444-444444444444";
const COMPANY_A = "77777777-7777-4777-8777-777777777777";
const COMPANY_B = "88888888-8888-4888-8888-888888888888";
const DOC_A = "aaaaaaa1-1111-4111-8111-111111111111";
const APP_A = "bbbbbbb1-1111-4111-8111-111111111111";
const APP_B = "ccccccc1-1111-4111-8111-111111111111";

const managerA: PreparerActor = {
  userId: "mgr-a",
  capabilities: [],
  offeringIds: [FUND_A],
  companyIds: [],
};
const managerB: PreparerActor = {
  userId: "mgr-b",
  capabilities: [],
  offeringIds: [FUND_B],
  companyIds: [],
};
const founderA: PreparerActor = {
  userId: "founder-a",
  capabilities: [],
  offeringIds: [],
  companyIds: [COMPANY_A],
};
const investor: PreparerActor = {
  userId: "investor",
  capabilities: [],
  offeringIds: [],
  companyIds: [],
};
const staff: PreparerActor = {
  userId: "staff",
  capabilities: ["documents:see", "documents:prepare"],
  offeringIds: [],
  companyIds: [],
};
const viewOnlyStaff: PreparerActor = {
  userId: "staff-view",
  capabilities: ["documents:see"],
  offeringIds: [],
  companyIds: [],
};

const roles: TemplateRole[] = [
  { key: "investor", order: 1, required: true },
  { key: "general_partner", order: 2, required: true },
];

const field = (over: Partial<PlacedField> = {}): PlacedField => ({
  key: "f1",
  roleKey: "investor",
  type: "signature",
  pageIndex: 31,
  x: 0.1,
  y: 0.5,
  width: 0.28,
  height: 0.05,
  required: true,
  prefill: null,
  ...over,
});

const fullLayout: PlacedField[] = [
  field({ key: "inv-sig" }),
  field({ key: "inv-name", type: "full_name", prefill: "legal_investor_name" }),
  field({ key: "gp-sig", roleKey: "general_partner", pageIndex: 33 }),
];

/* ------------------------------------------------------------------ rules */

describe("who may prepare an agreement", () => {
  it("lets a fund manager prepare only their own fund", () => {
    expect(canPrepare(managerA, { scope: "fund", offeringId: FUND_A })).toBe(true);
    expect(canPrepare(managerA, { scope: "fund", offeringId: FUND_B })).toBe(false);
    expect(canPrepare(managerB, { scope: "fund", offeringId: FUND_A })).toBe(false);
  });

  it("lets a founder prepare only their own company", () => {
    expect(canPrepare(founderA, { scope: "company", companyId: COMPANY_A })).toBe(true);
    expect(canPrepare(founderA, { scope: "company", companyId: COMPANY_B })).toBe(false);
  });

  it("gives an investor no preparation authority anywhere", () => {
    expect(canPrepare(investor, { scope: "fund", offeringId: FUND_A })).toBe(false);
    expect(canPrepare(investor, { scope: "company", companyId: COMPANY_A })).toBe(false);
    expect(canPrepare(investor, { scope: "harmonious" })).toBe(false);
    expect(canUseTemplate(investor, { scope: "harmonious" })).toBe(false);
  });

  it("requires the prepare capability from staff, not merely sight of documents", () => {
    expect(canPrepare(staff, { scope: "harmonious" })).toBe(true);
    expect(canPrepare(viewOnlyStaff, { scope: "harmonious" })).toBe(false);
    expect(canPrepare(viewOnlyStaff, { scope: "fund", offeringId: FUND_A })).toBe(false);
  });

  it("never infers authority from a missing target", () => {
    expect(canPrepare(managerA, { scope: "fund", offeringId: null })).toBe(false);
    expect(canPrepare(founderA, { scope: "company", companyId: null })).toBe(false);
  });
});

describe("a layout is only sendable when it makes sense", () => {
  it("accepts a complete layout", () => {
    expect(validateLayout({ roles, fields: fullLayout })).toEqual([]);
  });

  it("refuses a field that belongs to nobody", () => {
    const problems = validateLayout({
      roles,
      fields: [...fullLayout, field({ key: "orphan", roleKey: "trustee" })],
    });
    expect(problems.some((p) => /must belong to a signer/.test(p.message))).toBe(true);
  });

  it("refuses a required signer with nothing to sign", () => {
    const problems = validateLayout({
      roles,
      fields: [field({ key: "inv-sig" })],
    });
    expect(problems.some((p) => /GP \/ Manager has no signature field/.test(p.message))).toBe(true);
  });

  it("refuses a field placed off the page", () => {
    const problems = validateLayout({ roles, fields: [...fullLayout, field({ key: "off", x: 1.5 })] });
    expect(problems.some((p) => /outside the page/.test(p.message))).toBe(true);
  });

  it("refuses an invented field type", () => {
    const problems = validateLayout({ roles, fields: [...fullLayout, field({ key: "x", type: "wet_ink" })] });
    expect(problems.some((p) => /not a Box Sign field/.test(p.message))).toBe(true);
  });

  it("never lets prefill stand in for a signature or an acknowledgement", () => {
    for (const type of ["signature", "initial", "checkbox"]) {
      const problems = validateLayout({
        roles,
        fields: [...fullLayout, field({ key: `p-${type}`, type, prefill: "signer_name" })],
      });
      expect(problems.some((p) => /completed by the signer/.test(p.message))).toBe(true);
    }
  });
});

describe("fields only ever reach the signer whose role owns them", () => {
  it("bundles inputs per role and never mixes them", () => {
    const inputs = boxInputsByRole({
      fields: fullLayout,
      prefillFor: (roleKey) => ({
        legalInvestorName: roleKey === "investor" ? "Investor One" : "Should not appear",
      }),
    });
    expect(inputs["investor"]).toHaveLength(2);
    expect(inputs["general_partner"]).toHaveLength(1);
    expect(inputs["general_partner"]!.every((i) => !i.text_value)).toBe(true);
    expect(inputs["investor"]!.find((i) => i.type === "full_name")?.text_value).toBe("Investor One");
  });

  it("sends no prefilled value into a signature field", () => {
    const inputs = boxInputsByRole({
      fields: [field({ key: "sig", type: "signature", prefill: "signer_name" })],
      prefillFor: () => ({ signerName: "Investor One" }),
    });
    expect(inputs["investor"]![0]!.text_value).toBeUndefined();
  });

  it("uses zero-based page indexes, as Box Sign expects", () => {
    const inputs = boxInputsByRole({ fields: [field({ pageIndex: 31 })], prefillFor: () => ({}) });
    expect(inputs["investor"]![0]!.page_index).toBe(31);
  });

  it("resolves prefill only from authoritative values", () => {
    const ctx = { legalInvestorName: "One LLC", commitmentCents: 250_000_00, fundName: "Fund A" };
    expect(resolvePrefill("legal_investor_name", ctx)).toBe("One LLC");
    expect(resolvePrefill("commitment_amount", ctx)).toBe("$250,000.00");
    expect(resolvePrefill("something_made_up", ctx)).toBe("");
    expect(resolvePrefill("signer_title", {})).toBe("");
  });
});

describe("signer capacity and review", () => {
  it("maps each role to its signing capacity", () => {
    expect(capacityForRole("trustee")).toBe("trustee");
    expect(capacityForRole("authorized_signatory")).toBe("authorized_signatory");
    expect(capacityForRole("invented")).toBe("other");
  });

  it("will not review a send with a required signer missing", () => {
    const review = buildSendReview({
      agreementTitle: "Limited Partnership Agreement",
      investorName: "One LLC",
      roles,
      fields: fullLayout,
      signers: [{ roleKey: "investor", name: "One", email: "one@test.test", order: 1, required: true }],
    });
    expect(review.problems.some((p) => /Choose who signs as GP \/ Manager/.test(p.message))).toBe(true);
  });

  it("summarises the send when everything is in place", () => {
    const review = buildSendReview({
      agreementTitle: "Limited Partnership Agreement",
      investorName: "One LLC",
      roles,
      fields: fullLayout,
      signers: [
        { roleKey: "investor", name: "One", email: "one@test.test", order: 1, required: true },
        { roleKey: "general_partner", name: "GP", email: "gp@test.test", order: 2, required: true },
      ],
    });
    expect(review.problems).toEqual([]);
    expect(review.primarySigner?.roleKey).toBe("investor");
    expect(review.additionalSigners).toHaveLength(1);
    expect(review.requiredFieldCount).toBe(3);
  });
});

describe("versions are locked and executed agreements are final", () => {
  it("leaves an outstanding request on the version it was sent with", () => {
    expect(
      requestUsesCurrentTemplate({ requestTemplateVersionId: "v1", currentTemplateVersionId: "v2" }),
    ).toBe(false);
    expect(
      requestUsesCurrentTemplate({ requestTemplateVersionId: "v1", currentTemplateVersionId: "v1" }),
    ).toBe(true);
  });

  it("refuses to re-prepare an executed or outstanding agreement", () => {
    expect(preparationAllowed("executed").allowed).toBe(false);
    expect(preparationAllowed("partially_signed").allowed).toBe(false);
    expect(preparationAllowed("out_for_signature").allowed).toBe(false);
    expect(preparationAllowed("not_sent").allowed).toBe(true);
  });

  it("derives pipeline buckets from state, never from a stored status", () => {
    expect(pipelineBucket("executed", "2026-01-01")).toBe("executed");
    expect(pipelineBucket("partially_signed", "2026-01-01")).toBe("partially_signed");
    expect(pipelineBucket("declined", "2026-01-01")).toBe("attention");
    expect(pipelineBucket("out_for_signature", "2026-01-01")).toBe("awaiting");
    expect(pipelineBucket("out_for_signature", null)).toBe("sent");
  });
});

/* --------------------------------------------------------------- the send */

const tables: Record<string, any[]> = {
  offering_documents: [
    { id: DOC_A, offering_id: FUND_A, title: "Limited Partnership Agreement", body: "…", doc_type: "lpa", requires_signature: true, file_path: null, created_by: "author" },
  ],
  investor_applications: [
    { id: APP_A, offering_id: FUND_A, user_id: "investor-1" },
    { id: APP_B, offering_id: FUND_B, user_id: "investor-2" },
  ],
  offerings: [{ id: FUND_A, name: "Fund A", reg_type: "506b" }],
  subscriptions: [{ application_id: APP_A, commitment_cents: 100_000_00, tax_classification: "individual", ownership_title: "One LLC" }],
  investor_onboardings: [{ application_id: APP_A, investment_profile_id: "prof-1" }],
  profiles: [{ user_id: "investor-1", legal_name: "Investor One", email: "one@test.test" }],
  document_signatures: [],
  document_signature_signers: [],
  signature_audit_events: [],
};

const writes: { table: string; op: string; payload: any }[] = [];

function builder(table: string) {
  let rows = [...(tables[table] ?? [])];
  const api: any = {
    select: () => api,
    order: () => api,
    limit: () => api,
    eq: (col: string, val: unknown) => {
      rows = rows.filter((r) => r[col] === val);
      return api;
    },
    neq: () => api,
    in: (col: string, vals: unknown[]) => {
      rows = rows.filter((r) => vals.includes(r[col]));
      return api;
    },
    delete: () => {
      writes.push({ table, op: "delete", payload: null });
      return api;
    },
    insert: (payload: any) => {
      writes.push({ table, op: "insert", payload });
      return {
        select: () => ({ single: () => Promise.resolve({ data: { id: "new-id" }, error: null }) }),
        then: (resolve: any) => resolve({ data: null, error: null }),
      };
    },
    update: (payload: any) => {
      writes.push({ table, op: "update", payload });
      return api;
    },
    upsert: (payload: any) => {
      writes.push({ table, op: "upsert", payload });
      return { then: (resolve: any) => resolve({ data: null, error: null }) };
    },
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    single: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    then: (resolve: any) => resolve({ data: rows, error: null }),
  };
  return api;
}

const admin = {
  from: (t: string) => builder(t),
  storage: { from: () => ({ download: async () => ({ data: null }) }) },
};

vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/box.server", () => ({
  uploadFile: async () => "box-file-1",
  fileVersionId: async () => "box-version-1",
  createMultiSignerRequest: async (input: any) => {
    (globalThis as any).__lastBoxRequest = input;
    return {
      id: "sign-request-1",
      sourceFileVersionId: "box-version-1",
      signers: input.signers.map((s: any) => ({ email: s.email, embedUrl: "https://box/embed" })),
    };
  },
}));
vi.mock("@/lib/offering-pdf.server", () => ({
  buildOfferingPdf: async () => new Uint8Array([1, 2, 3]),
}));

const prep = await import("@/lib/agreement-prep.server");

const signers = [
  { roleKey: "investor", name: "Investor One", email: "one@test.test", order: 1, required: true },
  { roleKey: "general_partner", name: "GP", email: "gp@test.test", order: 2, required: true },
];

const sendInput = {
  applicationId: APP_A,
  offeringDocumentId: DOC_A,
  templateVersionId: null,
  roles,
  fields: fullLayout,
  signers,
};

describe("sending is authorized again at send time", () => {
  it("refuses a fund manager who does not manage that fund", async () => {
    await expect(prep.sendPreparedAgreement({}, admin, managerB, sendInput)).rejects.toThrow(
      /not authorized/,
    );
  });

  it("refuses an investor outright", async () => {
    await expect(prep.sendPreparedAgreement({}, admin, investor, sendInput)).rejects.toThrow(
      /not authorized/,
    );
  });

  it("refuses view-only staff", async () => {
    await expect(prep.sendPreparedAgreement({}, admin, viewOnlyStaff, sendInput)).rejects.toThrow(
      /not authorized/,
    );
  });

  it("refuses an investor record from another fund", async () => {
    await expect(
      prep.sendPreparedAgreement({}, admin, managerA, { ...sendInput, applicationId: APP_B }),
    ).rejects.toThrow(/does not belong to this investor's fund/);
  });

  it("refuses an incomplete layout even if the screen allowed it", async () => {
    await expect(
      prep.sendPreparedAgreement({}, admin, managerA, {
        ...sendInput,
        fields: [field({ key: "inv-sig" })],
      }),
    ).rejects.toThrow(/no signature field/);
  });

  it("refuses a signer given a role that is not on the agreement", async () => {
    await expect(
      prep.sendPreparedAgreement({}, admin, managerA, {
        ...sendInput,
        signers: [...signers, { roleKey: "trustee", name: "T", email: "t@test.test", order: 3, required: true }],
      }),
    ).rejects.toThrow(/role that is not on this agreement/);
  });

  it("sends through Box Sign with each signer carrying only their own fields", async () => {
    writes.length = 0;
    const result = await prep.sendPreparedAgreement({}, admin, managerA, sendInput);
    expect(result.signRequestId).toBe("sign-request-1");
    expect(result.signerCount).toBe(2);

    const request = (globalThis as any).__lastBoxRequest;
    expect(request.signers).toHaveLength(2);
    expect(request.signers[0].order).toBe(1);
    expect(request.signers[0].inputs).toHaveLength(2);
    expect(request.signers[1].inputs).toHaveLength(1);
    expect(JSON.stringify(request.signers[1].inputs)).not.toContain("Investor One");

    const signature = writes.find((w) => w.table === "document_signatures")?.payload;
    expect(signature.provider_status).toBe("out_for_signature");
    expect(signature.provider_completed_at).toBeNull();
    expect(signature.source_file_version_id).toBe("box-version-1");
    expect(signature.locked_at).toBeTruthy();
    expect(signature.prepared_by).toBe("mgr-a");
    expect(signature.sent_by).toBe("mgr-a");
    expect(signature.document_author).toBe("author");

    const rows = writes.find((w) => w.table === "document_signature_signers" && w.op === "upsert")
      ?.payload as any[];
    expect(rows.map((r) => r.role_key)).toEqual(["investor", "general_partner"]);
    expect(rows.map((r) => r.signing_order)).toEqual([1, 2]);
    expect(rows.every((r) => r.status === "sent")).toBe(true);

    const audit = writes.find((w) => w.table === "signature_audit_events")?.payload;
    expect(audit.event_type).toBe("agreement_prepared_and_sent");
    expect(audit.metadata.document_author).toBe("author");
    expect(audit.metadata.prepared_by).toBe("mgr-a");
    expect(audit.metadata.sent_by).toBe("mgr-a");
  });

  it("never records a completion: only Box can do that", async () => {
    writes.length = 0;
    await prep.sendPreparedAgreement({}, admin, staff, sendInput);
    for (const write of writes) {
      const payloads = Array.isArray(write.payload) ? write.payload : [write.payload];
      for (const payload of payloads) {
        expect(payload?.provider_completed_at ?? null).toBeNull();
        expect(payload?.signed_file_version_id ?? null).toBeNull();
        expect(payload?.status === "signed").toBe(false);
      }
    }
  });
});

describe("templates stay inside their own scope", () => {
  it("refuses a fund manager saving a template for another fund", async () => {
    await expect(
      prep.saveTemplateVersion(admin, managerA, {
        scope: "fund",
        offeringId: FUND_B,
        agreementType: "lpa",
        name: "Someone else's layout",
        roles,
        fields: fullLayout,
        publish: true,
      }),
    ).rejects.toThrow(/not authorized/);
  });

  it("refuses a founder saving a template for another company", async () => {
    await expect(
      prep.saveTemplateVersion(admin, founderA, {
        scope: "company",
        companyId: COMPANY_B,
        agreementType: "other",
        name: "Not mine",
        roles,
        fields: fullLayout,
        publish: true,
      }),
    ).rejects.toThrow(/not authorized/);
  });

  it("refuses an investor saving a Harmonious standard template", async () => {
    await expect(
      prep.saveTemplateVersion(admin, investor, {
        scope: "harmonious",
        agreementType: "lpa",
        name: "Standard",
        roles,
        fields: fullLayout,
        publish: true,
      }),
    ).rejects.toThrow(/not authorized/);
  });

  it("refuses publishing a layout that is not complete", async () => {
    await expect(
      prep.saveTemplateVersion(admin, managerA, {
        scope: "fund",
        offeringId: FUND_A,
        agreementType: "lpa",
        name: "Half done",
        roles,
        fields: [field({ key: "inv-sig" })],
        publish: true,
      }),
    ).rejects.toThrow(/no signature field/);
  });
});
