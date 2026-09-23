import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 3B adversarial tests — assisted professional actions.
 *
 * The question in every case is not what the screen offers but what the server
 * will actually do: preparation is capability- and scope-checked, protected
 * verification state is unreachable, and only the client can approve.
 */

const PRINCIPAL_A = "11111111-1111-4111-8111-00000000000a";
const PRINCIPAL_B = "11111111-1111-4111-8111-00000000000b";
const PRO_A = "22222222-2222-4222-8222-00000000000a";
const ORG = "33333333-3333-4333-8333-00000000000a";
const PROFILE_A1 = "44444444-4444-4444-8444-000000000001";
const PROFILE_A2 = "44444444-4444-4444-8444-000000000002";
const PROFILE_B1 = "44444444-4444-4444-8444-00000000000b";
const FUND_A = "55555555-5555-4555-8555-00000000000a";
const APP_A = "66666666-6666-4666-8666-00000000000a";
const APP_B = "66666666-6666-4666-8666-00000000000b";

const HOUR = 3600_000;
const past = new Date(Date.now() - 48 * HOUR).toISOString();
const future = new Date(Date.now() + 48 * HOUR).toISOString();

let seq = 0;
const nextId = () => `row-${++seq}`;

const tables: Record<string, any[]> = {};

function reset() {
  seq = 0;
  tables["delegations"] = [];
  tables["delegation_permissions"] = [];
  tables["professional_memberships"] = [
    { id: "m1", organization_id: ORG, user_id: PRO_A, status: "active" },
  ];
  tables["professional_organizations"] = [{ id: ORG, name: "Rowan & Fitch LLP" }];
  tables["delegation_audit_events"] = [];
  tables["persons"] = [
    {
      user_id: PRINCIPAL_A,
      legal_first_name: "Jane",
      legal_last_name: "Smith",
      email: "jane@example.com",
      phone: "555-0100",
      city: "Chicago",
      kyc_status: "approved",
      aml_status: "approved",
      onboarding_state: "verified",
    },
    { user_id: PRINCIPAL_B, legal_first_name: "Bob", legal_last_name: "Other" },
    { user_id: PRO_A, legal_first_name: "Ada", legal_last_name: "Counsel" },
  ];
  tables["profiles"] = [
    { id: PROFILE_A1, user_id: PRINCIPAL_A },
    { id: PROFILE_A2, user_id: PRINCIPAL_A },
    { id: PROFILE_B1, user_id: PRINCIPAL_B },
  ];
  tables["investment_profiles"] = [
    { id: PROFILE_A1, owner_user_id: PRINCIPAL_A, display_label: "Jane Smith", profile_type: "individual", status: "active" },
    { id: PROFILE_A2, owner_user_id: PRINCIPAL_A, display_label: "Smith Holdings LLC", profile_type: "llc", status: "active" },
    { id: PROFILE_B1, owner_user_id: PRINCIPAL_B, display_label: "Bob", profile_type: "individual", status: "active" },
  ];
  tables["offerings"] = [{ id: FUND_A, name: "Fund A", reg_type: "506c" }];
  tables["investor_applications"] = [
    { id: APP_A, user_id: PRINCIPAL_A, offering_id: FUND_A, status: "submitted", commitment_cents: 100000, funding_status: "settled", offerings: { id: FUND_A, name: "Fund A" } },
    { id: APP_B, user_id: PRINCIPAL_B, offering_id: FUND_A, status: "submitted", commitment_cents: 1, funding_status: "settled", offerings: { id: FUND_A, name: "Fund A" } },
  ];
  tables["entity_verifications"] = [];
  tables["assisted_drafts"] = [];
  tables["assisted_draft_events"] = [];
  tables["assisted_documents"] = [];
  tables["assisted_notifications"] = [];
  tables["investor_documents"] = [];
  tables["bank_accounts"] = [
    { id: "bank-a", offering_id: FUND_A, institution_name: "First Bank", account_name: "ops", account_mask: "987654321234", status: "active" },
  ];
  tables["fund_tax_documents"] = [];
  tables["capital_account_statements"] = [];
  tables["profile_accreditations"] = [];
  tables["user_roles"] = [];
}

function delegation(over: Record<string, any>, caps: string[]): string {
  const id = `d${tables["delegations"]!.length + 1}`;
  tables["delegations"]!.push({
    id,
    principal_user_id: PRINCIPAL_A,
    delegate_user_id: PRO_A,
    organization_id: ORG,
    scope_type: "person",
    scope_id: PRINCIPAL_A,
    authority_level: "assist",
    status: "active",
    acceptance_state: "not_required", // DB default (NOT NULL)
    effective_at: past,
    expires_at: null,
    revoked_at: null,
    last_used_at: null,
    ...over,
  });
  for (const capability of caps) {
    tables["delegation_permissions"]!.push({ delegation_id: id, capability });
  }
  return id;
}

function builder(table: string) {
  const all = () => (tables[table] ??= []);
  let filters: ((row: any) => boolean)[] = [];
  const matched = () => all().filter((row) => filters.every((f) => f(row)));

  const api: any = {
    select: () => api,
    order: () => api,
    limit: () => api,
    in: (col: string, vals: unknown[]) => {
      filters.push((r) => vals.includes(r[col]));
      return api;
    },
    eq: (col: string, val: unknown) => {
      filters.push((r) => r[col] === val);
      return api;
    },
    maybeSingle: () => Promise.resolve({ data: matched()[0] ?? null, error: null }),
    then: (resolve: any) => resolve({ data: matched(), error: null }),
    insert: (payload: any) => {
      const rows = Array.isArray(payload) ? payload : [payload];
      const created = rows.map((r) => ({ id: r.id ?? nextId(), created_at: new Date().toISOString(), ...r }));
      all().push(...created);
      filters = [(r) => created.includes(r)];
      return api;
    },
    update: (payload: any) => {
      const target = matched();
      for (const row of target) Object.assign(row, payload);
      return api;
    },
    delete: () => api,
  };
  return api;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (table: string) => builder(table) },
}));

import {
  draftHistory,
  listPreparedForMe,
  prepareDraft,
  recordAssistedUpload,
  reviewDraft,
} from "./assisted-actions.server";
import { canAct } from "./delegated-access.server";
import { buildDelegatedClientView } from "./professional-access.server";
import { PHASE_3B_CAPABILITIES } from "./professional-model";
import { PROTECTED_FIELDS, sanitizeAssistedPayload } from "./assisted-fields";
import { SIGNED_AUTHORITY_REQUIRED } from "./delegation-model";

const ASSIST_ALL = [
  "view_profile",
  "view_investments",
  "edit_profile_info",
  "prepare_investment",
  "upload_documents",
  "assist_kyc",
  "assist_kyb",
  "assist_accreditation",
];

beforeEach(reset);

describe("Phase 3A hardening — banking and wire stay closed", () => {
  it("refuses banking and wire capabilities with signed_authority_required", async () => {
    const id = delegation({ authority_level: "limited_proxy" }, [
      "view_investments",
      "view_banking_info",
      "view_wire_instructions",
    ]);
    expect(id).toBeTruthy();
    const banking = await canAct(PRO_A, "view_banking_info", { type: "investment", id: APP_A });
    const wire = await canAct(PRO_A, "view_wire_instructions", { type: "fund", id: FUND_A });
    expect(banking.allowed).toBe(false);
    expect(banking.reason).toBe(SIGNED_AUTHORITY_REQUIRED);
    expect(wire.allowed).toBe(false);
    expect(wire.reason).toBe(SIGNED_AUTHORITY_REQUIRED);
  });

  it("exposes no banking even when the capability was inserted manually", async () => {
    const id = delegation({ authority_level: "transaction_authority" }, [
      "view_investments",
      "view_banking_info",
    ]);
    const view = await buildDelegatedClientView(PRO_A, id);
    expect(view.banking).toEqual([]);
    expect(JSON.stringify(view)).not.toContain("987654321234");
  });

  it("refuses signing and money movement outright", async () => {
    delegation({ authority_level: "transaction_authority" }, [
      "sign_specified_documents",
      "initiate_investment",
    ]);
    for (const cap of ["sign_specified_documents", "initiate_investment"]) {
      const res = await canAct(PRO_A, cap, { type: "investment", id: APP_A }, { mutation: true });
      expect(res.allowed).toBe(false);
      expect(res.reason).toBe(SIGNED_AUTHORITY_REQUIRED);
    }
  });
});

describe("preparing requires the right permission and scope", () => {
  it("refuses a view-only delegation", async () => {
    const id = delegation({ authority_level: "view" }, ["view_profile"]);
    await expect(
      prepareDraft(PRO_A, { delegationId: id, draftType: "profile_contact", payload: { phone: "1" } }),
    ).rejects.toThrow(/Forbidden/);
  });

  it("refuses assist permission used outside its scope", async () => {
    const id = delegation(
      { scope_type: "investment_profile", scope_id: PROFILE_A1 },
      ["edit_profile_info"],
    );
    await expect(
      prepareDraft(PRO_A, {
        delegationId: id,
        draftType: "entity_information",
        targetId: PROFILE_A2,
        payload: { legal_name: "Elsewhere LLC" },
      }),
    ).rejects.toThrow(/Forbidden/);
  });

  it("refuses another principal's profile by id substitution", async () => {
    const id = delegation({}, ASSIST_ALL);
    await expect(
      prepareDraft(PRO_A, {
        delegationId: id,
        draftType: "entity_information",
        targetId: PROFILE_B1,
        payload: { legal_name: "Not yours" },
      }),
    ).rejects.toThrow(/does not belong to this client/);
  });

  it("fails immediately on a revoked, expired or suspended delegation", async () => {
    const revoked = delegation({ status: "revoked", revoked_at: past }, ASSIST_ALL);
    const expired = delegation({ expires_at: past }, ASSIST_ALL);
    const suspended = delegation({ status: "suspended" }, ASSIST_ALL);
    const futureDated = delegation({ effective_at: future }, ASSIST_ALL);
    for (const id of [revoked, expired, suspended, futureDated]) {
      await expect(
        prepareDraft(PRO_A, { delegationId: id, draftType: "profile_contact", payload: { phone: "1" } }),
      ).rejects.toThrow(/Forbidden/);
    }
  });
});

describe("protected fields are unreachable", () => {
  it("refuses any authoritative verification field", async () => {
    const id = delegation({}, ASSIST_ALL);
    for (const field of ["kyc_status", "aml_status", "verified_at", "payment_status", "authority_level"]) {
      await expect(
        prepareDraft(PRO_A, {
          delegationId: id,
          draftType: "profile_contact",
          payload: { [field]: "approved" },
        }),
      ).rejects.toThrow(/Forbidden/);
    }
  });

  it("refuses an unknown column outright", async () => {
    const id = delegation({}, ASSIST_ALL);
    await expect(
      prepareDraft(PRO_A, {
        delegationId: id,
        draftType: "profile_contact",
        payload: { is_admin: true },
      }),
    ).rejects.toThrow(/Forbidden/);
  });

  it("cannot mark an accreditation verified", async () => {
    const id = delegation({}, ASSIST_ALL);
    await expect(
      prepareDraft(PRO_A, {
        delegationId: id,
        draftType: "accreditation",
        targetId: PROFILE_A1,
        payload: { basis: "income", status: "approved" },
      }),
    ).rejects.toThrow(/Forbidden/);
    for (const field of ["kyc_status", "aml_status", "kyb_status", "accreditation_status", "verified_at"]) {
      expect(PROTECTED_FIELDS).toContain(field);
    }
  });

  it("keeps the allowlist closed for every draft type", () => {
    expect(() => sanitizeAssistedPayload("kyc_support", { kyc_status: "approved" })).toThrow();
    expect(() => sanitizeAssistedPayload("investment", { funding_status: "settled" })).toThrow();
    expect(sanitizeAssistedPayload("profile_contact", { phone: "555" }).values).toEqual({ phone: "555" });
  });
});

describe("draft → client review → approval", () => {
  it("prepares an item, notifies the client and changes nothing yet", async () => {
    const id = delegation({}, ASSIST_ALL);
    const draft = await prepareDraft(PRO_A, {
      delegationId: id,
      draftType: "profile_contact",
      payload: { phone: "555-0199", city: "Evanston" },
      note: "New address from the client's letter.",
    });
    expect(draft.status).toBe("awaiting_client_review");
    expect(tables["persons"]!.find((p) => p.user_id === PRINCIPAL_A)!.phone).toBe("555-0100");
    expect(tables["assisted_notifications"]).toHaveLength(1);

    const queue = await listPreparedForMe(PRINCIPAL_A);
    expect(queue).toHaveLength(1);
    expect(queue[0]!.firm).toBe("Rowan & Fitch LLP");
    expect(queue[0]!.before).toEqual({ phone: "555-0100", city: "Chicago" });
  });

  it("refuses to let the professional approve their own preparation", async () => {
    const id = delegation({}, ASSIST_ALL);
    const draft = await prepareDraft(PRO_A, {
      delegationId: id,
      draftType: "profile_contact",
      payload: { phone: "555-0199" },
    });
    await expect(reviewDraft(PRO_A, draft.id, "approve")).rejects.toThrow(/only the client/);
    await expect(reviewDraft(PRINCIPAL_B, draft.id, "approve")).rejects.toThrow(/only the client/);
    expect(tables["persons"]!.find((p) => p.user_id === PRINCIPAL_A)!.phone).toBe("555-0100");
  });

  it("records the client as the approver and applies only allowlisted fields", async () => {
    const id = delegation({}, ASSIST_ALL);
    const draft = await prepareDraft(PRO_A, {
      delegationId: id,
      draftType: "profile_contact",
      payload: { phone: "555-0199" },
    });
    const result = await reviewDraft(PRINCIPAL_A, draft.id, "approve", "Looks right.");
    expect(result.status).toBe("approved");

    const person = tables["persons"]!.find((p) => p.user_id === PRINCIPAL_A)!;
    expect(person.phone).toBe("555-0199");
    expect(person.kyc_status).toBe("approved");

    const row = tables["assisted_drafts"]![0]!;
    expect(row.reviewed_by_user_id).toBe(PRINCIPAL_A);
    expect(row.reviewed_by_user_id).not.toBe(PRO_A);

    const history = await draftHistory(PRINCIPAL_A, draft.id);
    expect(history.map((e: any) => e.action).sort()).toEqual(["approve", "prepared"]);
    expect(history.some((e: any) => e.actor_kind === "client")).toBe(true);
  });

  it("changes nothing when the client rejects or asks for changes", async () => {
    const id = delegation({}, ASSIST_ALL);
    const rejected = await prepareDraft(PRO_A, {
      delegationId: id,
      draftType: "profile_contact",
      payload: { phone: "555-9999" },
    });
    await reviewDraft(PRINCIPAL_A, rejected.id, "reject", "Wrong number.");
    expect(tables["persons"]!.find((p) => p.user_id === PRINCIPAL_A)!.phone).toBe("555-0100");
    await expect(reviewDraft(PRINCIPAL_A, rejected.id, "approve")).rejects.toThrow(/already been decided/);

    const changes = await prepareDraft(PRO_A, {
      delegationId: id,
      draftType: "profile_contact",
      payload: { city: "Madison" },
    });
    await reviewDraft(PRINCIPAL_A, changes.id, "request_changes", "Which address?");
    expect(tables["persons"]!.find((p) => p.user_id === PRINCIPAL_A)!.city).toBe("Chicago");
  });

  it("never writes an authoritative record for identity, entity or investment preparation", async () => {
    const id = delegation({}, ASSIST_ALL);
    const kyc = await prepareDraft(PRO_A, {
      delegationId: id,
      draftType: "kyc_support",
      payload: { note: "Passport collected." },
    });
    await reviewDraft(PRINCIPAL_A, kyc.id, "approve");
    const person = tables["persons"]!.find((p) => p.user_id === PRINCIPAL_A)!;
    expect(person.kyc_status).toBe("approved");
    expect(person.onboarding_state).toBe("verified");

    const investment = await prepareDraft(PRO_A, {
      delegationId: id,
      draftType: "investment",
      targetId: PROFILE_A1,
      payload: { offering_id: FUND_A, commitment_cents: 2500000 },
    });
    await reviewDraft(PRINCIPAL_A, investment.id, "approve");
    expect(tables["investor_applications"]!.find((a) => a.id === APP_A)!.commitment_cents).toBe(100000);
    expect(tables["investor_applications"]).toHaveLength(2);
  });
});

describe("assisted uploads", () => {
  it("keeps the full agency chain on every upload", async () => {
    const id = delegation({}, ASSIST_ALL);
    await recordAssistedUpload(PRO_A, {
      delegationId: id,
      targetType: "investment",
      targetId: APP_A,
      storagePath: "fund/a/doc.pdf",
      originalFilename: "subscription.pdf",
      classification: "subscription",
    });
    const row = tables["assisted_documents"]![0]!;
    expect(row).toMatchObject({
      delegation_id: id,
      organization_id: ORG,
      uploaded_by_user_id: PRO_A,
      principal_user_id: PRINCIPAL_A,
      resource_type: "investment",
      resource_id: APP_A,
      original_filename: "subscription.pdf",
      classification: "subscription",
    });
    expect(row.created_at).toBeTruthy();
  });

  it("cannot upload to an investment outside the delegation's scope", async () => {
    const id = delegation({ scope_type: "investment", scope_id: APP_A }, ASSIST_ALL);
    await expect(
      recordAssistedUpload(PRO_A, {
        delegationId: id,
        targetType: "investment",
        targetId: APP_B,
        storagePath: "x",
        originalFilename: "other.pdf",
        classification: "other",
      }),
    ).rejects.toThrow(/Forbidden/);
    expect(tables["assisted_documents"]).toHaveLength(0);
  });

  it("refuses uploads without the upload permission", async () => {
    const id = delegation({}, ["view_profile", "edit_profile_info"]);
    await expect(
      recordAssistedUpload(PRO_A, {
        delegationId: id,
        targetType: "investment",
        targetId: APP_A,
        storagePath: "x",
        originalFilename: "x.pdf",
        classification: "other",
      }),
    ).rejects.toThrow(/does not allow uploads/);
  });
});

describe("Phase 3B activation limits", () => {
  it("activates preparing only — never signing, deciding or paying", () => {
    expect(PHASE_3B_CAPABILITIES.sort()).toEqual(
      [
        "assist_accreditation",
        "assist_kyb",
        "assist_kyc",
        "edit_profile_info",
        "prepare_investment",
        "upload_documents",
      ].sort(),
    );
    for (const forbidden of [
      "sign_specified_documents",
      "initiate_investment",
      "approve_specified_actions",
      "view_banking_info",
      "view_wire_instructions",
    ]) {
      expect(PHASE_3B_CAPABILITIES).not.toContain(forbidden as never);
    }
  });
});
