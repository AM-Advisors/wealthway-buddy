import { describe, expect, it } from "vitest";

import {
  executionState,
  outstandingRequestIsStale,
  publicSigner,
  refuseSession,
  requiredCapacities,
  signerStatusFromBox,
  staffActionAllowed,
} from "@/lib/document-signing";
import { resolveSigning, signerRowFor, SigningRefusal } from "@/lib/document-signing.server";

// --- tiny Supabase stand-in -------------------------------------------------

type Row = Record<string, any>;

function fakeDb(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const api: any = {
        select: () => api,
        order: () => api,
        eq: (column: string, value: unknown) => {
          rows = rows.filter((r) => r[column] === value);
          return api;
        },
        in: (column: string, values: unknown[]) => {
          rows = rows.filter((r) => values.includes(r[column]));
          return api;
        },
        maybeSingle: async () => ({ data: rows[0] ?? null }),
        then: (resolve: (v: any) => unknown) => resolve({ data: rows }),
      };
      return api;
    },
  };
}

const INVESTOR_A = "user-a";
const INVESTOR_B = "user-b";

function world() {
  return fakeDb({
    investor_applications: [
      { id: "app-a", offering_id: "fund-1", user_id: INVESTOR_A },
      { id: "app-b", offering_id: "fund-2", user_id: INVESTOR_B },
    ],
    offering_documents: [
      { id: "doc-1", title: "LPA", body: "", doc_type: "lpa", requires_signature: true, file_path: null, offering_id: "fund-1" },
      { id: "doc-2", title: "Other LPA", body: "", doc_type: "lpa", requires_signature: true, file_path: null, offering_id: "fund-2" },
    ],
    offerings: [
      { id: "fund-1", name: "Fund One", reg_type: "reg_d" },
      { id: "fund-2", name: "Fund Two", reg_type: "reg_d" },
    ],
    subscriptions: [{ application_id: "app-a", commitment_cents: 100_000, tax_classification: "trust" }],
    profiles: [{ user_id: INVESTOR_A, legal_name: "A Investor", email: "a@example.com" }],
    investor_onboardings: [{ application_id: "app-a", investment_profile_id: "profile-a" }],
    document_signatures: [
      { id: "sig-1", application_id: "app-a", offering_document_id: "doc-1", provider_agreement_id: "box-1" },
    ],
    document_signature_signers: [
      {
        id: "signer-1",
        signature_id: "sig-1",
        signer_user_id: INVESTOR_A,
        signer_email: "a@example.com",
        signer_name: "A Investor",
        signer_capacity: "trustee",
        status: "sent",
        required: true,
        signing_order: 1,
        provider_embed_url: "https://box.example/secret-embed",
        provider_signer_id: "box-signer-1",
      },
    ],
  });
}

describe("who may open a signing session", () => {
  it("refuses another investor's agreement", async () => {
    const db = world();
    await expect(
      resolveSigning(db, db, INVESTOR_B, { applicationId: "app-a", offeringDocumentId: "doc-1" }),
    ).rejects.toBeInstanceOf(SigningRefusal);
  });

  it("refuses a document that belongs to a different fund", async () => {
    const db = world();
    await expect(
      resolveSigning(db, db, INVESTOR_A, { applicationId: "app-a", offeringDocumentId: "doc-2" }),
    ).rejects.toMatchObject({ reason: "document_not_in_offering" });
  });

  it("refuses an invented document id", async () => {
    const db = world();
    await expect(
      resolveSigning(db, db, INVESTOR_A, { applicationId: "app-a", offeringDocumentId: "doc-nope" }),
    ).rejects.toMatchObject({ reason: "document_not_in_offering" });
  });

  it("resolves the investor's own agreement with their investment profile", async () => {
    const db = world();
    const resolved = await resolveSigning(db, db, INVESTOR_A, {
      applicationId: "app-a",
      offeringDocumentId: "doc-1",
    });
    expect(resolved.document.title).toBe("LPA");
    expect(resolved.investmentProfileId).toBe("profile-a");
    expect(resolved.signers).toHaveLength(1);
  });

  it("matches the signer row on identity, not email alone", () => {
    const signers = [
      { id: "x", signer_user_id: "someone-else", signer_email: "a@example.com" },
      { id: "y", signer_user_id: INVESTOR_A, signer_email: "different@example.com" },
    ];
    expect(signerRowFor(signers, INVESTOR_A, "a@example.com")?.id).toBe("y");
  });
});

describe("session refusal rules", () => {
  const base = {
    applicationBelongsToUser: true,
    documentInOffering: true,
    hasSubscription: true,
    requiresSignature: true,
    isRequiredSigner: true,
    providerConfigured: true,
  };

  it("allows a required signer with everything in place", () => {
    expect(refuseSession(base)).toBeNull();
  });

  it("refuses someone who is not a required signer", () => {
    expect(refuseSession({ ...base, isRequiredSigner: false })).toBe("not_a_required_signer");
  });

  it("refuses a second signature from the same person", () => {
    expect(refuseSession({ ...base, signerStatus: "signed" })).toBe("already_signed");
  });

  it("refuses an expired or cancelled request", () => {
    expect(refuseSession({ ...base, signerStatus: "expired" })).toBe("request_expired");
    expect(refuseSession({ ...base, signerStatus: "cancelled" })).toBe("request_cancelled");
  });

  it("refuses when the source document moved on since the request was sent", () => {
    expect(
      refuseSession({ ...base, lockedSourceVersionId: "v1", currentSourceVersionId: "v2" }),
    ).toBe("version_superseded");
  });
});

describe("document version locking", () => {
  it("treats an outstanding request as stale once the source version changes", () => {
    expect(
      outstandingRequestIsStale({ lockedSourceVersionId: "v1", currentSourceVersionId: "v2" }),
    ).toBe(true);
  });

  it("leaves an outstanding request alone when the version is unchanged", () => {
    expect(
      outstandingRequestIsStale({ lockedSourceVersionId: "v1", currentSourceVersionId: "v1" }),
    ).toBe(false);
  });
});

describe("execution state comes only from signer rows", () => {
  it("is never executed with no signers", () => {
    expect(executionState([])).toBe("not_sent");
  });

  it("waits for every required signer", () => {
    expect(
      executionState([
        { status: "signed", required: true },
        { status: "sent", required: true },
      ]),
    ).toBe("partially_signed");
  });

  it("is executed only when all required signers have signed", () => {
    expect(
      executionState([
        { status: "signed", required: true },
        { status: "signed", required: true },
        { status: "pending", required: false },
      ]),
    ).toBe("executed");
  });

  it("never reads a closed browser window as a signature", () => {
    expect(executionState([{ status: "viewed", required: true }])).toBe("out_for_signature");
  });

  it("never invents a signature from a request status", () => {
    expect(signerStatusFromBox("created")).toBe("sent");
    expect(signerStatusFromBox("signed")).toBe("signed");
    expect(signerStatusFromBox("completed", { decision: "declined" })).toBe("declined");
  });
});

describe("required signers by investing profile", () => {
  it("asks a trust for a trustee", () => {
    expect(requiredCapacities("trust")).toEqual(["trustee"]);
  });
  it("asks an LLC for an authorized signatory", () => {
    expect(requiredCapacities("llc")).toEqual(["authorized_signatory"]);
  });
  it("asks joint owners to sign", () => {
    expect(requiredCapacities("joint_tenants")).toEqual(["joint_owner"]);
  });
});

describe("staff actions", () => {
  const executed = "executed" as const;

  it("lets a preparer resend an outstanding request", () => {
    expect(
      staffActionAllowed({
        action: "resend",
        capabilities: ["documents:see", "documents:prepare"],
        executionState: "out_for_signature",
      }).allowed,
    ).toBe(true);
  });

  it("gives view-only staff nothing to do", () => {
    expect(
      staffActionAllowed({
        action: "resend",
        capabilities: ["documents:see"],
        executionState: "out_for_signature",
      }).allowed,
    ).toBe(false);
    expect(
      staffActionAllowed({
        action: "cancel",
        capabilities: ["documents:see"],
        executionState: "out_for_signature",
      }).allowed,
    ).toBe(false);
  });

  it("never rewrites an executed agreement", () => {
    expect(
      staffActionAllowed({
        action: "cancel",
        capabilities: ["documents:see", "documents:prepare", "documents:review"],
        executionState: executed,
      }).allowed,
    ).toBe(false);
  });
});

describe("what a browser may see about a signer", () => {
  it("never exposes Box ids or embed links", () => {
    const row = {
      id: "signer-1",
      signer_name: "A Investor",
      signer_email: "a@example.com",
      signer_capacity: "trustee",
      status: "sent",
      provider_embed_url: "https://box.example/secret-embed",
      provider_signer_id: "box-signer-1",
    };
    const visible = publicSigner(row);
    expect(JSON.stringify(visible)).not.toContain("secret-embed");
    expect(JSON.stringify(visible)).not.toContain("box-signer-1");
    expect(visible.capacityLabel).toBe("Trustee");
  });
});
