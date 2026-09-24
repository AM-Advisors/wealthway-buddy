/**
 * Server helpers for Client 360 administration. Loaded only inside handlers.
 */
import {
  buildSowLines,
  clientCapabilitiesFor,
  engagementTypeFor,
  findApplicableSow,
  resolveServicePrice,
  resolveSowTemplate,
  validateTemplateOverride,
  NO_TEMPLATE_MESSAGE,
  type CatalogService,
  type ClientCapability,
  type ClientPriceRow,
  type PriceResult,
  type Selection,
  type SowTemplate,
  type StandardPriceRow,
} from "@/lib/client-admin-model";

export async function clientGate(context: any, need?: ClientCapability | ClientCapability[]) {
  const { requireOperations } = await import("@/lib/ops-access.functions");
  const { roles } = await requireOperations(context, "clients", "see");
  const caps = clientCapabilitiesFor(roles);
  const needed = need ? (Array.isArray(need) ? need : [need]) : ["view_client" as const];
  const missing = needed.filter((c) => !caps.includes(c));
  if (missing.length) throw new Error(`Forbidden: this needs the "${missing.join(", ")}" permission.`);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { roles, caps, db: supabaseAdmin as any, userId: context.userId as string };
}

export async function audit(
  db: any,
  e: { actor: string; clientId: string | null; offeringId?: string | null; action: string; target?: string; before?: unknown; after?: unknown; reason?: string | null },
) {
  await db.from("contract_audit_events").insert({
    actor_id: e.actor,
    client_id: e.clientId,
    offering_id: e.offeringId ?? null,
    area: "client_360",
    action: e.action,
    target: e.target ?? null,
    previous_value: e.before === undefined ? null : JSON.stringify(e.before),
    new_value: e.after === undefined ? null : JSON.stringify(e.after),
    source: e.reason ?? null,
  });
}

export async function assertOffering(db: any, clientId: string, offeringId: string | null) {
  if (!offeringId) return null;
  const { data } = await db.from("offerings").select("id, name, fund_type, client_id").eq("id", offeringId).maybeSingle();
  if (!data || data.client_id !== clientId) throw new Error("That fund does not belong to this client.");
  return data;
}

export async function loadCatalog(db: any): Promise<CatalogService[]> {
  const { data } = await db
    .from("service_catalog")
    .select("id, key, name, category, service_group, description, standard_scope, standard_deliverables, default_pricing_model, billing_frequency, standard_price_cents, active, status, sort_order");
  return (data ?? []) as CatalogService[];
}

export async function loadPricingInputs(db: any, clientId: string) {
  const [{ data: cp }, { data: docs }, { data: versions }] = await Promise.all([
    db.from("client_pricing").select("id, service_key, contracted_cents, offering_id, superseded_at, approved_at, pricing_model, pricing_source, source_document_id, created_at").eq("client_id", clientId),
    db.from("client_governing_documents").select("id, doc_type").eq("client_id", clientId),
    db.from("pricing_versions").select("id, effective_date, status").eq("status", "published").order("effective_date", { ascending: false }),
  ]);
  const docType = new Map(((docs ?? []) as any[]).map((d) => [d.id, String(d.doc_type ?? "")]));
  const clientRows: ClientPriceRow[] = ((cp ?? []) as any[]).map((r) => ({
    id: r.id,
    service_key: r.service_key,
    contracted_cents: r.contracted_cents,
    offering_id: r.offering_id,
    superseded_at: r.superseded_at,
    approved_at: r.approved_at ?? (r.pricing_source === "contract" ? r.created_at : null),
    pricing_model: r.pricing_model,
    origin: r.offering_id ? "engagement" : /msa|master|main/i.test(docType.get(r.source_document_id) ?? "") ? "msa" : "client",
  }));
  const today = new Date().toISOString().slice(0, 10);
  const current = ((versions ?? []) as any[]).filter((v) => !v.effective_date || v.effective_date <= today);
  let standard: StandardPriceRow[] = [];
  if (current.length) {
    const { data: items } = await db.from("pricing_items").select("service_key, amount_cents, pricing_model, unit, version_id").in("version_id", current.map((v) => v.id));
    const rank = new Map(current.map((v, i) => [v.id, i]));
    const best = new Map<string, any>();
    for (const it of (items ?? []) as any[]) {
      const prev = best.get(it.service_key);
      if (!prev || (rank.get(it.version_id) ?? 99) < (rank.get(prev.version_id) ?? 99)) best.set(it.service_key, it);
    }
    standard = [...best.values()];
  }
  return { clientRows, standard };
}

export function priceSelections(sels: Selection[], catalog: CatalogService[], inputs: { clientRows: ClientPriceRow[]; standard: StandardPriceRow[] }) {
  const bySvc = new Map(catalog.map((c) => [c.key, c]));
  const out: Record<string, PriceResult> = {};
  for (const s of sels) {
    const svc = bySvc.get(s.service_key);
    out[s.id] = resolveServicePrice({
      serviceKey: s.service_key,
      offeringId: s.offering_id,
      clientRows: inputs.clientRows,
      standard: inputs.standard,
      catalogStandardCents: svc?.standard_price_cents ?? null,
      catalogPricingModel: svc?.default_pricing_model ?? null,
    });
  }
  return out;
}

export async function loadContractTerms(db: any, clientId: string) {
  const { data: docs } = await db
    .from("client_governing_documents")
    .select("id, title, doc_type, review_status, effective_date, superseded_at")
    .eq("client_id", clientId);
  const approved = ((docs ?? []) as any[]).filter((d) => d.review_status === "approved" && !d.superseded_at);
  let excluded = "";
  let special: string[] = [];
  if (approved.length) {
    const { data: terms } = await db
      .from("contract_terms")
      .select("term_key, current_value, document_id")
      .in("document_id", approved.map((d) => d.id))
      .in("term_key", ["excluded_work", "special_terms"]);
    for (const t of (terms ?? []) as any[]) {
      if (!t.current_value) continue;
      if (t.term_key === "excluded_work") excluded += ` ${t.current_value}`;
      if (t.term_key === "special_terms") special.push(String(t.current_value));
    }
  }
  const main = approved.find((d) => /msa|master|main/i.test(String(d.doc_type))) ?? null;
  return { excluded: excluded.trim() || null, special, governing: main ? { id: main.id, title: main.title, effectiveDate: main.effective_date } : null };
}

/**
 * Preview the SOW for a client + scope. Nothing is written.
 */
export async function buildPreview(db: any, clientId: string, offeringId: string | null, opts: { templateId?: string | null } = {}) {
  const offering = await assertOffering(db, clientId, offeringId);
  const [catalog, inputs, terms, { data: selRows }, { data: sowRows }, { data: tpl }] = await Promise.all([
    loadCatalog(db),
    loadPricingInputs(db, clientId),
    loadContractTerms(db, clientId),
    db.from("client_service_selections").select("*").eq("client_id", clientId),
    db.from("client_sows").select("id, client_id, offering_id, status, executed_at, generated_automatically, locked, client_status, approval_status, amends_sow_id, template_version, review_blockers, title").eq("client_id", clientId),
    db.from("sow_templates").select("*"),
  ]);
  const sels = ((selRows ?? []) as Selection[]).filter((s) => (s.offering_id ?? null) === (offeringId ?? null) || (!s.offering_id));
  const applicable = findApplicableSow((sowRows ?? []) as any[], clientId, offeringId);
  const amendment = !!applicable.executed;
  const prices = priceSelections(sels, catalog, inputs);
  const { lines, blockers } = buildSowLines({ clientId, offeringId, selections: sels, catalog, prices, excludedWork: terms.excluded, amendment });
  const type = engagementTypeFor(offering);
  const today = new Date().toISOString().slice(0, 10);
  const templates = (tpl ?? []) as SowTemplate[];
  let template: SowTemplate | null = null;
  let templateProblem: string | null = null;
  if (opts.templateId) {
    const t = templates.find((x) => x.id === opts.templateId);
    templateProblem = validateTemplateOverride(t, type, today, "override-preview");
    template = templateProblem ? null : t!;
  } else {
    const r = resolveSowTemplate(templates, type, today);
    if (r.status === "resolved") template = r.template;
    else templateProblem = r.status === "ambiguous" ? "Two approved templates share the latest version — Harmonious review required." : NO_TEMPLATE_MESSAGE;
  }
  if (!template) blockers.push({ kind: "no_template", message: templateProblem ?? NO_TEMPLATE_MESSAGE });
  if (!lines.length) blockers.push({ kind: "no_services", message: amendment ? "No service changes are pending for this engagement." : "Select at least one service." });
  return {
    engagementType: type,
    offering: offering ? { id: offering.id, name: offering.name } : null,
    lines,
    blockers,
    template: template ? { id: template.id, name: template.name, version: template.version, effectiveDate: template.effective_date } : null,
    templates: templates.filter((t) => t.engagement_type === type).map((t) => ({ id: t.id, name: t.name, version: t.version, status: t.status, effectiveDate: t.effective_date, retiredAt: t.retired_at })),
    governing: terms.governing,
    specialTerms: terms.special,
    executedSow: applicable.executed ? { id: applicable.executed.id, version: applicable.executed.template_version ?? null } : null,
    draftSow: (amendment ? applicable.amendmentDraft : applicable.draft) ?? null,
    mode: amendment ? ("amendment" as const) : ("draft" as const),
  };
}

/**
 * Reuse an executed SOW, or create/update the one draft SOW for this scope from
 * the approved template. Never executes, signs or accepts anything.
 */
export async function ensureDraftSow(
  db: any,
  actor: string,
  clientId: string,
  offeringId: string | null,
  opts: { templateId?: string | null; overrideReason?: string | null; trigger: string },
) {
  const preview = await buildPreview(db, clientId, offeringId, { templateId: opts.templateId ?? null });
  if (preview.executedSow && preview.mode === "draft") {
    return { outcome: "reused_executed" as const, sowId: preview.executedSow.id, preview };
  }
  if (!preview.template) {
    await audit(db, { actor, clientId, offeringId, action: "sow_template_missing", after: { engagementType: preview.engagementType }, reason: opts.trigger });
    return { outcome: "no_template" as const, sowId: null, preview };
  }
  if (preview.mode === "amendment" && !preview.lines.length) {
    return { outcome: "reused_executed" as const, sowId: preview.executedSow!.id, preview };
  }
  const blockers = preview.blockers.filter((b) => b.kind !== "no_services");
  const payload: Record<string, unknown> = {
    template_id: preview.template.id,
    template_version: preview.template.version,
    generated_automatically: true,
    generated_lines: preview.lines,
    review_blockers: blockers,
    template_override_reason: opts.templateId ? opts.overrideReason ?? null : null,
    template_override_by: opts.templateId ? actor : null,
    template_override_at: opts.templateId ? new Date().toISOString() : null,
  };
  let sowId = preview.draftSow?.id ?? null;
  const before = preview.draftSow ?? null;
  if (sowId) {
    const { error } = await db.from("client_sows").update(payload).eq("id", sowId).is("executed_at", null);
    if (error) throw new Error(error.message);
  } else {
    const title = `${preview.mode === "amendment" ? "SOW amendment" : "Draft SOW"} — ${preview.offering?.name ?? "Client services"}`;
    const { data, error } = await db
      .from("client_sows")
      .insert({
        ...payload,
        client_id: clientId,
        offering_id: offeringId,
        title,
        sow_type: preview.engagementType === "spv_administration" ? "spv" : preview.engagementType === "fund_administration" ? "fund" : "administration",
        status: "draft",
        stage: "draft",
        approval_status: "pending",
        client_status: "pending",
        amends_sow_id: preview.mode === "amendment" ? preview.executedSow!.id : null,
        notes: "Draft SOW — Generated from current approved template. Not accepted, signed or executed.",
        created_by: actor,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    sowId = data.id;
  }
  await db.from("client_service_selections").update({ sow_id: sowId }).in("id", preview.lines.map((l) => l.selectionId));
  await audit(db, {
    actor, clientId, offeringId,
    action: opts.templateId ? "sow_generated_with_override" : before ? "sow_draft_updated" : "sow_auto_generated",
    target: sowId!,
    before: before ? { template_version: before.template_version } : undefined,
    after: { template: preview.template, lines: preview.lines.map((l) => ({ service: l.serviceKey, cents: l.cents, source: l.pricingSource, change: l.change })), blockers },
    reason: opts.overrideReason ?? opts.trigger,
  });
  return { outcome: before ? ("updated_draft" as const) : ("created_draft" as const), sowId, preview };
}
