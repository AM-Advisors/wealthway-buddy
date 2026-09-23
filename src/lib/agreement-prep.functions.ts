import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildSendReview,
  canPrepare,
  pipelineBucket,
  roleLabel,
  type PlacedField,
  type TemplateRole,
} from "@/lib/agreement-prep";
import { EXECUTION_LABELS, executionState, publicSigner } from "@/lib/document-signing";

const roleSchema = z.object({
  key: z.string().min(1).max(60),
  label: z.string().max(80).optional(),
  order: z.number().int().min(0).max(50),
  required: z.boolean(),
});

const fieldSchema = z.object({
  key: z.string().min(1).max(80),
  roleKey: z.string().min(1).max(60),
  type: z.string().min(1).max(40),
  pageIndex: z.number().int().min(0).max(500),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0.005).max(1),
  height: z.number().min(0.005).max(1),
  required: z.boolean(),
  prefill: z.string().max(40).nullable().optional(),
  label: z.string().max(120).nullable().optional(),
});

const signerSchema = z.object({
  roleKey: z.string().min(1).max(60),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(200),
  order: z.number().int().min(1).max(50),
  required: z.boolean(),
});

async function actorFor(context: any) {
  const { resolvePreparer, staffCapabilities } = await import("@/lib/agreement-prep.server");
  const capabilities = await staffCapabilities(context);
  return resolvePreparer(context, capabilities);
}

/**
 * Who this person may prepare agreements for, and what they can prepare.
 * Everything is resolved from their real fund/company relationships.
 */
export const getPreparationContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ offering_id: z.string().uuid().optional() }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const actor = await actorFor(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { listTemplates } = await import("@/lib/agreement-prep.server");

    const staff = actor.capabilities.includes("documents:prepare");
    const offeringIds = staff ? null : actor.offeringIds;

    if (!staff && actor.offeringIds.length === 0 && actor.companyIds.length === 0) {
      return { canPrepare: false, staff: false, funds: [], documents: [], investors: [], templates: [] };
    }

    let fundQuery = supabaseAdmin.from("offerings").select("id, name, reg_type").order("name");
    if (offeringIds) fundQuery = fundQuery.in("id", offeringIds.length ? offeringIds : [""]);
    const { data: funds } = await fundQuery;

    const selectedFund =
      data.offering_id && (staff || actor.offeringIds.includes(data.offering_id))
        ? data.offering_id
        : ((funds ?? [])[0]?.id ?? null);

    if (!selectedFund) {
      return {
        canPrepare: staff,
        staff,
        funds: (funds ?? []) as any[],
        documents: [],
        investors: [],
        templates: await listTemplates(supabaseAdmin, actor),
      };
    }

    const [{ data: documents }, { data: applications }] = await Promise.all([
      supabaseAdmin
        .from("offering_documents")
        .select("id, title, doc_type, requires_signature, file_path")
        .eq("offering_id", selectedFund)
        .order("title"),
      supabaseAdmin
        .from("investor_applications")
        .select("id, user_id, status, created_at")
        .eq("offering_id", selectedFund)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    const userIds = Array.from(new Set(((applications ?? []) as any[]).map((a) => a.user_id)));
    const [{ data: profiles }, { data: subscriptions }] = await Promise.all([
      userIds.length
        ? supabaseAdmin.from("profiles").select("user_id, legal_name, email").in("user_id", userIds)
        : Promise.resolve({ data: [] as any[] }),
      (applications ?? []).length
        ? supabaseAdmin
            .from("subscriptions")
            .select("application_id, entity_name, tax_classification, commitment_cents")
            .in(
              "application_id",
              ((applications ?? []) as any[]).map((a) => a.id),
            )
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const profileBy = new Map(((profiles ?? []) as any[]).map((p) => [p.user_id, p]));
    const subBy = new Map(((subscriptions ?? []) as any[]).map((s) => [s.application_id, s]));

    return {
      canPrepare: canPrepare(actor, { scope: "fund", offeringId: selectedFund }),
      staff,
      funds: (funds ?? []) as any[],
      selectedFund,
      documents: ((documents ?? []) as any[]).map((d) => ({
        id: d.id,
        title: d.title,
        docType: d.doc_type,
        requiresSignature: Boolean(d.requires_signature),
        hasFile: Boolean(d.file_path),
      })),
      investors: ((applications ?? []) as any[]).map((a) => {
        const profile = profileBy.get(a.user_id);
        const sub = subBy.get(a.id);
        return {
          applicationId: a.id,
          name: sub?.entity_name ?? profile?.legal_name ?? profile?.email ?? "Investor",
          contactName: profile?.legal_name ?? null,
          email: profile?.email ?? null,
          taxClassification: sub?.tax_classification ?? null,
          commitmentCents: sub?.commitment_cents ?? null,
          status: a.status,
        };
      }),
      templates: await listTemplates(supabaseAdmin, actor, { offeringId: selectedFund }),
    };
  });

/** Saves a reusable field layout as a new template version. */
export const saveSigningTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        template_id: z.string().uuid().nullable().optional(),
        scope: z.enum(["harmonious", "fund", "company"]),
        offering_id: z.string().uuid().nullable().optional(),
        company_id: z.string().uuid().nullable().optional(),
        agreement_type: z.string().trim().min(1).max(60),
        name: z.string().trim().min(1).max(160),
        roles: z.array(roleSchema).min(1).max(20),
        fields: z.array(fieldSchema).max(400),
        offering_document_id: z.string().uuid().nullable().optional(),
        publish: z.boolean(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const actor = await actorFor(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { saveTemplateVersion } = await import("@/lib/agreement-prep.server");

    return saveTemplateVersion(supabaseAdmin, actor, {
      templateId: data.template_id ?? null,
      scope: data.scope,
      offeringId: data.offering_id ?? null,
      companyId: data.company_id ?? null,
      agreementType: data.agreement_type,
      name: data.name,
      roles: data.roles as TemplateRole[],
      fields: data.fields as PlacedField[],
      offeringDocumentId: data.offering_document_id ?? null,
      publish: data.publish,
    });
  });

/** The final review shown before sending. Pure summary — nothing is sent here. */
export const reviewPreparedAgreement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        application_id: z.string().uuid(),
        offering_document_id: z.string().uuid(),
        roles: z.array(roleSchema).min(1).max(20),
        fields: z.array(fieldSchema).max(400),
        signers: z.array(signerSchema).min(1).max(20),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const actor = await actorFor(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: doc } = await supabaseAdmin
      .from("offering_documents")
      .select("id, offering_id, title")
      .eq("id", data.offering_document_id)
      .maybeSingle();
    if (!doc) throw new Error("That agreement no longer exists.");
    if (!canPrepare(actor, { scope: "fund", offeringId: String(doc.offering_id) })) {
      throw new Error("Forbidden: you are not authorized to prepare agreements for this fund.");
    }

    const { data: application } = await supabaseAdmin
      .from("investor_applications")
      .select("id, offering_id, user_id")
      .eq("id", data.application_id)
      .maybeSingle();
    if (!application || String(application.offering_id) !== String(doc.offering_id)) {
      throw new Error("That agreement does not belong to this investor's fund.");
    }

    const [{ data: subscription }, { data: profile }] = await Promise.all([
      supabaseAdmin
        .from("subscriptions")
        .select("entity_name")
        .eq("application_id", application.id)
        .maybeSingle(),
      supabaseAdmin
        .from("profiles")
        .select("legal_name, email")
        .eq("user_id", application.user_id)
        .maybeSingle(),
    ]);

    const review = buildSendReview({
      agreementTitle: String(doc.title),
      investorName:
        subscription?.entity_name ?? profile?.legal_name ?? profile?.email ?? "Investor",
      roles: data.roles as TemplateRole[],
      fields: data.fields as PlacedField[],
      signers: data.signers,
    });

    return { ...review, roleLabels: data.roles.map((r) => roleLabel(r.key)) };
  });

/** Sends the prepared agreement through Box Sign. Authority is rechecked here. */
export const sendPreparedAgreement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        application_id: z.string().uuid(),
        offering_document_id: z.string().uuid(),
        template_version_id: z.string().uuid().nullable().optional(),
        roles: z.array(roleSchema).min(1).max(20),
        fields: z.array(fieldSchema).max(400),
        signers: z.array(signerSchema).min(1).max(20),
        message: z.string().max(600).nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const actor = await actorFor(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendPreparedAgreement: send } = await import("@/lib/agreement-prep.server");

    return send(context, supabaseAdmin, actor, {
      applicationId: data.application_id,
      offeringDocumentId: data.offering_document_id,
      templateVersionId: data.template_version_id ?? null,
      roles: data.roles as TemplateRole[],
      fields: data.fields as PlacedField[],
      signers: data.signers,
      message: data.message ?? null,
    });
  });

/**
 * The agreements pipeline. Every bucket is derived from the authoritative
 * signer records and Box's own status — never from a stored dashboard status.
 */
export const listAgreementPipeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ offering_id: z.string().uuid().optional() }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const actor = await actorFor(context);
    const staff = actor.capabilities.includes("documents:see");
    if (!staff && actor.offeringIds.length === 0) {
      return { requests: [], canPrepare: false, scopeOfferingIds: [] };
    }

    const allowedOfferings = staff ? null : actor.offeringIds;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("document_signature_signers")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(400);
    if (data.offering_id) query = query.eq("offering_id", data.offering_id);
    else if (allowedOfferings) query = query.in("offering_id", allowedOfferings.length ? allowedOfferings : [""]);

    const { data: signerRows } = await query;
    let rows = ((signerRows ?? []) as any[]).filter(
      (r) => !allowedOfferings || allowedOfferings.includes(String(r.offering_id)),
    );

    const signatureIds = Array.from(new Set(rows.map((r) => r.signature_id)));
    const documentIds = Array.from(new Set(rows.map((r) => r.offering_document_id)));

    const [{ data: signatures }, { data: documents }] = await Promise.all([
      signatureIds.length
        ? supabaseAdmin
            .from("document_signatures")
            .select(
              "id, provider_status, provider_sent_at, provider_completed_at, cancelled_at, provider_error, template_version_id, prepared_by, sent_by, document_author, source_file_version_id, signed_file_version_id",
            )
            .in("id", signatureIds)
        : Promise.resolve({ data: [] as any[] }),
      documentIds.length
        ? supabaseAdmin.from("offering_documents").select("id, title").in("id", documentIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const sigById = new Map(((signatures ?? []) as any[]).map((s) => [s.id, s]));
    const docById = new Map(((documents ?? []) as any[]).map((d) => [d.id, d]));

    const grouped = new Map<string, any>();
    for (const row of rows) {
      const signature = sigById.get(row.signature_id);
      const entry = grouped.get(row.signature_id) ?? {
        signatureId: row.signature_id,
        offeringId: row.offering_id ?? null,
        applicationId: row.application_id,
        documentTitle: docById.get(row.offering_document_id)?.title ?? "Agreement",
        sentAt: signature?.provider_sent_at ?? null,
        completedAt: signature?.provider_completed_at ?? null,
        templateVersionId: signature?.template_version_id ?? null,
        preparedBy: signature?.prepared_by ?? null,
        sentBy: signature?.sent_by ?? null,
        documentAuthor: signature?.document_author ?? null,
        sourceVersionId: signature?.source_file_version_id ?? null,
        signedVersionId: signature?.signed_file_version_id ?? null,
        providerError: signature?.provider_error ?? null,
        signers: [] as any[],
      };
      entry.signers.push({ ...publicSigner(row), roleKey: row.role_key ?? null });
      grouped.set(row.signature_id, entry);
    }

    const requests = Array.from(grouped.values()).map((entry) => {
      const state = executionState(entry.signers);
      return {
        ...entry,
        state,
        stateLabel: EXECUTION_LABELS[state],
        bucket: pipelineBucket(state, entry.sentAt),
      };
    });

    return {
      requests,
      canPrepare: actor.capabilities.includes("documents:prepare") || actor.offeringIds.length > 0,
      scopeOfferingIds: actor.offeringIds,
    };
  });
