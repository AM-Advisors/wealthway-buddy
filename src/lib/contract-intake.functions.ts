/**
 * New Client intake + contract ingestion (server functions).
 * Extends the existing clients / client_pricing / contract audit architecture.
 * Every function re-checks Operations capabilities server-side; approving
 * contract terms additionally needs the existing contract authority roles.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { centsSchema, friendlyParse, PRICING_MODEL_VALUES, pricingNeedsAmount } from "@/lib/contract-coverage";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CLIENT_TYPES,
  CONTACT_DESIGNATIONS,
  CONTRACT_MIME_TYPES,
  GOVERNING_DOC_TYPES,
  MAX_CONTRACT_BYTES,
  approvalBlockers,
  contractAlerts,
  einLast4,
  findDuplicateClients,
  parentProblem,
  parseDays,
  planPricingApplication,
} from "@/lib/contract-ingestion";
import type { ContractCapability } from "@/lib/contract-intelligence";

type Area = "see" | "prepare" | "approve";

async function gate(context: any, action: Area) {
  const { requireOperations } = await import("@/lib/ops-access.functions");
  return requireOperations(context, "clients", action);
}
async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}
async function audit(context: any, roles: string[], e: { clientId: string | null; action: string; target?: string | null; previous?: unknown; next?: unknown; area?: string }) {
  const db = await admin();
  await db.from("contract_audit_events").insert({
    actor_id: context.userId,
    actor_role: roles.join(", ") || null,
    client_id: e.clientId,
    area: e.area ?? "contract",
    action: e.action,
    target: e.target ?? null,
    previous_value: (e.previous ?? null) as any,
    new_value: (e.next ?? null) as any,
    source: "web",
  });
}

async function contractGate(context: any, need: ContractCapability | ContractCapability[]) {
  return (await import("@/lib/contract-access.server")).contractGate(context, need);
}

/* ---------------------------------------------------------------- intake */

export const getIntakeOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await gate(context, "prepare");
    const db = await admin();
    const [{ data: services }, { data: roles }] = await Promise.all([
      db.from("service_catalog").select("key, name, category").eq("active", true).order("sort_order"),
      db.from("user_roles").select("user_id, role"),
    ]);
    const staffIds = Array.from(new Set(((roles ?? []) as any[]).filter((r) => r.role !== "investor" && r.role !== "fund_manager" && r.role !== "user").map((r) => r.user_id)));
    const { data: people } = staffIds.length
      ? await db.from("profiles").select("id, full_name, email").in("id", staffIds)
      : { data: [] };
    return {
      clientTypes: CLIENT_TYPES,
      designations: CONTACT_DESIGNATIONS,
      docTypes: GOVERNING_DOC_TYPES,
      services: (services ?? []) as { key: string; name: string; category: string }[],
      owners: ((people ?? []) as any[]).map((p) => ({ id: p.id as string, name: (p.full_name || p.email || "Team member") as string })),
    };
  });

const clientStep = z.object({
  id: z.string().uuid().optional(),
  confirmDuplicate: z.boolean().default(false),
  step: z.number().int().min(1).max(5),
  name: z.string().trim().min(2).max(160),
  legal_name: z.string().trim().max(200).optional().default(""),
  dba_name: z.string().trim().max(200).optional().default(""),
  client_type: z.enum(CLIENT_TYPES).optional(),
  primary_contact_name: z.string().trim().max(160).optional().default(""),
  primary_contact_email: z.string().trim().email().max(200).optional().or(z.literal("")).default(""),
  phone: z.string().trim().max(40).optional().default(""),
  website: z.string().trim().max(200).optional().default(""),
  entity_type: z.string().trim().max(80).optional().default(""),
  jurisdiction: z.string().trim().max(80).optional().default(""),
  ein: z.string().trim().max(20).optional().default(""),
  address: z.string().trim().max(400).optional().default(""),
  relationship_owner_id: z.string().uuid().nullable().optional(),
  referral_source: z.string().trim().max(200).optional().default(""),
  notes: z.string().trim().max(4000).optional().default(""),
});

/** Saves the Client step as a draft. Never activates services. EIN: only the last 4 digits are kept. */
export const saveClientDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => clientStep.parse(d))
  .handler(async ({ data, context }) => {
    const { roles } = await gate(context, "prepare");
    const db = await admin();
    if (data.ein && !einLast4(data.ein)) throw new Error("An EIN has 9 digits.");
    if (!data.id && !data.confirmDuplicate) {
      const { data: existing } = await db.from("clients").select("id, name, legal_name, primary_contact_email");
      const dupes = findDuplicateClients(
        { name: data.name, legal_name: data.legal_name, primary_email: data.primary_contact_email },
        (existing ?? []) as any[],
      );
      if (dupes.length) return { duplicates: dupes.map((d: any) => ({ id: d.id, name: d.name })), id: null };
    }
    const row: Record<string, unknown> = {
      name: data.name,
      legal_name: data.legal_name || null,
      dba_name: data.dba_name || null,
      client_type: data.client_type ?? null,
      primary_contact_name: data.primary_contact_name || null,
      primary_contact_email: data.primary_contact_email || null,
      phone: data.phone || null,
      website: data.website || null,
      entity_type: data.entity_type || null,
      jurisdiction: data.jurisdiction || null,
      address: data.address ? { text: data.address } : null,
      relationship_owner_id: data.relationship_owner_id ?? null,
      referral_source: data.referral_source || null,
      notes: data.notes || null,
      intake_step: data.step,
    };
    if (data.ein) row["ein_last4"] = einLast4(data.ein);
    if (data.id) {
      const { data: prev } = await db.from("clients").select("intake_status").eq("id", data.id).maybeSingle();
      if (!prev) throw new Error("Not found.");
      const { error } = await db.from("clients").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      await audit(context, roles, { clientId: data.id, area: "client", action: "intake updated", next: { ...row, ein_last4: row["ein_last4"] ? "••••" : undefined } });
      return { id: data.id, duplicates: [] };
    }
    const { data: created, error } = await db
      .from("clients")
      .insert({ ...row, status: "prospect", intake_status: "draft", created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await audit(context, roles, { clientId: created.id, area: "client", action: "created (intake draft)", next: { name: data.name, client_type: data.client_type ?? null } });
    return { id: created.id as string, duplicates: [] };
  });

export const getClientDraft = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await gate(context, "see");
    const db = await admin();
    const [{ data: client }, { data: contacts }] = await Promise.all([
      db.from("clients").select("*").eq("id", data.id).maybeSingle(),
      db.from("client_contacts").select("*").eq("client_id", data.id).order("created_at"),
    ]);
    if (!client) throw new Error("Not found.");
    return { client, contacts: contacts ?? [] };
  });

const contactInput = z.object({
  clientId: z.string().uuid(),
  contacts: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        full_name: z.string().trim().min(1).max(160),
        email: z.string().trim().email().max(200).optional().or(z.literal("")),
        phone: z.string().trim().max(40).optional().or(z.literal("")),
        title: z.string().trim().max(120).optional().or(z.literal("")),
        designations: z.array(z.enum(CONTACT_DESIGNATIONS)).max(6),
      }),
    )
    .max(40),
});

/** Contacts are records only — a designation never creates platform access or authority. */
export const saveClientContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => contactInput.parse(d))
  .handler(async ({ data, context }) => {
    const { roles } = await gate(context, "prepare");
    const db = await admin();
    const { data: existing } = await db.from("client_contacts").select("id").eq("client_id", data.clientId);
    const keep = new Set(data.contacts.map((c) => c.id).filter(Boolean));
    const remove = ((existing ?? []) as any[]).map((r) => r.id).filter((id) => !keep.has(id));
    if (remove.length) await db.from("client_contacts").delete().in("id", remove).eq("client_id", data.clientId);
    for (const c of data.contacts) {
      const row = { client_id: data.clientId, full_name: c.full_name, email: c.email || null, phone: c.phone || null, title: c.title || null, designations: c.designations, updated_at: new Date().toISOString() };
      if (c.id) await db.from("client_contacts").update(row).eq("id", c.id).eq("client_id", data.clientId);
      else await db.from("client_contacts").insert({ ...row, created_by: context.userId });
    }
    const primary = data.contacts.find((c) => c.designations.includes("Primary"));
    const billing = data.contacts.find((c) => c.designations.includes("Billing"));
    await db
      .from("clients")
      .update({
        intake_step: 3,
        ...(primary ? { primary_contact_name: primary.full_name, primary_contact_email: primary.email || null } : {}),
        ...(billing ? { billing_contact_name: billing.full_name, billing_contact_email: billing.email || null } : {}),
      })
      .eq("id", data.clientId);
    await audit(context, roles, { clientId: data.clientId, area: "client", action: "contacts saved", next: { count: data.contacts.length } });
    return { ok: true };
  });

export const saveExpectedServices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid(), services: z.array(z.string().max(80)).max(60) }).parse(d))
  .handler(async ({ data, context }) => {
    const { roles } = await gate(context, "prepare");
    const db = await admin();
    const { data: catalog } = await db.from("service_catalog").select("key").in("key", data.services);
    const valid = ((catalog ?? []) as any[]).map((r) => r.key as string);
    // Expected services only — nothing becomes an active engagement here.
    await db.from("clients").update({ expected_services: valid, intake_step: 4 }).eq("id", data.clientId);
    await audit(context, roles, { clientId: data.clientId, area: "client", action: "expected services set", next: valid });
    return { services: valid };
  });

export const finishIntake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid(), contractChoice: z.enum(["upload", "standard", "later"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { roles } = await gate(context, "prepare");
    const db = await admin();
    const { error } = await db
      .from("clients")
      .update({ intake_status: "complete", contract_choice: data.contractChoice, intake_step: 5 })
      .eq("id", data.clientId);
    if (error) throw new Error(error.message);
    await audit(context, roles, { clientId: data.clientId, area: "client", action: "intake completed", next: { contract: data.contractChoice } });
    return { ok: true };
  });

/* --------------------------------------------------------------- contracts */

const uploadInput = z.object({
  clientId: z.string().uuid(),
  docType: z.enum(GOVERNING_DOC_TYPES.map((d) => d.value) as [string, ...string[]]),
  title: z.string().trim().min(2).max(200),
  filename: z.string().trim().min(1).max(240),
  mimeType: z.string().max(120),
  base64: z.string().min(10),
  parentDocumentId: z.string().uuid().nullable().optional(),
  supersedesId: z.string().uuid().nullable().optional(),
});

/** Stores the original file unchanged, fingerprints it, then reads terms (proposals only). */
export const uploadContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => uploadInput.parse(d))
  .handler(async ({ data, context }) => {
    const { roles } = await contractGate(context, "upload_contracts");
    const kind = CONTRACT_MIME_TYPES[data.mimeType];
    if (!kind) throw new Error("Upload a PDF or Word (.docx) file.");
    const bytes = Uint8Array.from(Buffer.from(data.base64, "base64"));
    if (bytes.byteLength > MAX_CONTRACT_BYTES) throw new Error("Files must be 25 MB or smaller.");
    const magicOk = kind === "pdf" ? bytes[0] === 0x25 && bytes[1] === 0x50 : bytes[0] === 0x50 && bytes[1] === 0x4b;
    if (!magicOk) throw new Error("This file doesn't look like a real PDF or Word document.");
    const db = await admin();
    const { data: client } = await db.from("clients").select("id").eq("id", data.clientId).maybeSingle();
    if (!client) throw new Error("Not found.");
    for (const refId of [data.parentDocumentId, data.supersedesId]) {
      if (!refId) continue;
      const { data: ref } = await db.from("client_governing_documents").select("id, client_id").eq("id", refId).maybeSingle();
      const problem = parentProblem(ref, data.clientId);
      if (problem) throw new Error(problem);
    }
    const { sha256Hex } = await import("@/lib/contract-ingestion.server");
    const hash = await sha256Hex(bytes);
    const { data: dup } = await db
      .from("client_governing_documents")
      .select("id, title")
      .eq("client_id", data.clientId)
      .eq("sha256", hash)
      .maybeSingle();
    if (dup) return { documentId: dup.id as string, duplicate: true };

    let version = 1;
    if (data.supersedesId) {
      const { data: prev } = await db.from("client_governing_documents").select("version").eq("id", data.supersedesId).maybeSingle();
      version = Number(prev?.version ?? 0) + 1;
    }
    const id = crypto.randomUUID();
    const safeName = data.filename.replace(/[^\w.\- ]+/g, "_").slice(0, 120);
    const path = `${data.clientId}/${id}/${safeName}`;
    const { error: upErr } = await db.storage
      .from("client-contracts")
      .upload(path, bytes, { contentType: data.mimeType, upsert: false });
    if (upErr) throw new Error(upErr.message);
    const { error } = await db.from("client_governing_documents").insert({
      id,
      client_id: data.clientId,
      doc_type: data.docType,
      title: data.title,
      parent_document_id: data.parentDocumentId ?? null,
      supersedes_id: data.supersedesId ?? null,
      version,
      file_path: path,
      original_filename: data.filename,
      mime_type: data.mimeType,
      size_bytes: bytes.byteLength,
      sha256: hash,
      uploaded_by: context.userId,
    });
    if (error) throw new Error(error.message);
    await audit(context, roles, { clientId: data.clientId, action: "contract uploaded", target: id, next: { docType: data.docType, filename: data.filename, sha256: hash, version } });
    await runExtraction(context, roles, id);
    return { documentId: id, duplicate: false };
  });

async function runExtraction(context: any, roles: string[], documentId: string) {
  const db = await admin();
  const { data: doc } = await db.from("client_governing_documents").select("*").eq("id", documentId).maybeSingle();
  if (!doc) throw new Error("Not found.");
  if (doc.review_status === "approved" || doc.review_status === "superseded") throw new Error("Approved contracts aren't re-read.");
  const mod = await import("@/lib/contract-ingestion.server");
  const kind = CONTRACT_MIME_TYPES[doc.mime_type as string]!;
  const { data: file, error: dlErr } = await db.storage.from("client-contracts").download(doc.file_path);
  if (dlErr || !file) throw new Error("The original file couldn't be opened.");
  let pages: string[] = [];
  let chars = 0;
  try {
    ({ pages, chars } = await mod.readDocumentText(new Uint8Array(await file.arrayBuffer()), kind));
  } catch (e) {
    await db.from("contract_extractions").insert({ document_id: documentId, model: "none", prompt_version: mod.EXTRACTION_PROMPT_VERSION, status: "failed", error: (e as Error).message, created_by: context.userId });
    await db.from("client_governing_documents").update({ review_status: "manual_review_required" }).eq("id", documentId);
    await audit(context, roles, { clientId: doc.client_id, action: "extraction failed — manual review required", target: documentId });
    return;
  }
  if (mod.readableQuality(chars) === "poor") {
    await db.from("contract_extractions").insert({ document_id: documentId, model: "none", prompt_version: mod.EXTRACTION_PROMPT_VERSION, status: "poor_quality", text_chars: chars, page_count: pages.length, created_by: context.userId });
    await db.from("client_governing_documents").update({ review_status: "manual_review_required" }).eq("id", documentId);
    await audit(context, roles, { clientId: doc.client_id, action: "document requires manual review (poor text quality)", target: documentId });
    return;
  }
  try {
    const { terms } = await mod.extractTerms(pages);
    const { data: ex } = await db
      .from("contract_extractions")
      .insert({ document_id: documentId, model: mod.EXTRACTION_MODEL, prompt_version: mod.EXTRACTION_PROMPT_VERSION, status: "completed", text_chars: chars, page_count: pages.length, created_by: context.userId })
      .select("id")
      .single();
    await db.from("contract_terms").delete().eq("document_id", documentId);
    await db.from("contract_terms").insert(
      terms.map((t) => ({
        document_id: documentId,
        extraction_id: ex.id,
        category: t.category,
        term_key: t.key,
        label: t.label,
        material: t.material,
        extracted_value: t.value,
        current_value: t.value,
        amount_cents: t.amountCents,
        basis: t.basis,
        confidence: t.confidence,
        source_page: t.page,
        source_section: t.section,
        source_quote: t.quote,
        status: "needs_review",
      })),
    );
    await db.from("client_governing_documents").update({ review_status: "awaiting_review", updated_at: new Date().toISOString() }).eq("id", documentId);
    await audit(context, roles, { clientId: doc.client_id, action: "terms extracted (awaiting review)", target: documentId, next: { model: mod.EXTRACTION_MODEL, promptVersion: mod.EXTRACTION_PROMPT_VERSION, found: terms.filter((t) => t.basis !== "not_found").length, ambiguous: terms.filter((t) => t.ambiguous).length } });
  } catch (e) {
    await db.from("contract_extractions").insert({ document_id: documentId, model: mod.EXTRACTION_MODEL, prompt_version: mod.EXTRACTION_PROMPT_VERSION, status: "failed", error: (e as Error).message, text_chars: chars, created_by: context.userId });
    await db.from("client_governing_documents").update({ review_status: "extraction_failed" }).eq("id", documentId);
    await audit(context, roles, { clientId: doc.client_id, action: "extraction failed", target: documentId, next: { error: (e as Error).message } });
  }
}

export const rereadContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ documentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { roles } = await contractGate(context, "upload_contracts");
    await runExtraction(context, roles, data.documentId);
    return { ok: true };
  });

export const getContractReview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ documentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { roles, contractCaps } = await contractGate(context, "view_contracts");
    const db = await admin();
    const { data: doc } = await db.from("client_governing_documents").select("*").eq("id", data.documentId).maybeSingle();
    if (!doc) throw new Error("Not found.");
    const [{ data: client }, { data: terms }, { data: changes }, { data: extractions }, { data: offerings }, { data: services }, { data: related }, signed] = await Promise.all([
      db.from("clients").select("id, name").eq("id", doc.client_id).maybeSingle(),
      db.from("contract_terms").select("*").eq("document_id", doc.id),
      db.from("contract_term_changes").select("*").eq("document_id", doc.id).order("changed_at", { ascending: false }),
      db.from("contract_extractions").select("id, model, prompt_version, status, text_chars, page_count, error, created_at").eq("document_id", doc.id).order("created_at", { ascending: false }),
      db.from("offerings").select("id, name").eq("client_id", doc.client_id),
      db.from("service_catalog").select("key, name").eq("active", true).order("sort_order"),
      db.from("client_governing_documents").select("id, title, doc_type, version, review_status, effective_date, standard_status").eq("client_id", doc.client_id).neq("id", doc.id),
      doc.source === "standard_template" ? Promise.resolve(null as any) : db.storage.from("client-contracts").createSignedUrl(doc.file_path, 300),
    ]);
    const [{ data: rels }, { data: precedenceHistory }] = await Promise.all([
      db.from("contract_document_relationships").select("*").or(`document_id.eq.${doc.id},related_document_id.eq.${doc.id}`).order("recorded_at", { ascending: false }),
      db.from("contract_precedence_determinations").select("*").eq("document_id", doc.id).order("decided_at", { ascending: false }),
    ]);
    await audit(context, roles, { clientId: doc.client_id, action: "contract viewed", target: doc.id });
    const order = new Map<string, number>();
    const { TERM_CATALOG } = await import("@/lib/contract-ingestion");
    TERM_CATALOG.forEach((t, i) => order.set(t.key, i));
    return {
      doc,
      client,
      terms: ((terms ?? []) as any[]).sort((a, b) => (order.get(a.term_key) ?? 99) - (order.get(b.term_key) ?? 99)),
      changes: changes ?? [],
      extractions: extractions ?? [],
      offerings: offerings ?? [],
      services: services ?? [],
      related: related ?? [],
      fileUrl: signed?.data?.signedUrl ?? null,
      relationships: rels ?? [],
      precedenceHistory: precedenceHistory ?? [],
      blockers: approvalBlockers(doc, (terms ?? []) as any[]),
      caps: contractCaps,
      mayEdit: contractCaps.includes("review_terms"),
      mayCorrect: contractCaps.includes("correct_terms"),
      mayConfirmExecution: contractCaps.includes("confirm_execution"),
      mayReviewPrecedence: contractCaps.includes("review_precedence"),
      mayApprovePrecedence: contractCaps.includes("approve_precedence"),
      me: context.userId as string,
      mayApprove: contractCaps.includes("approve_terms"),
      mayConfigurePricing: contractCaps.includes("configure_pricing"),
    };
  });

const termReview = z.object({
  termId: z.string().uuid(),
  status: z.enum(["confirmed", "corrected", "not_applicable", "needs_review"]),
  value: z.string().max(4000).nullable().optional(),
  amountCents: centsSchema.nullable().optional(),
  pricingModel: z.enum(PRICING_MODEL_VALUES).nullable().optional(),
  serviceKey: z.string().max(80).nullable().optional(),
  reason: z.string().trim().max(1000).optional().default(""),
});

export const reviewTerm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => friendlyParse(termReview, d))
  .handler(async ({ data, context }) => {
    const { roles, contractCaps } = await contractGate(context, "review_terms");
    const db = await admin();
    const { data: term } = await db.from("contract_terms").select("*, client_governing_documents(client_id, review_status)").eq("id", data.termId).maybeSingle();
    if (!term) throw new Error("Not found.");
    const doc = (term as any).client_governing_documents;
    if (doc.review_status === "approved" || doc.review_status === "superseded") throw new Error("Approved terms can't change — upload an amendment.");
    const nextValue = data.value === undefined ? term.current_value : data.value;
    const valueChanged = (nextValue ?? null) !== (term.current_value ?? null) || (data.amountCents !== undefined && data.amountCents !== term.amount_cents);
    if (data.status === "corrected" && !data.reason) throw new Error("Give a reason for the correction.");
    if ((data.status === "corrected" || valueChanged || data.serviceKey !== undefined) && !contractCaps.includes("correct_terms"))
      throw new Error('Forbidden: changing a term needs the "correct_terms" contract permission.');
    if (valueChanged && data.status === "confirmed") throw new Error("A changed value must be marked Corrected.");
    if (data.pricingModel && pricingNeedsAmount(data.pricingModel) && data.amountCents == null && (data.status === "confirmed" || data.status === "corrected"))
      throw new Error("Enter a valid service price or select another pricing method.");
    const update = {
      status: data.status,
      current_value: nextValue ?? null,
      amount_cents: data.amountCents === undefined ? term.amount_cents : data.amountCents,
      service_key: data.serviceKey === undefined ? term.service_key : data.serviceKey,
      ...(data.pricingModel !== undefined ? { pricing_model: data.pricingModel } : {}),
      reviewed_by: context.userId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error } = await db.from("contract_terms").update(update).eq("id", term.id);
    if (error) throw new Error(error.message);
    await db.from("contract_term_changes").insert({
      term_id: term.id,
      document_id: term.document_id,
      previous_value: term.current_value,
      new_value: update.current_value,
      previous_status: term.status,
      new_status: data.status,
      reason: data.reason || null,
      source_reference: [term.source_page && `p. ${term.source_page}`, term.source_section].filter(Boolean).join(" · ") || null,
      changed_by: context.userId,
    });
    await audit(context, roles, { clientId: doc.client_id, action: `term ${data.status}`, target: term.document_id, previous: { key: term.term_key, value: term.current_value, status: term.status }, next: { value: update.current_value, status: data.status, reason: data.reason } });
    return { ok: true };
  });

const docReview = z.object({
  documentId: z.string().uuid(),
  title: z.string().trim().min(2).max(200).optional(),
  docType: z.enum(GOVERNING_DOC_TYPES.map((d) => d.value) as [string, ...string[]]).optional(),
  executionStatus: z.enum(["needs_review", "executed_confirmed", "not_executed"]).optional(),
  precedenceStatus: z.enum(["requires_review", "confirmed", "not_applicable"]).optional(),
  precedenceNote: z.string().trim().max(2000).nullable().optional(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  expirationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  noticeDays: z.number().int().min(0).max(3650).nullable().optional(),
  appliesToOfferingIds: z.array(z.string().uuid()).max(100).optional(),
  appliesToServiceKeys: z.array(z.string().max(80)).max(50).optional(),
  precedenceSource: z.string().trim().max(500).nullable().optional(),
});

export const updateContractDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => docReview.parse(d))
  .handler(async ({ data, context }) => {
    const need: ContractCapability[] = ["review_terms"];
    if (data.executionStatus !== undefined) need.push("confirm_execution");
    if (data.precedenceStatus !== undefined || data.precedenceNote !== undefined) need.push("review_precedence");
    const { roles } = await contractGate(context, need);
    const db = await admin();
    const { data: doc } = await db.from("client_governing_documents").select("*").eq("id", data.documentId).maybeSingle();
    if (!doc) throw new Error("Not found.");
    if (doc.review_status === "approved" || doc.review_status === "superseded") throw new Error("Approved documents can't change — upload an amendment.");
    if (data.precedenceStatus === "confirmed" && !(data.precedenceNote ?? doc.precedence_note ?? "").trim())
      throw new Error("Record the reason or source for the precedence determination.");
    if (data.appliesToOfferingIds?.length) {
      const { data: owned } = await db.from("offerings").select("id").eq("client_id", doc.client_id).in("id", data.appliesToOfferingIds);
      if ((owned ?? []).length !== data.appliesToOfferingIds.length) throw new Error("A selected fund doesn't belong to this client.");
    }
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.title !== undefined) patch["title"] = data.title;
    if (data.docType !== undefined) patch["doc_type"] = data.docType;
    if (data.executionStatus !== undefined) patch["execution_status"] = data.executionStatus;
    if (data.precedenceStatus !== undefined) patch["precedence_status"] = data.precedenceStatus;
    if (data.precedenceNote !== undefined) patch["precedence_note"] = data.precedenceNote;
    if (data.effectiveDate !== undefined) patch["effective_date"] = data.effectiveDate;
    if (data.expirationDate !== undefined) patch["expiration_date"] = data.expirationDate;
    if (data.noticeDays !== undefined) patch["notice_days"] = data.noticeDays;
    if (data.appliesToOfferingIds !== undefined) patch["applies_to_offering_ids"] = data.appliesToOfferingIds;
    if (data.appliesToServiceKeys !== undefined) patch["applies_to_service_keys"] = data.appliesToServiceKeys;
    const { error } = await db.from("client_governing_documents").update(patch).eq("id", doc.id);
    if (error) throw new Error(error.message);
    if (data.precedenceStatus !== undefined && data.precedenceStatus !== doc.precedence_status) {
      await db.from("contract_precedence_determinations").insert({
        document_id: doc.id,
        previous_status: doc.precedence_status,
        new_status: data.precedenceStatus,
        note: data.precedenceNote ?? doc.precedence_note ?? null,
        source_reference: data.precedenceSource ?? null,
        decided_by: context.userId,
      });
    }
    const previous = Object.fromEntries(Object.keys(patch).map((k) => [k, doc[k]]));
    await audit(context, roles, { clientId: doc.client_id, action: "contract details reviewed", target: doc.id, previous, next: patch });
    return { ok: true };
  });

/** "Approve Contract Terms" — the only path by which terms become operational. */
export const approveContractTerms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ documentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { roles, contractCaps } = await contractGate(context, "approve_terms");
    const db = await admin();
    const { data: doc } = await db.from("client_governing_documents").select("*").eq("id", data.documentId).maybeSingle();
    if (!doc) throw new Error("Not found.");
    const { data: terms } = await db.from("contract_terms").select("*").eq("document_id", doc.id);
    const blockers = approvalBlockers(doc, (terms ?? []) as any[]);
    if (blockers.length) throw new Error(blockers.join(" "));
    const now = new Date().toISOString();
    // Notice days from the approved termination term when the reviewer didn't set them explicitly.
    const notice = doc.notice_days ?? parseDays(((terms ?? []) as any[]).find((t) => t.term_key === "termination_notice" && (t.status === "confirmed" || t.status === "corrected"))?.current_value);
    const { error } = await db
      .from("client_governing_documents")
      .update({ review_status: "approved", approved_by: context.userId, approved_at: now, notice_days: notice ?? null, updated_at: now })
      .eq("id", doc.id)
      .eq("review_status", doc.review_status);
    if (error) throw new Error(error.message);
    await audit(context, roles, { clientId: doc.client_id, action: "contract terms approved", target: doc.id });

    if (!contractCaps.includes("configure_pricing")) {
      await audit(context, roles, { clientId: doc.client_id, action: "contract pricing awaiting configuration", target: doc.id });
      return { applied: 0, skipped: [{ termId: "*", reason: "Pricing waits for someone with Configure Contract Pricing" }] };
    }
    return applyApprovedPricing(context, roles, doc, (terms ?? []) as any[]);
  });

/** Configure Contract Pricing — applies an approved document's reviewed prices (idempotent). */
export const applyContractPricing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ documentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { roles } = await contractGate(context, "configure_pricing");
    const db = await admin();
    const { data: doc } = await db.from("client_governing_documents").select("*").eq("id", data.documentId).maybeSingle();
    if (!doc) throw new Error("Not found.");
    if (doc.review_status !== "approved") throw new Error("Only approved contract terms can drive pricing.");
    const { data: terms } = await db.from("contract_terms").select("*").eq("document_id", doc.id);
    return applyApprovedPricing(context, roles, doc, (terms ?? []) as any[]);
  });

async function applyApprovedPricing(context: any, roles: string[], doc: any, terms: any[]) {
    const db = await admin();
    const now = new Date().toISOString();
    // Apply: client/engagement pricing as contract-specific rows (standard pricing untouched).
    const plan = planPricingApplication({ ...doc, review_status: "approved" }, terms);
    for (const row of plan.rows) {
      const { data: std } = await db.from("service_catalog").select("standard_price_cents").eq("key", row.service_key).maybeSingle();
      await db.from("client_pricing").upsert(
        {
          client_id: doc.client_id,
          service_key: row.service_key,
          label: row.label,
          standard_cents: std?.standard_price_cents ?? null,
          contracted_cents: row.contracted_cents,
          discount_note: "Contract-specific pricing",
          pricing_source: "contract",
          source_document_id: doc.id,
          source_term_id: row.source_term_id,
          offering_id: row.offering_id,
          effective_date: row.effective_date,
          approved_by: context.userId,
          approved_at: now,
        },
        { onConflict: "source_term_id", ignoreDuplicates: true },
      );
    }
    if (doc.supersedes_id) {
      await db.from("client_governing_documents").update({ review_status: "superseded", superseded_at: now }).eq("id", doc.supersedes_id).eq("client_id", doc.client_id);
      await db.from("client_pricing").update({ superseded_at: now }).eq("source_document_id", doc.supersedes_id).is("superseded_at", null);
      await audit(context, roles, { clientId: doc.client_id, action: "contract superseded", target: doc.supersedes_id, next: { by: doc.id } });
    }
    await db.from("client_governing_documents").update({ applied_at: now }).eq("id", doc.id);
    await audit(context, roles, { clientId: doc.client_id, action: "approved terms applied", target: doc.id, next: { pricingRows: plan.rows.length, skipped: plan.skipped } });
    return { applied: plan.rows.length, skipped: plan.skipped };
}

export const listClientContracts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { contractCaps } = await contractGate(context, "view_contracts");
    const db = await admin();
    const [{ data: docs }, { data: pricing }, { data: offerings }, { data: contacts }, { data: client }] = await Promise.all([
      db.from("client_governing_documents").select("*").eq("client_id", data.clientId).order("uploaded_at", { ascending: false }),
      db.from("client_pricing").select("id, service_key, label, standard_cents, contracted_cents, pricing_source, offering_id, effective_date, superseded_at, source_document_id").eq("client_id", data.clientId),
      db.from("offerings").select("id, name").eq("client_id", data.clientId),
      db.from("client_contacts").select("*").eq("client_id", data.clientId).order("created_at"),
      db.from("clients").select("id, name, client_type, expected_services, intake_status, contract_choice, relationship_owner_id").eq("id", data.clientId).maybeSingle(),
    ]);
    if (!client) throw new Error("Not found.");
    const approvedIds = ((docs ?? []) as any[]).filter((d) => d.review_status === "approved").map((d) => d.id);
    const { data: keyTerms } = approvedIds.length
      ? await db.from("contract_terms").select("document_id, term_key, label, current_value, status").in("document_id", approvedIds).in("term_key", ["termination_notice", "auto_renewal", "renewal_notice_deadline", "initial_term", "special_terms"])
      : { data: [] };
    const today = new Date().toISOString().slice(0, 10);
    return {
      client,
      contacts: contacts ?? [],
      offerings: offerings ?? [],
      pricing: contractCaps.includes("view_pricing") ? pricing ?? [] : [],
      documents: ((docs ?? []) as any[]).map((d) => ({
        ...d,
        alerts: contractAlerts(d, today),
        keyTerms: ((keyTerms ?? []) as any[]).filter((t) => t.document_id === d.id && t.status !== "not_applicable"),
      })),
      mayUpload: contractCaps.includes("upload_contracts"),
      mayApprove: contractCaps.includes("approve_terms"),
      mayGenerateStandard: contractCaps.includes("generate_standard"),
      mayViewPricing: contractCaps.includes("view_pricing"),
    };
  });
