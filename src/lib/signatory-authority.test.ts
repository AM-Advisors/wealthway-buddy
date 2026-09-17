import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 3C adversarial tests — delegated signing.
 *
 * Each case asks the same question: with the screen out of the picture, what
 * will the server actually allow? Signing must fail closed unless every single
 * link of the chain is present and current.
 */

const PRINCIPAL_A = "11111111-1111-4111-8111-00000000000a";
const PRINCIPAL_B = "11111111-1111-4111-8111-00000000000b";
const PRO_A = "22222222-2222-4222-8222-00000000000a";
const PRO_B = "22222222-2222-4222-8222-00000000000b";
const STAFF = "99999999-9999-4999-8999-000000000001";
const ORG = "33333333-3333-4333-8333-00000000000a";
const PROFILE_A1 = "44444444-4444-4444-8444-000000000001";
const PROFILE_A2 = "44444444-4444-4444-8444-000000000002";
const PROFILE_B1 = "44444444-4444-4444-8444-00000000000b";
const FUND_A = "55555555-5555-4555-8555-00000000000a";
const FUND_B = "55555555-5555-4555-8555-00000000000b";
const APP_A = "66666666-6666-4666-8666-00000000000a";

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
  tables["delegation_audit_events"] = [];
  tables["delegation_acceptance_events"] = [];
  tables["authority_documents"] = [];
  tables["authority_notifications"] = [];
  tables["stepup_authentications"] = [];
  tables["delegated_signatures"] = [];
  tables["professional_memberships"] = [
    { id: "m1", organization_id: ORG, user_id: PRO_A, status: "active", seat_role: "member" },
    { id: "m2", organization_id: ORG, user_id: PRO_B, status: "active", seat_role: "member" },
  ];
  tables["professional_organizations"] = [
    {
      id: ORG,
      name: "Rowan & Fitch LLP",
      org_type: "law_firm",
      verification_status: "verified",
      reverification_due_at: null,
    },
  ];
  tables["professional_credentials"] = [
    {
      id: "c1",
      user_id: PRO_A,
      credential_type: "attorney_bar",
      status: "verified",
      expires_at: null,
    },
  ];
  tables["persons"] = [
    { user_id: PRINCIPAL_A, legal_first_name: "Jane", legal_last_name: "Smith" },
    { user_id: PRINCIPAL_B, legal_first_name: "Bob", legal_last_name: "Other" },
    { user_id: PRO_A, legal_first_name: "Ada", legal_last_name: "Counsel" },
    { user_id: PRO_B, legal_first_name: "Otto", legal_last_name: "Other" },
  ];
  tables["investment_profiles"] = [
    { id: PROFILE_A1, owner_user_id: PRINCIPAL_A, display_label: "Jane Smith" },
    { id: PROFILE_A2, owner_user_id: PRINCIPAL_A, display_label: "Smith Holdings LLC" },
    { id: PROFILE_B1, owner_user_id: PRINCIPAL_B, display_label: "Bob" },
  ];
  tables["profiles"] = [];
  tables["offerings"] = [
    { id: FUND_A, name: "Fund A" },
    { id: FUND_B, name: "Fund B" },
  ];
  tables["investor_applications"] = [
    { id: APP_A, user_id: PRINCIPAL_A, offering_id: FUND_A },
  ];
  tables["user_roles"] = [{ user_id: STAFF, role: "compliance" }];
  tables["bank_accounts"] = [];
}

function builder(table: string) {
  const all = () => (tables[table] ??= []);
  let filters: ((row: any) => boolean)[] = [];
  let pendingUpdate: any = null;
  const matched = () => all().filter((row) => filters.every((f) => f(row)));

  const settle = () => {
    if (pendingUpdate) {
      for (const row of matched()) Object.assign(row, pendingUpdate);
      pendingUpdate = null;
    }
    return matched();
  };

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
    maybeSingle: () => Promise.resolve({ data: settle()[0] ?? null, error: null }),
    then: (resolve: any) => resolve({ data: settle(), error: null }),
    insert: (payload: any) => {
      const rows = Array.isArray(payload) ? payload : [payload];
      const created = rows.map((r) => ({
        id: r.id ?? nextId(),
        created_at: new Date().toISOString(),
        ...r,
      }));
      all().push(...created);
      filters = [(r) => created.includes(r)];
      return api;
    },
    // Deferred so that `.update(x).eq("id", id)` narrows before applying.
    update: (payload: any) => {
      pendingUpdate = payload;
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
  acceptDelegation,
  beginSigningStepUp,
  resolveSignatoryAuthority,
  reviewAuthorityDocument,
  revokeSignatoryAuthority,
  signAsAuthorizedSignatory,
  submitAuthorityDocument,
  verifySigningStepUp,
} from "@/lib/signatory-authority.server";
import { DELEGATION_TERMS_VERSION, DENY_CODES } from "@/lib/signatory-model";
import { canAct } from "@/lib/delegated-access.server";

function delegation(over: Record<string, any> = {}, caps = ["sign_specified_documents"]): string {
  const id = `d${tables["delegations"]!.length + 1}`;
  tables["delegations"]!.push({
    id,
    principal_user_id: PRINCIPAL_A,
    delegate_user_id: PRO_A,
    organization_id: ORG,
    scope_type: "investment_profile",
    scope_id: PROFILE_A2,
    authority_level: "authorized_signatory",
    acceptance_state: "accepted",
    accepted_at: past,
    accepted_by: PRO_A,
    grant_version: 1,
    covered_document_types: [],
    status: "active",
    effective_at: past,
    expires_at: null,
    revoked_at: null,
    ...over,
  });
  for (const capability of caps) {
    tables["delegation_permissions"]!.push({ delegation_id: id, capability });
  }
  return id;
}

function authorityDoc(delegationId: string, over: Record<string, any> = {}) {
  const row = {
    id: `ad${tables["authority_documents"]!.length + 1}`,
    delegation_id: delegationId,
    principal_user_id: PRINCIPAL_A,
    delegate_user_id: PRO_A,
    organization_id: ORG,
    document_type: "power_of_attorney",
    file_name: "poa.pdf",
    scope_type: "investment_profile",
    scope_id: PROFILE_A2,
    covered_document_types: ["subscription_agreement"],
    covered_actions: ["sign_specified_documents"],
    review_status: "accepted",
    effective_at: past,
    expires_at: null,
    revoked_at: null,
    ...over,
  };
  tables["authority_documents"]!.push(row);
  return row.id;
}

const target = {
  profileId: PROFILE_A2,
  fundId: null,
  investmentId: null,
  documentType: "subscription_agreement",
};

async function fullySign(delegationId: string) {
  const { challengeId } = await beginSigningStepUp(PRO_A, {
    delegationId,
    resourceType: "investment_profile",
    resourceId: PROFILE_A2,
  });
  const note = tables["authority_notifications"]!.filter((n) => n.kind === "step_up_challenge").pop();
  const code = /(\d{6})/.exec(note!.message)![1]!;
  await verifySigningStepUp(PRO_A, challengeId, code);
  return signAsAuthorizedSignatory(PRO_A, {
    delegationId,
    stepUpId: challengeId,
    ...target,
    documentHash: "hash-0123456789",
    documentName: "Fund A subscription",
  });
}

beforeEach(reset);

describe("signing authority is rebuilt from records, never asserted", () => {
  it("allows a complete, current chain", async () => {
    const d = delegation();
    authorityDoc(d);
    const decision = await resolveSignatoryAuthority(PRO_A, d, target);
    expect(decision.allowed).toBe(true);
  });

  it("refuses an unverified firm", async () => {
    tables["professional_organizations"]![0]!.verification_status = "submitted";
    const d = delegation();
    authorityDoc(d);
    expect((await resolveSignatoryAuthority(PRO_A, d, target)).code).toBe(
      DENY_CODES.orgUnverified,
    );
  });

  it("refuses a firm whose re-verification has lapsed", async () => {
    tables["professional_organizations"]![0]!.reverification_due_at = past;
    const d = delegation();
    authorityDoc(d);
    expect((await resolveSignatoryAuthority(PRO_A, d, target)).code).toBe(
      DENY_CODES.orgUnverified,
    );
  });

  it("gives a seat at the firm no signing power of its own", async () => {
    const decision = await resolveSignatoryAuthority(PRO_A, "no-such-delegation", target);
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe(DENY_CODES.noDelegation);
  });

  it("refuses a suspended member of the firm", async () => {
    tables["professional_memberships"]![0]!.status = "suspended";
    const d = delegation();
    authorityDoc(d);
    expect((await resolveSignatoryAuthority(PRO_A, d, target)).code).toBe(DENY_CODES.membership);
  });

  it("refuses a law-firm signer with no verified bar credential", async () => {
    tables["professional_credentials"]![0]!.status = "submitted";
    const d = delegation();
    authorityDoc(d);
    expect((await resolveSignatoryAuthority(PRO_A, d, target)).code).toBe(DENY_CODES.credential);
  });

  it("refuses an expired credential", async () => {
    tables["professional_credentials"]![0]!.expires_at = past;
    const d = delegation();
    authorityDoc(d);
    expect((await resolveSignatoryAuthority(PRO_A, d, target)).code).toBe(DENY_CODES.credential);
  });

  it("refuses a delegation the professional has not accepted", async () => {
    const d = delegation({ acceptance_state: "awaiting_acceptance" });
    authorityDoc(d);
    expect((await resolveSignatoryAuthority(PRO_A, d, target)).code).toBe(DENY_CODES.notAccepted);
  });

  it("refuses after a material change until it is accepted again", async () => {
    const d = delegation({ acceptance_state: "renewal_required" });
    authorityDoc(d);
    expect((await resolveSignatoryAuthority(PRO_A, d, target)).code).toBe(
      DENY_CODES.renewalRequired,
    );
  });

  it("refuses with no authority document at all", async () => {
    const d = delegation();
    expect((await resolveSignatoryAuthority(PRO_A, d, target)).code).toBe(
      DENY_CODES.noAuthorityDocument,
    );
  });

  it("refuses an uploaded but unreviewed authority document", async () => {
    const d = delegation();
    authorityDoc(d, { review_status: "uploaded" });
    expect((await resolveSignatoryAuthority(PRO_A, d, target)).code).toBe(
      DENY_CODES.noAuthorityDocument,
    );
  });

  it("refuses an expired or revoked authority document", async () => {
    const d = delegation();
    authorityDoc(d, { expires_at: past });
    expect((await resolveSignatoryAuthority(PRO_A, d, target)).code).toBe(
      DENY_CODES.noAuthorityDocument,
    );
    tables["authority_documents"] = [];
    authorityDoc(d, { revoked_at: past });
    expect((await resolveSignatoryAuthority(PRO_A, d, target)).code).toBe(
      DENY_CODES.noAuthorityDocument,
    );
  });
});

describe("scope is never inferred", () => {
  it("authority over one entity cannot sign for another of the same client", async () => {
    const d = delegation();
    authorityDoc(d);
    const decision = await resolveSignatoryAuthority(PRO_A, d, {
      ...target,
      profileId: PROFILE_A1,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe(DENY_CODES.scope);
  });

  it("a substituted id from another client fails", async () => {
    const d = delegation();
    authorityDoc(d);
    const decision = await resolveSignatoryAuthority(PRO_A, d, {
      ...target,
      profileId: PROFILE_B1,
    });
    expect(decision.allowed).toBe(false);
  });

  it("authority for one fund cannot sign for another", async () => {
    const d = delegation({ scope_type: "fund", scope_id: FUND_A });
    authorityDoc(d, { scope_type: "fund", scope_id: FUND_A });
    const ok = await resolveSignatoryAuthority(PRO_A, d, {
      profileId: null,
      fundId: FUND_A,
      investmentId: null,
      documentType: "subscription_agreement",
    });
    expect(ok.allowed).toBe(true);
    const bad = await resolveSignatoryAuthority(PRO_A, d, {
      profileId: null,
      fundId: FUND_B,
      investmentId: null,
      documentType: "subscription_agreement",
    });
    expect(bad.allowed).toBe(false);
  });

  it("authority for one document type cannot sign another", async () => {
    const d = delegation();
    authorityDoc(d);
    const decision = await resolveSignatoryAuthority(PRO_A, d, {
      ...target,
      documentType: "transfer_agreement",
    });
    expect(decision.code).toBe(DENY_CODES.documentType);
  });

  it("a delegation naming document types narrows the authority document", async () => {
    const d = delegation({ covered_document_types: ["nda"] });
    authorityDoc(d);
    expect((await resolveSignatoryAuthority(PRO_A, d, target)).code).toBe(
      DENY_CODES.documentType,
    );
  });

  it("another professional cannot use someone else's delegation", async () => {
    const d = delegation();
    authorityDoc(d);
    expect((await resolveSignatoryAuthority(PRO_B, d, target)).code).toBe(
      DENY_CODES.noDelegation,
    );
  });
});

describe("authority level and permission are both required", () => {
  it.each(["view", "assist", "limited_proxy"])("%s authority cannot sign", async (level) => {
    const d = delegation({ authority_level: level });
    authorityDoc(d);
    expect((await resolveSignatoryAuthority(PRO_A, d, target)).code).toBe(DENY_CODES.authority);
  });

  it("signatory authority without the signing permission cannot sign", async () => {
    const d = delegation({}, ["view_documents"]);
    authorityDoc(d);
    expect((await resolveSignatoryAuthority(PRO_A, d, target)).code).toBe(DENY_CODES.capability);
  });

  it("the signing permission without signatory authority cannot sign", async () => {
    const d = delegation({ authority_level: "assist" }, ["sign_specified_documents"]);
    authorityDoc(d);
    expect((await resolveSignatoryAuthority(PRO_A, d, target)).code).toBe(DENY_CODES.authority);
  });

  it("an expired or revoked delegation cannot sign", async () => {
    const expired = delegation({ expires_at: past });
    authorityDoc(expired);
    expect((await resolveSignatoryAuthority(PRO_A, expired, target)).code).toBe(
      DENY_CODES.noDelegation,
    );
    const revoked = delegation({ revoked_at: past });
    authorityDoc(revoked);
    expect((await resolveSignatoryAuthority(PRO_A, revoked, target)).code).toBe(
      DENY_CODES.noDelegation,
    );
  });
});

describe("step-up authentication", () => {
  it("a stale session alone cannot sign", async () => {
    const d = delegation();
    authorityDoc(d);
    await expect(
      signAsAuthorizedSignatory(PRO_A, {
        delegationId: d,
        stepUpId: "never-challenged",
        ...target,
        documentHash: "hash-0123456789",
      }),
    ).rejects.toThrow(/Confirm your identity/);
  });

  it("a wrong code never verifies", async () => {
    const d = delegation();
    authorityDoc(d);
    const { challengeId } = await beginSigningStepUp(PRO_A, {
      delegationId: d,
      resourceType: "investment_profile",
      resourceId: PROFILE_A2,
    });
    await expect(verifySigningStepUp(PRO_A, challengeId, "000000")).rejects.toThrow(/not correct/);
    await expect(
      signAsAuthorizedSignatory(PRO_A, {
        delegationId: d,
        stepUpId: challengeId,
        ...target,
        documentHash: "hash-0123456789",
      }),
    ).rejects.toThrow(/Confirm your identity/);
  });

  it("a challenge opened for one entity cannot sign for another", async () => {
    const d = delegation({ scope_type: "person", scope_id: PRINCIPAL_A });
    authorityDoc(d, { scope_type: "person", scope_id: PRINCIPAL_A });
    const { challengeId } = await beginSigningStepUp(PRO_A, {
      delegationId: d,
      resourceType: "investment_profile",
      resourceId: PROFILE_A1,
    });
    const note = tables["authority_notifications"]!.filter((n) => n.kind === "step_up_challenge").pop();
    await verifySigningStepUp(PRO_A, challengeId, /(\d{6})/.exec(note!.message)![1]!);
    await expect(
      signAsAuthorizedSignatory(PRO_A, {
        delegationId: d,
        stepUpId: challengeId,
        ...target,
        documentHash: "hash-0123456789",
      }),
    ).rejects.toThrow(/Confirm your identity/);
  });

  it("a challenge cannot be reused", async () => {
    const d = delegation();
    authorityDoc(d);
    const { signatureId } = await fullySign(d);
    expect(signatureId).toBeTruthy();
    const challenge = tables["stepup_authentications"]![0]!;
    await expect(
      signAsAuthorizedSignatory(PRO_A, {
        delegationId: d,
        stepUpId: challenge.id,
        ...target,
        documentHash: "hash-0123456789",
      }),
    ).rejects.toThrow(/Confirm your identity/);
  });
});

describe("the signature record", () => {
  it("keeps the whole agency chain and never presents the professional as the client", async () => {
    const d = delegation();
    const docId = authorityDoc(d);
    const { statement } = await fullySign(d);

    const signature = tables["delegated_signatures"]![0]!;
    expect(signature.signer_user_id).toBe(PRO_A);
    expect(signature.principal_user_id).toBe(PRINCIPAL_A);
    expect(signature.profile_id).toBe(PROFILE_A2);
    expect(signature.organization_id).toBe(ORG);
    expect(signature.delegation_id).toBe(d);
    expect(signature.authority_document_id).toBe(docId);
    expect(signature.document_hash).toBe("hash-0123456789");
    expect(statement).toContain("Ada Counsel");
    expect(statement).toContain("Authorized Signatory");
    expect(statement).toContain("acting on behalf of Smith Holdings LLC");
    expect(statement).toContain("through Rowan & Fitch LLP");

    const audit = tables["delegation_audit_events"]!.find(
      (e) => e.action === "delegated_signature_completed",
    );
    expect(audit).toBeTruthy();
    expect(audit.principal_user_id).toBe(PRINCIPAL_A);
    expect(audit.actor_user_id).toBe(PRO_A);
  });

  it("tells the client a document was signed for them", async () => {
    const d = delegation();
    authorityDoc(d);
    await fullySign(d);
    const note = tables["authority_notifications"]!.find(
      (n) => n.kind === "signature_completed" && n.recipient_user_id === PRINCIPAL_A,
    );
    expect(note).toBeTruthy();
  });

  it("records a refused attempt", async () => {
    const d = delegation({ authority_level: "assist" });
    authorityDoc(d);
    await expect(
      signAsAuthorizedSignatory(PRO_A, {
        delegationId: d,
        stepUpId: "x",
        ...target,
        documentHash: "hash-0123456789",
      }),
    ).rejects.toThrow(/Forbidden/);
    expect(
      tables["delegation_audit_events"]!.some((e) => e.action === "delegated_signature_refused"),
    ).toBe(true);
  });
});

describe("revocation", () => {
  it("blocks future signing but leaves completed signatures untouched", async () => {
    const d = delegation();
    authorityDoc(d);
    await fullySign(d);
    expect(tables["delegated_signatures"]!.length).toBe(1);

    await revokeSignatoryAuthority(PRINCIPAL_A, d, "No longer instructed");

    expect(tables["delegated_signatures"]!.length).toBe(1);
    expect((await resolveSignatoryAuthority(PRO_A, d, target)).allowed).toBe(false);
  });

  it("only the client or staff can revoke", async () => {
    const d = delegation();
    await expect(revokeSignatoryAuthority(PRO_A, d)).rejects.toThrow(/Forbidden/);
  });
});

describe("money and sensitive data stay out of reach", () => {
  it("banking and wire details are refused even for a signatory", async () => {
    const d = delegation({}, ["sign_specified_documents", "view_banking_info", "view_wire_instructions"]);
    authorityDoc(d);
    for (const capability of ["view_banking_info", "view_wire_instructions"]) {
      const result = await canAct(PRO_A, capability, { type: "fund", id: FUND_A });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("signed_authority_required");
    }
  });

  it("money movement can never be a delegated document or action", async () => {
    const d = delegation();
    authorityDoc(d);
    const decision = await resolveSignatoryAuthority(PRO_A, d, {
      ...target,
      documentType: "initiate_outgoing_wire",
    });
    expect(decision.code).toBe(DENY_CODES.blocked);

    await expect(
      submitAuthorityDocument(PRINCIPAL_A, {
        delegationId: d,
        documentType: "power_of_attorney",
        fileName: "poa.pdf",
        storagePath: "authority/poa.pdf",
        coveredDocumentTypes: ["subscription_agreement"],
        coveredActions: ["approve_outgoing_wire"],
      }),
    ).rejects.toThrow(/Money movement/);
  });
});

describe("acceptance and authority review", () => {
  it("accepting records the professional and the stored grant, unchanged", async () => {
    const d = delegation({ acceptance_state: "awaiting_acceptance", accepted_at: null, accepted_by: null });
    await acceptDelegation(PRO_A, d, DELEGATION_TERMS_VERSION);
    const row = tables["delegations"]!.find((r) => r.id === d)!;
    expect(row.acceptance_state).toBe("accepted");
    expect(row.accepted_by).toBe(PRO_A);
    expect(tables["delegation_acceptance_events"]!.length).toBe(1);
  });

  it("a professional cannot accept someone else's delegation", async () => {
    const d = delegation({ acceptance_state: "awaiting_acceptance" });
    await expect(acceptDelegation(PRO_B, d, DELEGATION_TERMS_VERSION)).rejects.toThrow(/Forbidden/);
  });

  it("a professional cannot approve their own authority document", async () => {
    const d = delegation();
    const docId = authorityDoc(d, { review_status: "uploaded" });
    await expect(reviewAuthorityDocument(PRO_A, docId, "accept")).rejects.toThrow(/Forbidden/);
    expect(tables["authority_documents"]![0]!.review_status).toBe("uploaded");
  });

  it("staff acceptance turns signing on, and revocation turns it off", async () => {
    const d = delegation();
    const docId = authorityDoc(d, { review_status: "uploaded" });
    expect((await resolveSignatoryAuthority(PRO_A, d, target)).allowed).toBe(false);

    await reviewAuthorityDocument(STAFF, docId, "accept");
    expect((await resolveSignatoryAuthority(PRO_A, d, target)).allowed).toBe(true);

    await reviewAuthorityDocument(STAFF, docId, "revoke");
    expect((await resolveSignatoryAuthority(PRO_A, d, target)).allowed).toBe(false);
  });
});
