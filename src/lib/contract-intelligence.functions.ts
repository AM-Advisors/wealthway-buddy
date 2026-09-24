/**
 * Contract intelligence server functions: document family, Compare Versions,
 * conflicts, lifecycle, reviewer-recorded relationships, effective-dated
 * price resolution, Harmonious Standard Agreement and contract permissions.
 * Every function re-checks a granular contract capability on the server.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CONTRACT_CAPABILITIES,
  RELATIONSHIP_TYPES,
  buildFamily,
  compareDocuments,
  computeLifecycle,
  detectConflicts,
  relationshipProblem,
  renderStandardAgreement,
  renewalReminder,
  resolveContractPrice,
  standardSendBlockers,
  standardTemplateTerms,
  terminationSummary,
  type ContractCapability,
  type StandardFieldKey,
} from "@/lib/contract-intelligence";
import { TERM_CATALOG } from "@/lib/contract-ingestion";

async function gate(context: any, need: ContractCapability | ContractCapability[]) {
  return (await import("@/lib/contract-access.server")).contractGate(context, need);
}
async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}
async function audit(context: any, roles: string[], e: { clientId: string | null; action: string; target?: string | null; previous?: unknown; next?: unknown }) {
  const db = await admin();
  await db.from("contract_audit_events").insert({
    actor_id: context.userId,
    actor_role: roles.join(", ") || null,
    client_id: e.clientId,
    area: "contract",
    action: e.action,
    target: e.target ?? null,
    previous_value: (e.previous ?? null) as any,
    new_value: (e.next ?? null) as any,
    source: "web",
  });
}
const today = () => new Date().toISOString().slice(0, 10);

async function loadClientContracts(db: any, clientId: string) {
  const [{ data: docs }, { data: rels }] = await Promise.all([
    db.from("client_governing_documents").select("*").eq("client_id", clientId).order("uploaded_at"),
    db.from("contract_document_relationships").select("*").eq("client_id", clientId).order("recorded_at", { ascending: false }),
  ]);
  const ids = ((docs ?? []) as any[]).map((d) => d.id);
  const { data: terms } = ids.length ? await db.from("contract_terms").select("*").in("document_id", ids) : { data: [] };
  const withTerms = ((docs ?? []) as any[]).map((d) => ({ ...d, terms: ((terms ?? []) as any[]).filter((t) => t.document_id === d.id) }));
  return { docs: withTerms, rels: (rels ?? []) as any[] };
}

/** Client → documents graph, lifecycle, termination summary, conflicts. */
export const getContractFamily = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { contractCaps } = await gate(context, "view_contracts");
    const db = await admin();
    const { docs, rels } = await loadClientContracts(db, data.clientId);
    const t = today();
    const lifecycles = Object.fromEntries(
      docs.map((d) => {
        const lc = computeLifecycle(d, d.terms, t);
        return [d.id, { ...lc, reminder: renewalReminder(lc, t), termination: terminationSummary(d, d.terms, lc) }];
      }),
    );
    const strip = (n: any): any => ({ id: n.doc.id, title: n.doc.title, doc_type: n.doc.doc_type, version: n.doc.version, review_status: n.doc.review_status, effective_date: n.doc.effective_date, links: n.links, children: n.children.map(strip) });
    return {
      family: buildFamily(docs, rels).map(strip),
      documents: docs.map(({ terms: _t, ...d }) => d),
      relationships: rels,
      lifecycles,
      conflicts: detectConflicts(docs, rels, t),
      mayReviewPrecedence: contractCaps.includes("review_precedence"),
    };
  });

/** Compare Versions — side-by-side on structured terms with links to source language. */
export const compareContractDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ beforeId: z.string().uuid(), afterId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { roles } = await gate(context, "view_contracts");
    if (data.beforeId === data.afterId) throw new Error("Choose two different documents.");
    const db = await admin();
    const { data: pair } = await db.from("client_governing_documents").select("*").in("id", [data.beforeId, data.afterId]);
    const before = ((pair ?? []) as any[]).find((d) => d.id === data.beforeId);
    const after = ((pair ?? []) as any[]).find((d) => d.id === data.afterId);
    if (!before || !after) throw new Error("Not found.");
    if (before.client_id !== after.client_id) throw new Error("Both documents must belong to the same client.");
    const [{ data: terms }, { data: offerings }, { data: services }, { data: others }] = await Promise.all([
      db.from("contract_terms").select("*").in("document_id", [before.id, after.id]),
      db.from("offerings").select("id, name").eq("client_id", before.client_id),
      db.from("service_catalog").select("key, name"),
      db.from("client_governing_documents").select("id, title, doc_type, version, review_status").eq("client_id", before.client_id).order("uploaded_at"),
    ]);
    const tb = ((terms ?? []) as any[]).filter((t) => t.document_id === before.id);
    const ta = ((terms ?? []) as any[]).filter((t) => t.document_id === after.id);
    const fundName = (id: string) => ((offerings ?? []) as any[]).find((o) => o.id === id)?.name ?? "Fund";
    const svcName = (k: string) => ((services ?? []) as any[]).find((s) => s.key === k)?.name ?? k;
    const result = compareDocuments({ doc: before, terms: tb }, { doc: after, terms: ta }, {
      funds: (ids) => ids.map(fundName).join(", "),
      services: (keys) => keys.map(svcName).join(", "),
    });
    await audit(context, roles, { clientId: before.client_id, action: "contract versions compared", target: after.id, next: { before: before.id } });
    const pick = (d: any) => ({ id: d.id, title: d.title, doc_type: d.doc_type, version: d.version, review_status: d.review_status, effective_date: d.effective_date });
    return { before: pick(before), after: pick(after), ...result, documents: others ?? [], clientId: before.client_id };
  });

const relInput = z.object({
  documentId: z.string().uuid(),
  relatedDocumentId: z.string().uuid().nullable(),
  relationshipType: z.enum(RELATIONSHIP_TYPES.map((r) => r.value) as [string, ...string[]]),
  scope: z.enum(["client_wide", "fund", "service"]).default("client_wide"),
  offeringIds: z.array(z.string().uuid()).max(100).default([]),
  serviceKeys: z.array(z.string().max(80)).max(50).default([]),
  reason: z.string().trim().max(2000).nullable().optional(),
  sourceReference: z.string().trim().max(500).nullable().optional(),
});

/** A reviewer records how two documents relate. Never inferred from upload order. */
export const recordContractRelationship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => relInput.parse(d))
  .handler(async ({ data, context }) => {
    const { roles } = await gate(context, "review_precedence");
    const problem = relationshipProblem({
      relationship_type: data.relationshipType as any,
      related_document_id: data.relatedDocumentId,
      document_id: data.documentId,
      reason: data.reason,
      scope: data.scope,
      offering_ids: data.offeringIds,
      service_keys: data.serviceKeys,
    });
    if (problem) throw new Error(problem);
    const db = await admin();
    const ids = [data.documentId, data.relatedDocumentId].filter(Boolean) as string[];
    const { data: docs } = await db.from("client_governing_documents").select("id, client_id").in("id", ids);
    const clientIds = new Set(((docs ?? []) as any[]).map((d) => d.client_id));
    if ((docs ?? []).length !== ids.length || clientIds.size !== 1) throw new Error("Both documents must exist and belong to the same client.");
    const clientId = [...clientIds][0] as string;
    if (data.offeringIds.length) {
      const { data: owned } = await db.from("offerings").select("id").eq("client_id", clientId).in("id", data.offeringIds);
      if ((owned ?? []).length !== data.offeringIds.length) throw new Error("A selected fund doesn't belong to this client.");
    }
    const { data: row, error } = await db
      .from("contract_document_relationships")
      .insert({
        client_id: clientId,
        document_id: data.documentId,
        related_document_id: data.relatedDocumentId,
        relationship_type: data.relationshipType,
        scope: data.scope,
        offering_ids: data.offeringIds,
        service_keys: data.serviceKeys,
        reason: data.reason ?? null,
        source_reference: data.sourceReference ?? null,
        recorded_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await audit(context, roles, { clientId, action: "document relationship recorded", target: data.documentId, next: data });
    return { id: row.id as string };
  });

export const retireContractRelationship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), reason: z.string().trim().min(3).max(1000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { roles } = await gate(context, "review_precedence");
    const db = await admin();
    const { data: rel } = await db.from("contract_document_relationships").select("*").eq("id", data.id).maybeSingle();
    if (!rel) throw new Error("Not found.");
    if (rel.status === "retired") throw new Error("Already retired.");
    const { error } = await db
      .from("contract_document_relationships")
      .update({ status: "retired", retired_by: context.userId, retired_at: new Date().toISOString(), retired_reason: data.reason })
      .eq("id", rel.id);
    if (error) throw new Error(error.message);
    await audit(context, roles, { clientId: rel.client_id, action: "document relationship retired", target: rel.document_id, previous: rel, next: { reason: data.reason } });
    return { ok: true };
  });

/** Client + Fund + Service + Date → approved contract price (or a conflict, never a guess). */
export const resolveClientContractPrice = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ clientId: z.string().uuid(), serviceKey: z.string().max(80), offeringId: z.string().uuid().nullable(), onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await gate(context, "view_pricing");
    const db = await admin();
    const { data: rows } = await db
      .from("client_pricing")
      .select("id, service_key, label, offering_id, effective_date, contracted_cents, pricing_source, source_document_id, superseded_at")
      .eq("client_id", data.clientId)
      .eq("pricing_source", "contract");
    return resolveContractPrice((rows ?? []) as any[], data);
  });

/* ------------------------------------------ Harmonious Standard Agreement */

export const getStandardAgreementSetup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid(), draftId: z.string().uuid().nullable().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { contractCaps } = await gate(context, "generate_standard");
    const db = await admin();
    const [{ data: client }, { data: versions }, { data: services }] = await Promise.all([
      db.from("clients").select("id, name, legal_name, dba_name, entity_type, jurisdiction, address, primary_contact_email, expected_services").eq("id", data.clientId).maybeSingle(),
      db.from("msa_versions").select("id, version, effective_date, status, summary").order("effective_date", { ascending: false }),
      db.from("service_catalog").select("key, name").eq("active", true).order("sort_order"),
    ]);
    if (!client) throw new Error("Not found.");
    let draft: any = null;
    let preview: any = null;
    let execution: any = null;
    if (data.draftId) {
      const { data: d } = await db.from("client_governing_documents").select("*").eq("id", data.draftId).eq("client_id", data.clientId).eq("source", "standard_template").maybeSingle();
      draft = d;
      if (d) {
        const { data: sections } = await db.from("msa_sections").select("section_no, title, body, sort_order").eq("msa_version_id", d.msa_version_id);
        preview = renderStandardAgreement((sections ?? []) as any[], d.standard_fields ?? {});
        const version = ((versions ?? []) as any[]).find((v) => v.id === d.msa_version_id) ?? null;
        preview.blockers = standardSendBlockers(version, d, preview.missing);
        if (d.client_msa_agreement_id) {
          const { data: m } = await db.from("client_msa_agreements").select("id, status, executed_at").eq("id", d.client_msa_agreement_id).maybeSingle();
          execution = m;
        }
      }
    }
    const addr = client.address && typeof client.address === "object" ? Object.values(client.address).filter(Boolean).join(", ") : "";
    return {
      client,
      versions: ((versions ?? []) as any[]).filter((v) => v.status === "published"),
      services: services ?? [],
      defaults: {
        client_legal_name: client.legal_name ?? client.name ?? "",
        client_display_name: client.dba_name ?? client.name ?? "",
        client_entity_type: client.entity_type ?? "",
        client_jurisdiction: client.jurisdiction ?? "",
        client_address: addr,
        client_notice_email: client.primary_contact_email ?? "",
        effective_date: "",
        services: "",
      } as Record<StandardFieldKey, string>,
      draft,
      preview,
      execution,
      userId: context.userId,
      mayApprovePreview: contractCaps.includes("approve_terms") || contractCaps.includes("generate_standard"),
    };
  });

const stdFields = z.object({
  client_legal_name: z.string().trim().max(200).optional(),
  client_display_name: z.string().trim().max(200).optional(),
  client_entity_type: z.string().trim().max(100).optional(),
  client_jurisdiction: z.string().trim().max(100).optional(),
  client_address: z.string().trim().max(400).optional(),
  client_notice_email: z.string().trim().max(200).optional(),
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).optional(),
  services: z.string().trim().max(1000).optional(),
});

/** Draft pinned to one exact approved template version. Only allowed fields are filled. */
export const saveStandardAgreementDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ clientId: z.string().uuid(), draftId: z.string().uuid().nullable().optional(), msaVersionId: z.string().uuid(), fields: stdFields, serviceKeys: z.array(z.string().max(80)).max(50).default([]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { roles } = await gate(context, "generate_standard");
    const db = await admin();
    const { data: version } = await db.from("msa_versions").select("id, version, status").eq("id", data.msaVersionId).maybeSingle();
    if (!version || version.status !== "published") throw new Error("Only an approved (published) template version can be used.");
    const { data: sections } = await db.from("msa_sections").select("section_no, title, body, sort_order").eq("msa_version_id", version.id);
    const rendered = renderStandardAgreement((sections ?? []) as any[], data.fields as any);
    const { sha256Hex } = await import("@/lib/contract-ingestion.server");
    const text = JSON.stringify({ v: version.id, s: rendered.sections, f: data.fields });
    const hash = await sha256Hex(new TextEncoder().encode(text));
    const patch = {
      msa_version_id: version.id,
      standard_fields: data.fields,
      applies_to_service_keys: data.serviceKeys,
      effective_date: data.fields.effective_date || null,
      standard_status: "draft",
      standard_prepared_by: context.userId,
      standard_reviewed_by: null,
      standard_reviewed_at: null,
      sha256: hash,
      size_bytes: text.length,
      updated_at: new Date().toISOString(),
    };
    if (data.draftId) {
      const { data: existing } = await db.from("client_governing_documents").select("id, client_id, source, standard_status").eq("id", data.draftId).maybeSingle();
      if (!existing || existing.client_id !== data.clientId || existing.source !== "standard_template") throw new Error("Not found.");
      if (existing.standard_status && existing.standard_status !== "draft" && existing.standard_status !== "approved_to_send")
        throw new Error("This agreement was already sent; start a new version instead.");
      const { error } = await db.from("client_governing_documents").update(patch).eq("id", existing.id);
      if (error) throw new Error(error.message);
      await audit(context, roles, { clientId: data.clientId, action: "standard agreement draft updated", target: existing.id, next: { version: version.version } });
      return { draftId: existing.id as string };
    }
    const id = crypto.randomUUID();
    const { error } = await db.from("client_governing_documents").insert({
      id,
      client_id: data.clientId,
      doc_type: "msa",
      title: `Harmonious Standard Agreement v${version.version}`,
      version: 1,
      file_path: `standard:${version.id}`,
      original_filename: `harmonious-standard-v${version.version}`,
      mime_type: "text/plain",
      source: "standard_template",
      review_status: "draft",
      uploaded_by: context.userId,
      ...patch,
    });
    if (error) throw new Error(error.message);
    await db.from("clients").update({ contract_choice: "standard" }).eq("id", data.clientId);
    await audit(context, roles, { clientId: data.clientId, action: "standard agreement draft created", target: id, next: { version: version.version } });
    return { draftId: id };
  });

/** Authorized Harmonious review of the preview — must be a different person than the preparer. */
export const approveStandardAgreementPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ draftId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { roles } = await gate(context, "approve_terms");
    const db = await admin();
    const { data: d } = await db.from("client_governing_documents").select("*").eq("id", data.draftId).eq("source", "standard_template").maybeSingle();
    if (!d) throw new Error("Not found.");
    if (d.standard_status !== "draft") throw new Error("Only a draft can be reviewed.");
    if (d.standard_prepared_by === context.userId) throw new Error("The reviewer must be a different person from the preparer.");
    const { data: sections } = await db.from("msa_sections").select("section_no, title, body, sort_order").eq("msa_version_id", d.msa_version_id);
    const r = renderStandardAgreement((sections ?? []) as any[], d.standard_fields ?? {});
    if (r.missing.length) throw new Error(`Missing: ${r.missing.join(", ")}.`);
    await db.from("client_governing_documents").update({ standard_status: "approved_to_send", standard_reviewed_by: context.userId, standard_reviewed_at: new Date().toISOString() }).eq("id", d.id);
    await audit(context, roles, { clientId: d.client_id, action: "standard agreement preview approved", target: d.id });
    return { ok: true };
  });

/**
 * Hands the approved agreement to the existing client signing workflow
 * (client_msa_agreements). Sending never marks it executed.
 */
export const sendStandardAgreement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ draftId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { roles } = await gate(context, "generate_standard");
    const db = await admin();
    const { data: d } = await db.from("client_governing_documents").select("*").eq("id", data.draftId).eq("source", "standard_template").maybeSingle();
    if (!d) throw new Error("Not found.");
    const { data: version } = await db.from("msa_versions").select("id, status, version").eq("id", d.msa_version_id).maybeSingle();
    const { data: sections } = await db.from("msa_sections").select("section_no, title, body, sort_order").eq("msa_version_id", d.msa_version_id);
    const r = renderStandardAgreement((sections ?? []) as any[], d.standard_fields ?? {});
    const blockers = standardSendBlockers(version, d, r.missing);
    if (blockers.length) throw new Error(blockers.join(" "));
    let { data: m } = await db.from("client_msa_agreements").select("id, executed_at").eq("client_id", d.client_id).eq("msa_version_id", d.msa_version_id).maybeSingle();
    if (!m) {
      const { data: created, error } = await db.from("client_msa_agreements").insert({ client_id: d.client_id, msa_version_id: d.msa_version_id, status: "in_review" }).select("id, executed_at").single();
      if (error) throw new Error(error.message);
      m = created;
    }
    await db.from("client_governing_documents").update({ standard_status: "sent", standard_sent_at: new Date().toISOString(), client_msa_agreement_id: m.id }).eq("id", d.id);
    await audit(context, roles, { clientId: d.client_id, action: "standard agreement sent for signature", target: d.id, next: { version: version?.version } });
    return { ok: true, signing: "client_portal" as const };
  });

/**
 * Only when the signing workflow itself records execution does the agreement
 * become the governing document. Terms come from the approved template.
 */
export const syncStandardAgreementExecution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ draftId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { roles } = await gate(context, "view_contracts");
    const db = await admin();
    const { data: d } = await db.from("client_governing_documents").select("*").eq("id", data.draftId).eq("source", "standard_template").maybeSingle();
    if (!d || !d.client_msa_agreement_id) throw new Error("Not sent yet.");
    const { data: m } = await db.from("client_msa_agreements").select("id, executed_at").eq("id", d.client_msa_agreement_id).maybeSingle();
    if (!m?.executed_at) return { executed: false };
    if (d.standard_status === "executed") return { executed: true };
    const [{ data: version }, { data: sections }] = await Promise.all([
      db.from("msa_versions").select("version").eq("id", d.msa_version_id).maybeSingle(),
      db.from("msa_sections").select("section_no, title, body").eq("msa_version_id", d.msa_version_id),
    ]);
    const derived = standardTemplateTerms(version ?? { version: "?" }, (sections ?? []) as any[], d.standard_fields ?? {});
    await db.from("contract_terms").delete().eq("document_id", d.id);
    await db.from("contract_terms").insert(
      TERM_CATALOG.map((def) => {
        const hit = derived.find((x) => x.term_key === def.key);
        return {
          document_id: d.id,
          category: def.category,
          term_key: def.key,
          label: def.label,
          material: def.material,
          extracted_value: hit?.value ?? null,
          current_value: hit?.value ?? null,
          basis: hit ? "explicit" : "not_found",
          confidence: hit ? 1 : null,
          source_section: hit?.section ?? null,
          source_quote: hit?.quote ?? null,
          // Template language still gets human review before approval; modifications are never auto-accepted.
          status: "needs_review",
        };
      }),
    );
    await db.from("client_governing_documents").update({ standard_status: "executed", execution_status: "executed_confirmed", review_status: "awaiting_review", updated_at: new Date().toISOString() }).eq("id", d.id);
    await audit(context, roles, { clientId: d.client_id, action: "standard agreement execution confirmed by signing workflow", target: d.id });
    return { executed: true };
  });

/* ------------------------------------------------- contract permissions */

export const listContractGrants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireOperations } = await import("@/lib/ops-access.functions");
    await requireOperations(context, "administration", "execute");
    const db = await admin();
    const [{ data: grants }, { data: roles }, { data: profiles }] = await Promise.all([
      db.from("contract_capability_grants").select("*").order("granted_at", { ascending: false }),
      db.from("user_roles").select("user_id, role"),
      db.from("profiles").select("user_id, legal_name, email"),
    ]);
    const staffIds = new Set(((roles ?? []) as any[]).filter((r) => !["investor", "fund_manager", "user"].includes(r.role)).map((r) => r.user_id));
    const staff = ((profiles ?? []) as any[]).filter((p) => staffIds.has(p.user_id)).map((p) => ({ ...p, roles: ((roles ?? []) as any[]).filter((r) => r.user_id === p.user_id).map((r) => r.role) }));
    return { grants: grants ?? [], staff, capabilities: CONTRACT_CAPABILITIES };
  });

export const setContractGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ userId: z.string().uuid(), capability: z.enum(CONTRACT_CAPABILITIES.map((c) => c.value) as [string, ...string[]]), grant: z.boolean(), reason: z.string().trim().min(3).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireOperations } = await import("@/lib/ops-access.functions");
    const { roles } = await requireOperations(context, "administration", "execute");
    if (data.userId === context.userId) throw new Error("You can't change your own contract permissions.");
    const db = await admin();
    const { data: theirRoles } = await db.from("user_roles").select("role").eq("user_id", data.userId);
    const { hasOperationsEntry } = await import("@/lib/ops-capabilities");
    if (!hasOperationsEntry(((theirRoles ?? []) as any[]).map((r) => r.role))) throw new Error("Contract permissions can only be given to Harmonious staff.");
    if (data.grant) {
      const { error } = await db.from("contract_capability_grants").insert({ user_id: data.userId, capability: data.capability, granted_by: context.userId, reason: data.reason });
      if (error && !/duplicate/i.test(error.message)) throw new Error(error.message);
    } else {
      await db.from("contract_capability_grants").update({ revoked_at: new Date().toISOString(), revoked_by: context.userId }).eq("user_id", data.userId).eq("capability", data.capability).is("revoked_at", null);
    }
    await audit(context, roles, { clientId: null, action: data.grant ? "contract permission granted" : "contract permission revoked", target: data.userId, next: { capability: data.capability, reason: data.reason } });
    return { ok: true };
  });
