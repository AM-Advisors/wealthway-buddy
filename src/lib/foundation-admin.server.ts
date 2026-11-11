/**
 * Server-only Foundation Administration (phase 1). Every call re-checks the feature flag, the caller's
 * Operations capabilities or exact-client membership, and that the entity belongs to that client.
 * Nothing here sends email, creates funds, issues invoices, files anything or moves money.
 */
import { capabilitiesFor, hasOperationsEntry } from "@/lib/ops-capabilities";
import {
  FOUNDATION_FLAG, annualReturnReferenceDate, authorityProblem, componentByKey, foundationAccessProblem,
  foundationCoverageConflict, foundationHandoffTasks, foundationLineInputSchema, foundationLineLabel,
  foundationReleaseBlocker, foundationSnapshot, isFoundationKey, priceFoundationLine,
  type ComponentKey, type FoundationActionKind, type FoundationCoverageRow,
} from "@/lib/foundation-admin-model";

import { FOUNDATION_FLAGS, NOTHING_RELEASED, releasedSets, type FoundationFlagKey, type ReleaseEvent, type ReleasedSets } from "@/lib/foundation-release-model";

export const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
const today = () => new Date().toISOString().slice(0, 10);
export const must = <T>(r: { data: T; error: any }, msg: string): T => { if (r.error) { console.error(msg, r.error); throw new Error(msg); } return r.data; };

/** Missing row means off. Each switch is separate; none of them releases a service component. */
export async function foundationFlagEnabled(db?: any, key: FoundationFlagKey = FOUNDATION_FLAG): Promise<boolean> {
  const d = db ?? await admin();
  const { data } = await d.from("platform_feature_flags").select("enabled").eq("key", key).maybeSingle();
  return data?.enabled === true;
}

export async function foundationFlags(db: any): Promise<Record<FoundationFlagKey, boolean>> {
  const { data } = await db.from("platform_feature_flags").select("key, enabled").in("key", Object.keys(FOUNDATION_FLAGS));
  const on = new Set(((data ?? []) as any[]).filter((r) => r.enabled === true).map((r) => r.key));
  return Object.fromEntries(Object.keys(FOUNDATION_FLAGS).map((k) => [k, on.has(k)])) as Record<FoundationFlagKey, boolean>;
}

/** Released components from the append-only release history (same rule as the database). */
export async function foundationReleasedSets(db: any): Promise<ReleasedSets> {
  const { data, error } = await db.from("foundation_component_release_events").select("id, component, dimension, action, request_id, evidence, reason, actor_id, created_at");
  if (error) { console.error("foundation releases", error); return NOTHING_RELEASED; }
  return releasedSets((data ?? []) as ReleaseEvent[]);
}

export async function actor(db: any, userId: string) {
  const [{ data: roleRows }, { data: members }] = await Promise.all([
    db.from("user_roles").select("role").eq("user_id", userId),
    db.from("client_users").select("client_id").eq("user_id", userId).is("revoked_at", null),
  ]);
  const roles = ((roleRows ?? []) as any[]).map((r) => String(r.role));
  const capabilities = hasOperationsEntry(roles) ? capabilitiesFor(roles) : [];
  return { roles, capabilities: capabilities as string[], memberClientIds: ((members ?? []) as any[]).map((m) => m.client_id as string), superAdmin: roles.includes("super_admin") };
}

async function authorize(db: any, userId: string, clientId: string, write: boolean) {
  const a = await actor(db, userId);
  const problem = foundationAccessProblem({ ...a, clientId, write });
  if (problem) throw new Error(problem);
  if (!(await foundationFlagEnabled(db))) throw new Error("Foundation Administration is turned off.");
  return a;
}

export async function profileFor(db: any, profileId: string) {
  const p = must(await db.from("foundation_profiles").select("*").eq("id", profileId).maybeSingle(), "Couldn't read the foundation.");
  if (!p) throw new Error("Foundation not found.");
  return p as any;
}

export async function logEvent(db: any, profileId: string, actorId: string, event: string, detail: Record<string, unknown> = {}) {
  must(await db.from("foundation_profile_events").insert({ foundation_profile_id: profileId, actor_id: actorId, event, detail }), "Couldn't record the foundation history. Nothing else changed.");
}

// ------------------------------------------------------------ Flag

export async function setFoundationFlag(userId: string, d: { key?: FoundationFlagKey | undefined; enabled: boolean; reason: string }) {
  const db = await admin();
  const a = await actor(db, userId);
  if (!a.superAdmin) throw new Error("Only a Super Admin can turn Foundation Administration on or off.");
  if (d.reason.trim().length < 3) throw new Error("Give a short reason.");
  const key = d.key ?? FOUNDATION_FLAG;
  if (!(key in FOUNDATION_FLAGS)) throw new Error("Unknown setting.");
  if (d.enabled && key !== FOUNDATION_FLAG && !(await foundationFlagEnabled(db))) throw new Error("Turn on the staff workspace first.");
  must(await db.from("platform_feature_flags").upsert({ key, enabled: d.enabled, reason: d.reason.trim(), updated_by: userId, updated_at: new Date().toISOString() }), "Couldn't change the setting.");
  return { key, enabled: d.enabled };
}

// ------------------------------------------------------------ Workspace

export async function getFoundationWorkspace(userId: string, clientId: string) {
  const db = await admin();
  const a = await actor(db, userId);
  const problem = foundationAccessProblem({ ...a, clientId, write: false });
  if (problem) throw new Error(problem);
  const flags = await foundationFlags(db);
  const enabled = flags.foundation_administration;
  const base = { enabled, flags, canEdit: a.capabilities.includes("clients:prepare"), canReview: a.capabilities.includes("clients:review"), canToggle: a.superAdmin, userId };
  if (!enabled) return { ...base, entities: [], people: [], foundations: [] };

  const [entities, contacts, profiles] = await Promise.all([
    db.from("client_entities").select("id, legal_name, short_name, entity_type, jurisdiction, formation_date, tax_id_masked, tax_id_status, offering_id, status").eq("client_id", clientId).order("legal_name"),
    db.from("client_contacts").select("person_id, full_name, email, title, status").eq("client_id", clientId).not("person_id", "is", null),
    db.from("foundation_profiles").select("*").eq("client_id", clientId).order("created_at"),
  ]);
  const ents = must(entities, "Couldn't read the client's entities.") as any[];
  const profs = must(profiles, "Couldn't read foundations.") as any[];
  const people = ((must(contacts, "Couldn't read the client's people.") ?? []) as any[]).filter((c) => c.status !== "inactive")
    .map((c) => ({ personId: c.person_id as string, name: c.full_name as string, email: c.email as string | null, title: c.title as string | null }));
  const profileIds = profs.map((p) => p.id);
  const entityIds = profs.map((p) => p.client_entity_id);
  const [auth, docs, events, tasks, lines] = profileIds.length ? await Promise.all([
    db.from("foundation_authority_roles").select("*").in("foundation_profile_id", profileIds).order("created_at"),
    db.from("foundation_documents").select("id, foundation_profile_id, kind, title, file_name, size_bytes, superseded_by, uploaded_at, uploaded_by, source").in("foundation_profile_id", profileIds).order("uploaded_at", { ascending: false }),
    db.from("foundation_profile_events").select("id, foundation_profile_id, event, detail, created_at").in("foundation_profile_id", profileIds).order("created_at", { ascending: false }).limit(100),
    db.from("staff_tasks").select("id, title, status, due_date, related_entity_id, assignee_user_id").eq("client_id", clientId).in("related_entity_id", entityIds).order("due_date", { ascending: true }),
    db.from("sales_quote_lines").select("quote_id, label, unit_cents, billing_frequency, foundation_snapshot").not("foundation_snapshot", "is", null),
  ]) : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const docIds = ((docs.data ?? []) as any[]).map((d) => d.id);
  const reviews = docIds.length ? (((await db.from("foundation_document_reviews").select("document_id, decision, note, created_at").in("document_id", docIds).order("created_at")).data ?? []) as any[]) : [];
  const latestReview = new Map<string, any>(); for (const r of reviews) latestReview.set(r.document_id, r);
  for (const d of (docs.data ?? []) as any[]) { const r = latestReview.get(d.id); d.review = r?.decision ?? null; d.review_note = r?.note ?? null; d.usable = !d.superseded_by && (d.source === "staff" || d.review === "accepted"); }
  const fLines = ((lines.data ?? []) as any[]).filter((l) => entityIds.includes(l.foundation_snapshot?.clientEntityId));
  const quoteIds = [...new Set(fLines.map((l) => l.quote_id))];
  const quotes = quoteIds.length ? ((await db.from("sales_quotes").select("id, quote_number, version, status, title, client_id, deleted_at").in("id", quoteIds)).data ?? []) as any[] : [];
  const persons = new Map(people.map((p) => [p.personId, p.name]));
  const ref = today();
  return {
    ...base,
    entities: ents.map((e) => ({ ...e, eligible: !e.offering_id && !["fund", "spv", "series"].includes(e.entity_type), hasProfile: entityIds.includes(e.id) })),
    people,
    foundations: profs.map((p) => {
      const entity = ents.find((e) => e.id === p.client_entity_id) ?? null;
      const docsFor = ((docs.data ?? []) as any[]).filter((d) => d.foundation_profile_id === p.id);
      return {
        profile: p, entity,
        primaryContactName: p.primary_contact_person_id ? persons.get(p.primary_contact_person_id) ?? "Person on file" : null,
        authority: ((auth.data ?? []) as any[]).filter((r) => r.foundation_profile_id === p.id).map((r) => ({ ...r, personName: persons.get(r.person_id) ?? "Person on file", evidenceTitle: docsFor.find((d) => d.id === r.evidence_document_id)?.title ?? null })),
        documents: docsFor,
        events: ((events.data ?? []) as any[]).filter((e) => e.foundation_profile_id === p.id).slice(0, 25),
        tasks: ((tasks.data ?? []) as any[]).filter((t) => t.related_entity_id === p.client_entity_id),
        quotes: quotes.filter((q) => !q.deleted_at && q.client_id === clientId).map((q) => ({ ...q, lines: fLines.filter((l) => l.quote_id === q.id && l.foundation_snapshot?.clientEntityId === p.client_entity_id).map((l) => ({ label: l.label, unitCents: Number(l.unit_cents), billing: l.billing_frequency, priceSource: l.foundation_snapshot?.priceSource })) })).filter((q) => q.lines.length),
        referenceDeadline: annualReturnReferenceDate(p.fiscal_year_end_month, ref),
      };
    }),
  };
}

// ------------------------------------------------------------ Profile

export type FoundationProfileInput = {
  id?: string | null | undefined; clientId: string; clientEntityId: string;
  legalStructure: string; legalStructureOther?: string | null | undefined; classification: string; exemptionStatus: string;
  exemptionEffectiveOn?: string | null | undefined; determinationLetterOn?: string | null | undefined;
  fiscalYearEndMonth?: number | null | undefined; mission?: string | null | undefined; primaryContactPersonId?: string | null | undefined;
};

export async function saveFoundationProfile(userId: string, d: FoundationProfileInput) {
  const db = await admin();
  await authorize(db, userId, d.clientId, true);
  const entity = must(await db.from("client_entities").select("id, client_id, offering_id, entity_type, legal_name").eq("id", d.clientEntityId).maybeSingle(), "Couldn't read that entity.") as any;
  if (!entity || entity.client_id !== d.clientId) throw new Error("That entity doesn't belong to this client.");
  if (entity.offering_id || ["fund", "spv", "series"].includes(entity.entity_type)) throw new Error("Funds, SPVs and series can't be set up as foundations. Investing foundations use their own investment profile.");
  if (d.primaryContactPersonId) {
    const { data: c } = await db.from("client_contacts").select("id").eq("client_id", d.clientId).eq("person_id", d.primaryContactPersonId).limit(1);
    if (!c?.length) throw new Error("The primary contact must be one of this client's people.");
  }
  if (d.exemptionStatus === "determined" && !d.determinationLetterOn) throw new Error("Enter the determination letter date, or choose a different exemption status.");
  const row = {
    legal_structure: d.legalStructure, legal_structure_other: d.legalStructure === "other" ? (d.legalStructureOther?.trim() || null) : null,
    classification: d.classification, exemption_status: d.exemptionStatus,
    exemption_effective_on: d.exemptionEffectiveOn || null, determination_letter_on: d.determinationLetterOn || null,
    fiscal_year_end_month: d.fiscalYearEndMonth ?? null, mission: d.mission?.trim() || null,
    primary_contact_person_id: d.primaryContactPersonId || null, updated_by: userId, updated_at: new Date().toISOString(),
  };
  if (d.id) {
    const before = await profileFor(db, d.id);
    if (before.client_id !== d.clientId || before.client_entity_id !== d.clientEntityId) throw new Error("Foundation not found.");
    must(await db.from("foundation_profiles").update(row).eq("id", d.id), "Couldn't save the foundation.");
    const changed = Object.keys(row).filter((k) => !["updated_by", "updated_at"].includes(k) && String((before as any)[k] ?? "") !== String((row as any)[k] ?? ""));
    if (changed.length) await logEvent(db, d.id, userId, "profile_updated", { fields: changed, from: Object.fromEntries(changed.map((k) => [k, (before as any)[k] ?? null])), to: Object.fromEntries(changed.map((k) => [k, (row as any)[k] ?? null])) });
    return { id: d.id };
  }
  const created = must(await db.from("foundation_profiles").insert({ ...row, client_id: d.clientId, client_entity_id: d.clientEntityId, created_by: userId }).select("id").single(), "Couldn't create the foundation. It may already exist for that entity.") as any;
  await logEvent(db, created.id, userId, "profile_created", { entity: entity.legal_name, classification: d.classification, exemptionStatus: d.exemptionStatus });
  return { id: created.id as string };
}

export async function storeFoundationTaxId(userId: string, d: { profileId: string; ein: string }) {
  const db = await admin();
  const p = await profileFor(db, d.profileId);
  await authorize(db, userId, p.client_id, true);
  const digits = d.ein.replace(/\D/g, "");
  if (digits.length !== 9) throw new Error("An EIN has 9 digits.");
  const { encryptTin } = await import("@/lib/irs-forms.server");
  const enc = await encryptTin(digits);
  must(await db.rpc("store_client_entity_tax_id", { _entity: p.client_entity_id, _ciphertext: enc.ciphertext, _iv: enc.iv, _key_version: enc.keyVersion, _last4: digits.slice(-4), _actor: userId }), "Couldn't store the EIN securely.");
  await logEvent(db, p.id, userId, "tax_id_stored", { last4: digits.slice(-4) });
  return { masked: `•••••${digits.slice(-4)}` };
}

// ------------------------------------------------------------ Documents

const KINDS = ["governing_document", "determination_letter", "authority_evidence", "supporting_evidence"];
const MIMES = ["application/pdf", "image/png", "image/jpeg", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword"];

export type FoundationUpload = { profileId: string; kind: string; title: string; fileName: string; mimeType: string; base64: string; replacesId?: string | null | undefined };

export async function uploadFoundationDocument(userId: string, d: FoundationUpload) {
  const db = await admin();
  const p = await profileFor(db, d.profileId);
  await authorize(db, userId, p.client_id, true);
  return storeFoundationDocument(db, p, userId, d, "staff");
}

/** Shared by staff and client uploads; callers authorize first. Client uploads stay pending until someone else reviews them. */
export async function storeFoundationDocument(db: any, p: any, userId: string, d: FoundationUpload, source: "staff" | "client") {
  if (!KINDS.includes(d.kind)) throw new Error("Choose the document type.");
  if (!MIMES.includes(d.mimeType)) throw new Error("Upload a PDF, Word document or image.");
  const bytes = Uint8Array.from(atob(d.base64), (c) => c.charCodeAt(0));
  if (!bytes.length || bytes.length > 25 * 1024 * 1024) throw new Error("Files must be under 25 MB.");
  if (d.replacesId) {
    const old = must(await db.from("foundation_documents").select("id, foundation_profile_id, superseded_by").eq("id", d.replacesId).maybeSingle(), "Couldn't read the document being replaced.") as any;
    if (!old || old.foundation_profile_id !== p.id || old.superseded_by) throw new Error("Only a current document of this foundation can be replaced.");
    if (source === "client") {
      const { data: full } = await db.from("foundation_documents").select("source").eq("id", d.replacesId).maybeSingle();
      if (full?.source !== "client") throw new Error("Documents Harmonious recorded can't be replaced here. Upload a new document instead.");
      const { data: last } = await db.from("foundation_document_reviews").select("decision").eq("document_id", d.replacesId).order("created_at", { ascending: false }).limit(1);
      if ((last ?? [])[0]?.decision === "accepted") throw new Error("That document was already accepted. Upload a new document instead, and Harmonious will review it.");
    }
  }
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const docId = crypto.randomUUID();
  const safe = d.fileName.replace(/[^\w.\- ]+/g, "_").slice(-120) || "document";
  const path = `${p.client_id}/foundation/${p.id}/${docId}/${safe}`;
  const up = await db.storage.from("client-contracts").upload(path, bytes, { contentType: d.mimeType, upsert: false });
  if (up.error) { console.error("foundation upload", up.error); throw new Error("Couldn't upload the file."); }
  must(await db.from("foundation_documents").insert({ id: docId, foundation_profile_id: p.id, kind: d.kind, title: d.title.trim(), storage_path: path, file_name: safe, mime_type: d.mimeType, size_bytes: bytes.length, sha256: hash, uploaded_by: userId, source }), "Couldn't record the document.");
  if (d.replacesId) must(await db.from("foundation_documents").update({ superseded_by: docId }).eq("id", d.replacesId).is("superseded_by", null), "The file was saved but the older version couldn't be marked as replaced.");
  await logEvent(db, p.id, userId, d.replacesId ? "document_replaced" : "document_uploaded", { documentId: docId, kind: d.kind, title: d.title.trim(), replaces: d.replacesId ?? null, source });
  return { id: docId };
}

export async function openFoundationDocument(userId: string, documentId: string) {
  const db = await admin();
  const doc = must(await db.from("foundation_documents").select("*").eq("id", documentId).maybeSingle(), "Couldn't read the document.") as any;
  if (!doc) throw new Error("Document not found.");
  const p = await profileFor(db, doc.foundation_profile_id);
  await authorize(db, userId, p.client_id, false);
  const { data, error } = await db.storage.from(doc.storage_bucket).createSignedUrl(doc.storage_path, 60);
  if (error || !data?.signedUrl) throw new Error("Couldn't open the document.");
  await logEvent(db, p.id, userId, "document_opened", { documentId });
  return { url: data.signedUrl as string };
}

// ------------------------------------------------------------ People and authority

export async function addFoundationAuthority(userId: string, d: { profileId: string; personId: string; role: string; title?: string | null | undefined; scopes: string[]; evidenceDocumentId?: string | null | undefined; evidenceNote?: string | null | undefined; effectiveOn?: string | null | undefined }) {
  const db = await admin();
  const p = await profileFor(db, d.profileId);
  await authorize(db, userId, p.client_id, true);
  const problem = authorityProblem({ role: d.role, scopes: d.scopes, evidenceDocumentId: d.evidenceDocumentId ?? null });
  if (problem) throw new Error(problem);
  // Canonical Person, and only one already connected to this exact client.
  const { data: c } = await db.from("client_contacts").select("id").eq("client_id", p.client_id).eq("person_id", d.personId).limit(1);
  if (!c?.length) throw new Error("Choose one of this client's people. Add them under People first.");
  if (d.evidenceDocumentId) {
    const ev = must(await db.from("foundation_documents").select("id, foundation_profile_id, superseded_by").eq("id", d.evidenceDocumentId).maybeSingle(), "Couldn't read the evidence.") as any;
    if (!ev || ev.foundation_profile_id !== p.id || ev.superseded_by) throw new Error("Evidence must be a current document of this foundation.");
    const { data: ok } = await db.rpc("foundation_document_usable", { _doc: d.evidenceDocumentId });
    if (ok !== true) throw new Error("That evidence was uploaded by the client and hasn't been reviewed and accepted yet.");
  }
  const row = must(await db.from("foundation_authority_roles").insert({ foundation_profile_id: p.id, person_id: d.personId, role: d.role, title: d.title?.trim() || null, authority_scopes: [...new Set(d.scopes)], evidence_document_id: d.evidenceDocumentId || null, evidence_note: d.evidenceNote?.trim() || null, effective_on: d.effectiveOn || today(), created_by: userId }).select("id").single(), "Couldn't record that role. The person may already hold it.") as any;
  await logEvent(db, p.id, userId, "authority_recorded", { roleId: row.id, personId: d.personId, role: d.role, scopes: d.scopes, evidenceDocumentId: d.evidenceDocumentId ?? null });
  return { id: row.id as string };
}

export async function endFoundationAuthority(userId: string, d: { roleId: string; reason: string }) {
  const db = await admin();
  const r = must(await db.from("foundation_authority_roles").select("*").eq("id", d.roleId).maybeSingle(), "Couldn't read that role.") as any;
  if (!r) throw new Error("Role not found.");
  const p = await profileFor(db, r.foundation_profile_id);
  await authorize(db, userId, p.client_id, true);
  if (d.reason.trim().length < 3) throw new Error("Say why this role ended.");
  const done = must(await db.from("foundation_authority_roles").update({ status: "ended", ended_on: today(), ended_reason: d.reason.trim(), ended_by: userId }).eq("id", r.id).eq("status", "active").select("id"), "Couldn't end that role.") as any[];
  if (!done?.length) throw new Error("This role was already ended.");
  await logEvent(db, p.id, userId, "authority_ended", { roleId: r.id, reason: d.reason.trim() });
  return { ok: true };
}

// ------------------------------------------------------------ Operations handoff

export async function startFoundationHandoff(userId: string, d: { profileId: string; components: ComponentKey[] }) {
  const db = await admin();
  const p = await profileFor(db, d.profileId);
  await authorize(db, userId, p.client_id, true);
  const entity = must(await db.from("client_entities").select("legal_name").eq("id", p.client_entity_id).maybeSingle(), "Couldn't read the entity.") as any;
  const specs = foundationHandoffTasks(entity?.legal_name ?? "this foundation", d.components);
  const refs = specs.map((_, i) => `foundation:${p.id}:${i === 0 ? "records" : i === 1 ? "authority" : d.components.filter((k) => k !== "onboarding_setup")[i - 2]}`);
  const existing = new Set(((await db.from("staff_tasks").select("source_ref").in("source_ref", refs)).data ?? []).map((t: any) => t.source_ref));
  let created = 0;
  for (const [i, s] of specs.entries()) {
    if (existing.has(refs[i])) continue;
    const due = new Date(Date.now() + s.dueInDays * 86400000).toISOString().slice(0, 10);
    const t = must(await db.from("staff_tasks").insert({ title: s.title, description: s.description, status: "open", priority: "normal", team: s.team, created_by: userId, due_date: due, source: "workflow", source_ref: refs[i], client_id: p.client_id, offering_id: null, related_entity_id: p.client_entity_id, related_workflow_type: "foundation_administration", related_workflow_id: p.id, responsible_party_type: "HARMONIOUS", responsibility_status: "HARMONIOUS_HANDLING", client_visibility: false }).select("id").single(), "Couldn't create the Operations tasks.") as any;
    await db.from("staff_task_events").insert({ task_id: t.id, actor_user_id: userId, kind: "created", detail: { source: "foundation_administration" } });
    created++;
  }
  await logEvent(db, p.id, userId, "handoff_started", { created, components: d.components });
  return { created };
}

// ------------------------------------------------------------ Quote integration (called by the Sales quote engine)

/** Validates one Foundation Administration quote line and returns the priced line plus its frozen snapshot. */
export async function verifyFoundationQuoteLine(db: any, ctx: { clientId: string | null; rateCents: number | null; excludeQuoteIds: string[]; siblings: { component: ComponentKey; clientEntityId: string; serviceStartOn: string; serviceEndOn: string | null }[] }, raw: unknown) {
  if (!(await foundationQuotingEnabled(db))) throw new Error("Foundation Administration quoting is turned off.");
  const input = foundationLineInputSchema.parse(raw);
  if (!ctx.clientId) throw new Error("Choose the client before adding Foundation Administration.");
  const p = await profileFor(db, input.foundationProfileId);
  if (p.client_id !== ctx.clientId || p.client_entity_id !== input.clientEntityId || p.status !== "active") throw new Error("That foundation doesn't belong to the chosen client.");
  const entity = must(await db.from("client_entities").select("legal_name, client_id").eq("id", input.clientEntityId).maybeSingle(), "Couldn't read the foundation entity.") as any;
  if (!entity || entity.client_id !== ctx.clientId) throw new Error("That foundation doesn't belong to the chosen client.");
  const priced = priceFoundationLine(input, ctx.rateCents);
  if (!priced.ok) throw new Error(priced.problem);
  const rows = await foundationCoverageRows(db, input.clientEntityId, ctx.excludeQuoteIds);
  const sibling = ctx.siblings.map((s, i) => ({ source: "quote" as const, ref: `line-${i}`, component: s.component, clientEntityId: s.clientEntityId, startOn: s.serviceStartOn, endOn: s.serviceEndOn }));
  const conflict = foundationCoverageConflict(input, [...rows, ...sibling]);
  if (conflict) throw new Error(conflict);
  const snapshot = foundationSnapshot(input, priced.pricing, { entityName: entity.legal_name, checkedAt: new Date().toISOString() });
  const terms = snapshot.terms;
  return {
    input, snapshot, needsExecutiveApproval: priced.pricing.needsExecutiveApproval,
    line: { serviceKey: `FOUNDATION_ADMIN:${input.component}`, label: `${foundationLineLabel(input)} · ${entity.legal_name}`.slice(0, 300), quantity: 1,
      unitCents: priced.pricing.unitCents, baselineUnitCents: priced.pricing.baselineUnitCents, billingFrequency: input.billing, firstBillOn: input.billingStartOn,
      details: { scope: terms.scope, included: terms.included, excluded: terms.excluded } },
  };
}

async function foundationCoverageRows(db: any, entityId: string, excludeQuoteIds: string[]): Promise<FoundationCoverageRow[]> {
  const { data: lines, error } = await db.from("sales_quote_lines").select("quote_id, service_key, foundation_snapshot").eq("foundation_snapshot->>clientEntityId", entityId);
  if (error) throw new Error("Couldn't check existing foundation quotes.");
  const qids = [...new Set(((lines ?? []) as any[]).map((l) => l.quote_id))].filter((id) => !excludeQuoteIds.includes(id));
  const open = qids.length ? new Set((((await db.from("sales_quotes").select("id, status, deleted_at").in("id", qids)).data ?? []) as any[]).filter((q) => !q.deleted_at && !["superseded", "lost"].includes(q.status)).map((q) => q.id)) : new Set();
  const quoteRows: FoundationCoverageRow[] = ((lines ?? []) as any[]).filter((l) => open.has(l.quote_id)).map((l) => ({ source: "quote", ref: l.quote_id, component: l.foundation_snapshot?.component ?? null, clientEntityId: entityId, startOn: l.foundation_snapshot?.input?.serviceStartOn ?? null, endOn: l.foundation_snapshot?.input?.serviceEndOn ?? null }));
  const { data: engs } = await db.from("client_engagements").select("id").eq("entity_id", entityId);
  const engIds = ((engs ?? []) as any[]).map((e) => e.id);
  const svc = engIds.length ? (((await db.from("engagement_services").select("engagement_id, service_key, effective_date, end_date, status").in("engagement_id", engIds).like("service_key", "FOUNDATION_ADMIN:%")).data ?? []) as any[]) : [];
  return [...quoteRows, ...svc.filter((s) => s.status !== "removed").map((s) => ({ source: "engagement" as const, ref: s.engagement_id, component: (componentByKey(String(s.service_key).split(":")[1] ?? "")?.key ?? null), clientEntityId: entityId, startOn: s.effective_date ?? null, endOn: s.end_date ?? null }))];
}

/** Drafting quotes needs both the staff workspace and its own quote-drafting switch. */
export async function foundationQuotingEnabled(db: any): Promise<boolean> {
  const f = await foundationFlags(db);
  return f.foundation_administration && f.foundation_quote_drafting;
}

/** Server-side release gate for every client-facing, contracting or billing entry point. */
export async function assertFoundationReleased(db: any, quoteId: string | null | undefined, action: FoundationActionKind) {
  if (!quoteId) return;
  const { data, error } = await db.from("sales_quote_lines").select("service_key, foundation_snapshot").eq("quote_id", quoteId);
  if (error) throw new Error("Couldn't check the quote's services.");
  const fLines = ((data ?? []) as any[]).filter((l) => isFoundationKey(l.service_key) || l.foundation_snapshot);
  if (!fLines.length) return;
  const blocker = foundationReleaseBlocker(fLines, action, await foundationReleasedSets(db));
  if (blocker) throw new Error(blocker);
}

/** Sales quote builder: the chosen client's active foundations. Sales roles only; no profile details beyond names. */
export async function quoteFoundationOptions(userId: string, clientId: string) {
  const { salesActor } = await import("@/lib/sales-hub.server");
  const { canDraftQuote } = await import("@/lib/sales-model");
  const a = await salesActor(userId);
  if (!canDraftQuote(a.roles)) throw new Error("Your role can't draft quotes.");
  const db = await admin();
  if (!(await foundationQuotingEnabled(db))) return { enabled: false, foundations: [] as { profileId: string; clientEntityId: string; name: string; classification: string; exemptionStatus: string }[] };
  const profs = must(await db.from("foundation_profiles").select("id, client_entity_id, classification, exemption_status").eq("client_id", clientId).eq("status", "active"), "Couldn't read foundations.") as any[];
  const ids = profs.map((p) => p.client_entity_id);
  const ents = ids.length ? (must(await db.from("client_entities").select("id, legal_name").in("id", ids), "Couldn't read foundations.") as any[]) : [];
  return { enabled: true, foundations: profs.map((p) => ({ profileId: p.id as string, clientEntityId: p.client_entity_id as string, name: (ents.find((e) => e.id === p.client_entity_id)?.legal_name ?? "Foundation") as string, classification: p.classification as string, exemptionStatus: p.exemption_status as string })) };
}

/** Whether the Foundation tab should show: on for staff who can see clients, or a Super Admin who can turn it on. */
export async function foundationFlagState(userId: string) {
  const db = await admin();
  const a = await actor(db, userId);
  const flags = await foundationFlags(db);
  const enabled = flags.foundation_administration;
  return { enabled, flags, canToggle: a.superAdmin, show: a.superAdmin || (enabled && a.capabilities.includes("clients:see")) };
}

/** Released components for the quote screen's explanation. The server and database re-check on every action. */
export async function foundationReleaseView(userId: string) {
  const db = await admin();
  const { salesActor } = await import("@/lib/sales-hub.server");
  const a = await salesActor(userId);
  if (!a.roles.length) throw new Error("Not allowed.");
  return foundationReleasedSets(db);
}
