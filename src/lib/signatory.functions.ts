/**
 * Phase 3C server functions — firm verification, credentials, delegation
 * acceptance, authority documents and authorized signing.
 *
 * Every handler re-derives authority from stored records. Nothing trusts an id,
 * a scope or an "I am authorised" claim sent by the browser.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  AUTHORITY_DOCUMENT_TYPES,
  CREDENTIAL_TYPES,
  ORG_VERIFICATION_STATUSES,
  SIGNABLE_DOCUMENT_TYPES,
} from "@/lib/signatory-model";

const uuid = z.string().uuid();

// ------------------------------------------------------ firm verification --

export const getOrganizationVerification = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: seats } = await supabase
      .from("professional_memberships")
      .select("organization_id, seat_role, status")
      .eq("user_id", userId)
      .eq("status", "active");

    const ids = ((seats ?? []) as any[]).map((s) => s.organization_id);
    if (ids.length === 0) return { organizations: [], documents: [] };

    const [{ data: orgs }, { data: docs }] = await Promise.all([
      supabase.from("professional_organizations").select("*").in("id", ids),
      supabase.from("professional_organization_documents").select("*").in("organization_id", ids),
    ]);
    return { organizations: orgs ?? [], documents: docs ?? [] };
  });

const orgPatch = z.object({
  organization_id: uuid,
  submit: z.boolean().default(false),
  patch: z
    .object({
      legal_name: z.string().max(200).optional(),
      dba_name: z.string().max(200).optional(),
      org_type: z.string().max(60).optional(),
      website: z.string().max(300).optional(),
      jurisdiction: z.string().max(120).optional(),
      address_line1: z.string().max(200).optional(),
      address_line2: z.string().max(200).optional(),
      city: z.string().max(120).optional(),
      region: z.string().max(120).optional(),
      postal_code: z.string().max(40).optional(),
      country: z.string().max(80).optional(),
      business_identifier: z.string().max(60).optional(),
      registration_number: z.string().max(120).optional(),
      license_number: z.string().max(120).optional(),
      primary_contact_name: z.string().max(200).optional(),
      primary_contact_email: z.string().max(200).optional(),
      primary_contact_phone: z.string().max(60).optional(),
    })
    // An allowlist, never an open column update: verification state is not here.
    .strict(),
});

export const saveOrganizationProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => orgPatch.parse(data))
  .handler(async ({ data, context }) => {
    const { saveOrganizationVerification } = await import("@/lib/signatory-authority.server");
    return saveOrganizationVerification(
      context.userId,
      data.organization_id,
      data.patch,
      data.submit,
    );
  });

export const reviewOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        organization_id: uuid,
        status: z.enum(ORG_VERIFICATION_STATUSES),
        note: z.string().max(2000).nullish(),
        reverification_due_at: z.string().nullish(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { reviewOrganizationVerification } = await import("@/lib/signatory-authority.server");
    return reviewOrganizationVerification(
      context.userId,
      data.organization_id,
      data.status,
      data.note ?? null,
      data.reverification_due_at ?? null,
    );
  });

// ----------------------------------------------------------- credentials --

export const listCredentials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listMyCredentials } = await import("@/lib/signatory-authority.server");
    return { credentials: await listMyCredentials(context.userId) };
  });

export const upsertCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: uuid.nullish(),
        organization_id: uuid.nullish(),
        credential_type: z.enum(CREDENTIAL_TYPES),
        jurisdiction: z.string().max(120).nullish(),
        credential_number: z.string().max(120).nullish(),
        firm_identifier: z.string().max(120).nullish(),
        fiduciary_capacity: z.string().max(200).nullish(),
        issued_at: z.string().nullish(),
        expires_at: z.string().nullish(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { saveCredential } = await import("@/lib/signatory-authority.server");
    return saveCredential(context.userId, {
      id: data.id ?? null,
      organizationId: data.organization_id ?? null,
      credentialType: data.credential_type,
      jurisdiction: data.jurisdiction ?? null,
      credentialNumber: data.credential_number ?? null,
      firmIdentifier: data.firm_identifier ?? null,
      fiduciaryCapacity: data.fiduciary_capacity ?? null,
      issuedAt: data.issued_at ?? null,
      expiresAt: data.expires_at ?? null,
    });
  });

export const decideCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        credential_id: uuid,
        status: z.enum(["verified", "rejected", "revoked", "expired", "submitted"]),
        note: z.string().max(2000).nullish(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { reviewCredential } = await import("@/lib/signatory-authority.server");
    return reviewCredential(context.userId, data.credential_id, data.status, data.note ?? null);
  });

// ------------------------------------------------------------ acceptance --

export const listDelegationsAwaitingAcceptance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listAwaitingAcceptance } = await import("@/lib/signatory-authority.server");
    return { items: await listAwaitingAcceptance(context.userId) };
  });

export const respondToDelegation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        delegation_id: uuid,
        terms_version: z.string().max(80),
        decision: z.enum(["accept", "decline"]).default("accept"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { acceptDelegation } = await import("@/lib/signatory-authority.server");
    return acceptDelegation(
      context.userId,
      data.delegation_id,
      data.terms_version,
      data.decision,
    );
  });

// --------------------------------------------------- authority documents --

export const listAuthorityDocs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ as_principal: z.boolean().default(false) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { listAuthorityDocuments } = await import("@/lib/signatory-authority.server");
    return {
      documents: await listAuthorityDocuments(context.userId, {
        asPrincipal: data.as_principal,
      }),
    };
  });

export const submitAuthorityDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        delegation_id: uuid,
        document_type: z.enum(AUTHORITY_DOCUMENT_TYPES),
        file_name: z.string().min(1).max(300),
        storage_path: z.string().min(1).max(600),
        document_hash: z.string().max(200).nullish(),
        covered_document_types: z.array(z.enum(SIGNABLE_DOCUMENT_TYPES)).min(1),
        effective_at: z.string().nullish(),
        expires_at: z.string().nullish(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { submitAuthorityDocument } = await import("@/lib/signatory-authority.server");
    return submitAuthorityDocument(context.userId, {
      delegationId: data.delegation_id,
      documentType: data.document_type,
      fileName: data.file_name,
      storagePath: data.storage_path,
      documentHash: data.document_hash ?? null,
      coveredDocumentTypes: data.covered_document_types,
      effectiveAt: data.effective_at ?? null,
      expiresAt: data.expires_at ?? null,
    });
  });

export const decideAuthorityDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        document_id: uuid,
        decision: z.enum(["accept", "reject", "revoke", "in_review"]),
        note: z.string().max(2000).nullish(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { reviewAuthorityDocument } = await import("@/lib/signatory-authority.server");
    return reviewAuthorityDocument(
      context.userId,
      data.document_id,
      data.decision,
      data.note ?? null,
    );
  });

// --------------------------------------------------------------- signing --

const signTarget = z.object({
  delegation_id: uuid,
  profile_id: uuid.nullish(),
  fund_id: uuid.nullish(),
  investment_id: uuid.nullish(),
  document_type: z.enum(SIGNABLE_DOCUMENT_TYPES),
});

/** Dry run: tells the UI whether signing is possible, and why not if it isn't. */
export const checkSignatoryAuthority = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => signTarget.parse(data))
  .handler(async ({ data, context }) => {
    const { resolveSignatoryAuthority } = await import("@/lib/signatory-authority.server");
    const decision = await resolveSignatoryAuthority(context.userId, data.delegation_id, {
      profileId: data.profile_id ?? null,
      fundId: data.fund_id ?? null,
      investmentId: data.investment_id ?? null,
      documentType: data.document_type,
    });
    return {
      allowed: decision.allowed,
      code: decision.code,
      reason: decision.reason,
      authorityDocumentId: decision.authorityDocument?.id ?? null,
    };
  });

export const startSigningStepUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => signTarget.parse(data))
  .handler(async ({ data, context }) => {
    const { resolveSignatoryAuthority, beginSigningStepUp } = await import(
      "@/lib/signatory-authority.server"
    );
    const decision = await resolveSignatoryAuthority(context.userId, data.delegation_id, {
      profileId: data.profile_id ?? null,
      fundId: data.fund_id ?? null,
      investmentId: data.investment_id ?? null,
      documentType: data.document_type,
    });
    if (!decision.allowed) throw new Error(`Forbidden: ${decision.reason}`);

    const resourceType = data.investment_id
      ? "investment"
      : data.profile_id
        ? "investment_profile"
        : "fund";
    const resourceId = data.investment_id ?? data.profile_id ?? data.fund_id ?? "";

    return beginSigningStepUp(context.userId, {
      delegationId: data.delegation_id,
      resourceType,
      resourceId,
    });
  });

export const confirmSigningStepUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ challenge_id: uuid, code: z.string().min(4).max(12) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { verifySigningStepUp } = await import("@/lib/signatory-authority.server");
    return verifySigningStepUp(context.userId, data.challenge_id, data.code);
  });

export const signDocumentAsSignatory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    signTarget
      .extend({
        step_up_id: uuid,
        document_reference: z.string().max(300).nullish(),
        document_name: z.string().max(300).nullish(),
        document_hash: z.string().min(8).max(200),
        signer_title: z.string().max(120).nullish(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { signAsAuthorizedSignatory } = await import("@/lib/signatory-authority.server");
    return signAsAuthorizedSignatory(context.userId, {
      delegationId: data.delegation_id,
      stepUpId: data.step_up_id,
      profileId: data.profile_id ?? null,
      fundId: data.fund_id ?? null,
      investmentId: data.investment_id ?? null,
      documentType: data.document_type,
      documentReference: data.document_reference ?? null,
      documentName: data.document_name ?? null,
      documentHash: data.document_hash,
      signerTitle: data.signer_title ?? null,
    });
  });

// ------------------------------------------------------------- visibility --

export const listMySignatures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ as: z.enum(["principal", "signer"]).default("signer") }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { listSignatureActivity } = await import("@/lib/signatory-authority.server");
    return { signatures: await listSignatureActivity(context.userId, data.as) };
  });

/** The client's view: who may sign for them, and under what authority. */
export const getMySignatoryAuthority = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listSignatoryAuthorityForPrincipal, listSignatureActivity } = await import(
      "@/lib/signatory-authority.server"
    );
    const [grants, signatures] = await Promise.all([
      listSignatoryAuthorityForPrincipal(context.userId),
      listSignatureActivity(context.userId, "principal"),
    ]);
    return { grants, signatures };
  });

export const revokeSignatory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ delegation_id: uuid, reason: z.string().max(500).nullish() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { revokeSignatoryAuthority } = await import("@/lib/signatory-authority.server");
    return revokeSignatoryAuthority(context.userId, data.delegation_id, data.reason ?? null);
  });

export const getExpiringAuthority = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listExpiringAuthority } = await import("@/lib/signatory-authority.server");
    return listExpiringAuthority(context.userId);
  });

export const getAuthorityNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listAuthorityNotifications } = await import("@/lib/signatory-authority.server");
    return { notifications: await listAuthorityNotifications(context.userId) };
  });
