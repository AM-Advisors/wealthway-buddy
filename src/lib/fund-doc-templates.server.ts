/**
 * Cross-fund document templates. A Fund's uploaded document (or a fresh upload)
 * becomes a versioned template; each version needs approval by a different
 * Harmonious team member (also enforced by a DB trigger). Using a template in
 * another Fund copies the file into that Fund as a NEW fund document version,
 * which needs no duplicate Harmonious approval but still requires signing setup and
 * activation. Nothing is sent to investors and no Fund document is replaced.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { setupActor, forbid } from "@/lib/fund-setup.server";
import { DOCUMENT_CATEGORY_LABELS, type DocumentCategory } from "@/lib/offering-document-model";
import { activateDocumentVersion, createSetupDocument, saveSigningConfig, setDocumentUsage, uploadDocumentVersion } from "@/lib/offering-document-setup.server";
import type { SigningConfig } from "@/lib/offering-document-model";

const db = () => supabaseAdmin as any;
const BUCKET = "offering-files";
const now = () => new Date().toISOString();
const safe = (n: string) => n.replace(/[^\w.\-]+/g, "_").slice(0, 120);

async function staff(userId: string) {
  const a = await setupActor(userId);
  if (!a.isStaff) forbid("only Harmonious can manage document templates.");
  return a;
}

/** Staff, or the fund's own manager (self-serve: clients use Harmonious templates on their fund). */
async function staffOrManager(userId: string, offeringId: string) {
  const a = await setupActor(userId);
  if (!a.isStaff && !a.offeringIds.includes(offeringId)) forbid("you do not manage that fund.");
  return a;
}
const asManager = async <T>(a: { isStaff: boolean }, userId: string, offeringId: string, fn: () => Promise<T>) =>
  a.isStaff ? fn() : (await import("@/lib/self-serve.server")).runSelfServe({ userId, offeringId, scope: "template_documents" }, fn);

export async function listTemplates(userId: string) {
  const actor = await setupActor(userId);
  if (!actor.isStaff) {
    // Fund managers only see approved Harmonious templates they can use (no history, no other funds).
    if (!actor.offeringIds.length) forbid("you do not manage a fund.");
    const [{ data: t }, { data: v }] = await Promise.all([
      db().from("document_templates").select("id, title, category, description, fund_types").is("archived_at", null).order("created_at", { ascending: false }),
      db().from("document_template_versions").select("template_id, version, status").eq("status", "approved").order("version", { ascending: false }),
    ]);
    return {
      funds: [],
      templates: ((t ?? []) as any[]).map((tp) => ({
        id: tp.id as string, title: tp.title as string, category: (DOCUMENT_CATEGORY_LABELS as any)[tp.category] ?? tp.category, categoryKey: tp.category as string,
        description: tp.description as string | null, fundTypes: (tp.fund_types ?? []) as string[], currentApproved: (((v ?? []) as any[]).find((x) => x.template_id === tp.id)?.version ?? null) as number | null, versions: [], uses: [],
      })).filter((x) => x.currentApproved != null),
    };
  }
  const [{ data: t }, { data: v }, { data: u }, { data: funds }] = await Promise.all([
    db().from("document_templates").select("*").is("archived_at", null).order("created_at", { ascending: false }),
    db().from("document_template_versions").select("id, template_id, version, file_name, status, change_note, created_by, created_at, decided_by, decided_at, decision_note, source_offering_id, source_version").order("version", { ascending: false }),
    db().from("document_template_uses").select("template_id, template_version, offering_id, fund_version, used_at").order("used_at", { ascending: false }),
    db().from("offerings").select("id, name").order("name"),
  ]);
  const people = [...new Set([...(v ?? []).map((x: any) => x.created_by), ...(v ?? []).map((x: any) => x.decided_by)].filter(Boolean))];
  const { data: profiles } = people.length ? await db().from("profiles").select("id, full_name").in("id", people) : { data: [] };
  const who = new Map(((profiles ?? []) as any[]).map((p) => [p.id, p.full_name as string]));
  const fundName = new Map(((funds ?? []) as any[]).map((f) => [f.id, f.name as string]));
  return {
    funds: ((funds ?? []) as any[]).map((f) => ({ id: f.id as string, name: f.name as string })),
    templates: ((t ?? []) as any[]).map((tp) => {
      const versions = ((v ?? []) as any[]).filter((x) => x.template_id === tp.id).map((x) => ({
        version: x.version as number, fileName: x.file_name as string, status: x.status as string, note: x.change_note as string | null,
        createdBy: who.get(x.created_by) ?? "Staff", createdAt: x.created_at as string, mine: x.created_by === userId,
        decidedBy: x.decided_by ? who.get(x.decided_by) ?? "Staff" : null, decidedAt: x.decided_at as string | null, decisionNote: x.decision_note as string | null,
        source: x.source_offering_id ? `${fundName.get(x.source_offering_id) ?? "Fund"} v${x.source_version}` : "Uploaded",
      }));
      const approved = versions.find((x) => x.status === "approved");
      return {
        id: tp.id as string, title: tp.title as string, category: (DOCUMENT_CATEGORY_LABELS as any)[tp.category] ?? tp.category, categoryKey: tp.category as string,
        description: tp.description as string | null, fundTypes: (tp.fund_types ?? []) as string[], currentApproved: approved?.version ?? null, versions,
        uses: ((u ?? []) as any[]).filter((x) => x.template_id === tp.id).map((x) => ({ fund: fundName.get(x.offering_id) ?? "Fund", templateVersion: x.template_version, fundVersion: x.fund_version, at: x.used_at })),
      };
    }),
  };
}

/** Fund documents that can seed a template. */
export async function listTemplateSources(userId: string, offeringId: string) {
  await staff(userId);
  const [{ data: docs }, { data: vers }] = await Promise.all([
    db().from("offering_documents").select("id, title, document_category").eq("offering_id", offeringId).order("sort_order"),
    db().from("offering_document_versions").select("offering_document_id, version, file_name, approval_status").eq("offering_id", offeringId).not("file_path", "is", null).order("version", { ascending: false }),
  ]);
  return ((docs ?? []) as any[]).map((d) => ({
    id: d.id as string, title: d.title as string, category: d.document_category as string,
    versions: ((vers ?? []) as any[]).filter((x) => x.offering_document_id === d.id).map((x) => ({ version: x.version as number, fileName: x.file_name as string, status: x.approval_status as string })),
  })).filter((d) => d.versions.length);
}

async function nextVersion(templateId: string) {
  const { data } = await db().from("document_template_versions").select("version").eq("template_id", templateId).order("version", { ascending: false }).limit(1).maybeSingle();
  return Number(data?.version ?? 0) + 1;
}

async function copyFromFund(templateId: string, version: number, offeringId: string, documentId: string, fundVersion: number) {
  const { data: src } = await db().from("offering_document_versions").select("file_path, file_name, file_size_bytes").eq("offering_document_id", documentId).eq("offering_id", offeringId).eq("version", fundVersion).maybeSingle();
  if (!src?.file_path) throw new Error("That fund document version has no file.");
  const path = `templates/${templateId}/v${version}-${safe(src.file_name ?? "document.pdf")}`;
  const { error } = await supabaseAdmin.storage.from(BUCKET).copy(src.file_path, path);
  if (error) throw new Error(`Could not copy the file: ${error.message}`);
  return { path, fileName: src.file_name as string, size: src.file_size_bytes as number | null };
}

export async function createTemplateFromFund(userId: string, input: { offeringId: string; documentId: string; version: number; title?: string | null | undefined; description?: string | null | undefined }) {
  await staff(userId);
  const { data: doc } = await db().from("offering_documents").select("id, title, document_category, offering_id").eq("id", input.documentId).maybeSingle();
  if (!doc || doc.offering_id !== input.offeringId) throw new Error("That document isn't part of this fund.");
  const { data: t, error } = await db().from("document_templates").insert({ title: input.title?.trim() || doc.title, category: doc.document_category ?? "other", description: input.description || null, created_by: userId }).select("id").single();
  if (error) throw new Error(error.message);
  const f = await copyFromFund(t.id, 1, input.offeringId, doc.id, input.version);
  const { error: e2 } = await db().from("document_template_versions").insert({ template_id: t.id, version: 1, file_path: f.path, file_name: f.fileName, file_size_bytes: f.size, source_offering_id: input.offeringId, source_document_id: doc.id, source_version: input.version, change_note: "Created from fund document", created_by: userId });
  if (e2) throw new Error(e2.message);
  return { id: t.id as string };
}

export async function addTemplateVersion(userId: string, input: { templateId: string; note?: string | null | undefined; fileName: string; base64: string } ) {
  await staff(userId);
  const version = await nextVersion(input.templateId);
  const bytes = Buffer.from(input.base64, "base64");
  const { validateUpload } = await import("@/lib/upload-validation");
  const checked = validateUpload(new Uint8Array(bytes), input.fileName, { allowed: ["pdf", "docx"], maxBytes: 25 * 1024 * 1024, label: "Template file" });
  const path = `templates/${input.templateId}/v${version}-${safe(input.fileName)}`;
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, { contentType: checked.contentType, upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  const { error: e2 } = await db().from("document_template_versions").insert({ template_id: input.templateId, version, file_path: path, file_name: input.fileName, file_size_bytes: bytes.length, change_note: input.note || null, created_by: userId });
  if (e2) throw new Error(e2.message);
  return { version };
}

/** Fresh legal files enter the same pending-approval library as fund-derived templates. */
export async function createUploadedTemplate(userId: string, input: { title: string; category: DocumentCategory; fundTypes: string[]; fileName: string; base64: string; description?: string | null | undefined }) {
  await staff(userId);
  const { validateUpload } = await import("@/lib/upload-validation");
  const bytes = new Uint8Array(Buffer.from(input.base64, "base64"));
  validateUpload(bytes, input.fileName, { allowed: ["pdf", "docx"], maxBytes: 25 * 1024 * 1024, label: "Template file" });
  const { data, error } = await db().from("document_templates").insert({
    title: input.title.trim(), category: input.category, description: input.description?.trim() || null,
    fund_types: Array.from(new Set(input.fundTypes.map((x) => x.trim()).filter(Boolean))), created_by: userId,
  }).select("id").single();
  if (error || !data) throw new Error("Could not create the template.");
  try {
    const { version } = await addTemplateVersion(userId, { templateId: data.id, fileName: input.fileName, base64: input.base64, note: "Initial uploaded template" });
    return { id: String(data.id), version };
  } catch (error) {
    // Keep failed draft metadata for history, but do not offer an empty template.
    await db().from("document_templates").update({ archived_at: now() }).eq("id", data.id);
    throw error;
  }
}

export async function decideTemplateVersion(userId: string, input: { templateId: string; version: number; decision: "approve" | "reject"; note?: string | null | undefined }) {
  await staff(userId);
  const { data: v } = await db().from("document_template_versions").select("id, status, created_by").eq("template_id", input.templateId).eq("version", input.version).maybeSingle();
  if (!v) throw new Error("That version was not found.");
  if (v.status !== "pending_approval") throw new Error("That version has already been decided.");
  if (v.created_by === userId && !(await (await import("@/lib/self-approval.server")).selfApprove(userId, "template_version", [v.id]))) forbid("a different Harmonious team member must approve a version you added.");
  if (input.decision === "reject" && !input.note?.trim()) throw new Error("Give a reason for rejecting.");
  const { error } = await db().from("document_template_versions").update({ status: input.decision === "approve" ? "approved" : "rejected", decided_by: userId, decided_at: now(), decision_note: input.note || null }).eq("id", v.id).eq("status", "pending_approval");
  if (error) throw new Error(error.message);
  return { ok: true };
}

/** Copies an approved template without duplicate fund-level Harmonious review. */
export async function useTemplateInFund(userId: string, input: { templateId: string; version: number; offeringId: string }) {
  const a = await staffOrManager(userId, input.offeringId);
  return asManager(a, userId, input.offeringId, () => useTemplateInFundInner(userId, input));
}
async function useTemplateInFundInner(userId: string, input: { templateId: string; version: number; offeringId: string }) {
  const { data: t } = await db().from("document_templates").select("*").eq("id", input.templateId).maybeSingle();
  if (!t || t.archived_at) throw new Error("Template not found.");
  const { data: fund, error: fundError } = await db().from("offerings").select("fund_type").eq("id", input.offeringId).maybeSingle();
  if (fundError || !fund) throw new Error("Could not check the fund type.");
  const { canonicalTemplateFundType } = await import("@/lib/fund-type-templates");
  if (t.fund_types?.length && !t.fund_types.some((type: string) => canonicalTemplateFundType(type) === canonicalTemplateFundType(fund.fund_type ?? ""))) {
    throw new Error("This template is not assigned to this fund type.");
  }
  const { data: v } = await db().from("document_template_versions").select("*").eq("template_id", t.id).eq("version", input.version).maybeSingle();
  if (!v || v.status !== "approved") throw new Error("Only an approved template version can be used.");
  const category = (t.category in DOCUMENT_CATEGORY_LABELS ? t.category : "other") as DocumentCategory;
  const { id: documentId } = await createSetupDocument(userId, { offeringId: input.offeringId, category, title: t.title });
  const dest = `${input.offeringId}/templates/${t.id}-v${v.version}-${Date.now()}-${safe(v.file_name)}`;
  let size = Number(v.file_size_bytes ?? 0);
  let autofill: { filled: string[]; open: string[] } | null = null;
  if (/\.docx$/i.test(v.file_name)) {
    // Word templates are filled from the fund's own record; anything unknown stays as {{...}} for review.
    const { data: blob, error: dErr } = await supabaseAdmin.storage.from(BUCKET).download(v.file_path);
    if (dErr || !blob) throw new Error(`Could not read the template: ${dErr?.message ?? "missing file"}`);
    const { fillDocx } = await import("@/lib/docx-autofill");
    const r = await fillDocx(new Uint8Array(await blob.arrayBuffer()), await fundTemplateValues(input.offeringId));
    const { error } = await supabaseAdmin.storage.from(BUCKET).upload(dest, r.bytes, { contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", upsert: false });
    if (error) throw new Error(`Could not save the filled document: ${error.message}`);
    size = r.bytes.length; autofill = { filled: r.filled, open: r.open };
  } else {
    const { error } = await supabaseAdmin.storage.from(BUCKET).copy(v.file_path, dest);
    if (error) throw new Error(`Could not copy the file: ${error.message}`);
  }
  const { version: fundVersion } = await uploadDocumentVersion(userId, { documentId, filePath: dest, fileName: v.file_name, fileSizeBytes: size });
  const { error: provenanceError } = await db().from("document_template_uses").insert({ template_id: t.id, template_version: v.version, offering_id: input.offeringId, offering_document_id: documentId, fund_version: fundVersion, used_by: userId });
  if (provenanceError) throw new Error(provenanceError.message);
  const signing = await autoSigningSetup(userId, { documentId, version: fundVersion, category, title: String(t.title ?? ""), offeringId: input.offeringId });
  // First use only; existing active versions require an explicit rollout choice.
  const { data: document } = await db().from("offering_documents").select("active_version, usage").eq("id", documentId).maybeSingle();
  if (!autofill?.open.length && document && document.active_version == null && (document.usage !== "signature" || signing.configured)) {
    if (!document.usage) await setDocumentUsage(userId, { documentId, usage: "reference", applicability: {} });
    await activateDocumentVersion(userId, { documentId, version: fundVersion, scope: "new_only" });
  }
  return { documentId, fundVersion, autofill, signing };
}

/**
 * Harmonious templates get their signature block set up automatically:
 * LLOA -> fund signatory only; Subscription Agreement -> investor first, then
 * fund signatory countersigns. Saved as confirmed so the document is ready to send.
 */
export function templateSigningConfig(category: string, title: string): SigningConfig | null {
  const block = ["signature", "printed_name", "title", "date_signed"] as const;
  if (category === "operating_agreement" || /\blloa\b|letter of authori[sz]ation|operating agreement/i.test(title)) return { signers: [{ role: "fund_signatory", fields: [...block], order: 1 }] };
  if (category === "subscription_agreement" || /subscription agreement/i.test(title)) {
    return { signers: [{ role: "investor", fields: ["signature", "printed_name", "entity_name", "title", "date_signed"], order: 1 }, { role: "fund_signatory", fields: [...block], order: 2 }] };
  }
  return null;
}

async function autoSigningSetup(userId: string, input: { documentId: string; version: number; category: string; title: string; offeringId: string }): Promise<{ configured: boolean; roles: string[]; message: string | null }> {
  const config = templateSigningConfig(input.category, input.title);
  if (!config) return { configured: false, roles: [], message: null };
  const roles = config.signers.map((x) => x.role);
  try {
    const { data: d } = await db().from("offering_documents").select("usage, applicability").eq("id", input.documentId).maybeSingle();
    if (d?.usage !== "signature") await setDocumentUsage(userId, { documentId: input.documentId, usage: "signature", applicability: (d?.applicability ?? {}) as any });
    // Harmonious templates have a fixed signer order, so the boxes are ready to send (still editable, logged).
    await saveSigningConfig(userId, { documentId: input.documentId, version: input.version, config, confirm: true });
    return { configured: true, roles, message: null };
  } catch (e) {
    return { configured: false, roles, message: (e as Error).message };
  }
}

const pct = (n: unknown) => (n == null || n === "" ? null : `${Number(n)}%`);
const fullName = (p: any) => (p ? [p.legal_first_name, p.legal_middle_name, p.legal_last_name].filter(Boolean).join(" ") : null);

/** Fund details keyed by every placeholder spelling used in the Harmonious templates. Investor-level fields (amount, signature, date) are left for signing. */
export async function fundTemplateValues(offeringId: string): Promise<Record<string, string | null>> {
  const { data: o } = await db().from("offerings").select("*").eq("id", offeringId).maybeSingle();
  if (!o) throw new Error("Fund not found.");
  const [{ data: c }, { data: fee }, { data: sig }] = await Promise.all([
    o.client_id ? db().from("clients").select("name, legal_name, primary_contact_name, primary_contact_email").eq("id", o.client_id).maybeSingle() : Promise.resolve({ data: null }),
    db().from("fund_fee_terms").select("management_fee_pct, carry_pct, status, created_at").eq("offering_id", offeringId).in("status", ["active", "approved"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    o.fund_signatory_person_id ? db().from("persons").select("legal_first_name, legal_middle_name, legal_last_name, email").eq("id", o.fund_signatory_person_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const legal = o.legal_entity_name || o.name;
  const ap = (await import("@/lib/address")).parseAddressParts(o.principal_address);
  const manager = o.gp_entity_name || o.signatory_entity_name || c?.legal_name || c?.name || null;
  const signer = fullName(sig);
  const email = sig?.email || c?.primary_contact_email || null;
  const v: Record<string, string | null> = {
    "Fund Name": o.name, "Fund Legal Name": legal, "Legal Fund Name": legal, "Legal Name": legal,
    "Fund Manager": manager, "Fund Manager Name": manager, "Manager Name": manager, "Fund Adviser Name": manager,
    "General Partner Name": o.gp_entity_name || null,
    "Management Fee": pct(fee?.management_fee_pct), "Carry Percent": pct(fee?.carry_pct), "Carry Amount": pct(fee?.carry_pct),
    "address": o.principal_address, "Manager Address": o.principal_address, "email": email, "Manager Email": email,
    "Address Line 1": ap.addressLine1, "Address Line 2": ap.addressLine2, "Address City": ap.addressCity, "Address State": ap.addressState, "Address ZIP": ap.addressZip,
    "Signatory's Legal Name": signer, "Fund Manager Signatory": signer, "Fund Manager Signatory Name": signer,
    "Signatory's Title": o.signatory_title, "Signatory Title": o.signatory_title, "Fund Manager Signatory Title": o.signatory_title,
    "State": o.state_formed, "Arbitration State": o.arbitration_state || o.state_formed, "Arbitration City": o.arbitration_city, "Country": "United States",
  };
  return v;
}

/** Shows which blanks an approved template needs and which the fund already has, without saving anything. */
export async function templateAutofillCheck(userId: string, input: { templateId: string; version: number; offeringId: string }) {
  await staffOrManager(userId, input.offeringId);
  const { data: v } = await db().from("document_template_versions").select("file_path, file_name, status").eq("template_id", input.templateId).eq("version", input.version).maybeSingle();
  if (!v || v.status !== "approved") throw new Error("Only an approved template version can be used.");
  if (!/\.docx$/i.test(v.file_name)) return { filled: [], open: [], fillable: false };
  const { data: blob, error } = await supabaseAdmin.storage.from(BUCKET).download(v.file_path);
  if (error || !blob) throw new Error("Could not read the template.");
  const { fillDocx } = await import("@/lib/docx-autofill");
  const r = await fillDocx(new Uint8Array(await blob.arrayBuffer()), await fundTemplateValues(input.offeringId));
  return { filled: r.filled, open: r.open, fillable: true };
}

/** Documents made from Harmonious templates on one fund, newest first, with what can be done to each. */
export async function listFundTemplateDocuments(userId: string, offeringId: string) {
  await staffOrManager(userId, offeringId);
  const { data: uses } = await db().from("document_template_uses").select("offering_document_id, fund_version, used_at, template_id").eq("offering_id", offeringId).order("used_at", { ascending: false });
  const ids = [...new Set(((uses ?? []) as any[]).map((u) => u.offering_document_id))];
  if (!ids.length) return [];
  const [{ data: docs }, { data: vers }, { data: sigs }, { data: sends }] = await Promise.all([
    db().from("offering_documents").select("id, title, document_category, active_version, removed_at").in("id", ids),
    db().from("offering_document_versions").select("id, offering_document_id, version, file_name, approval_status, signing_config, signing_config_status").in("offering_document_id", ids),
    db().from("document_signatures").select("offering_document_id").in("offering_document_id", ids),
    db().from("offering_document_sends").select("offering_document_id").in("offering_document_id", ids),
  ]);
  const used = new Set([...((sigs ?? []) as any[]), ...((sends ?? []) as any[])].map((r) => r.offering_document_id));
  return ids.map((id) => {
    const d = ((docs ?? []) as any[]).find((x) => x.id === id);
    if (!d || d.removed_at) return null;
    const u = ((uses ?? []) as any[]).find((x) => x.offering_document_id === id);
    const v = ((vers ?? []) as any[]).filter((x) => x.offering_document_id === id).sort((a, b) => b.version - a.version)[0];
    const locked = used.has(id) || d.active_version != null || ["approved", "active"].includes(v?.approval_status);
    return { id, title: d.title as string, usedAt: u?.used_at as string, version: v?.version ?? null, isActive: d.active_version === v?.version, versionId: v?.id ?? null, fileName: v?.file_name ?? null, signers: ((v?.signing_config?.signers ?? []) as any[]).map((x) => x.role as string), signingStatus: v?.signing_config_status ?? null, canDelete: !locked };
  }).filter(Boolean);
}

/** Removes an unsent, unapproved template draft from the fund. The record is kept (hidden) for history. */
export async function removeFundTemplateDocument(userId: string, input: { offeringId: string; documentId: string; reason?: string | null | undefined }) {
  await staffOrManager(userId, input.offeringId);
  const list = (await listFundTemplateDocuments(userId, input.offeringId)) as any[];
  const d = list.find((x) => x.id === input.documentId);
  if (!d) throw new Error("That document was not found on this fund.");
  if (!d.canDelete) throw new Error("This document has been approved or sent for signature, so it can't be deleted.");
  const { error } = await db().from("offering_documents").update({ removed_at: now(), removed_by: userId, removed_reason: input.reason || null }).eq("id", d.id).is("removed_at", null);
  if (error) throw new Error(error.message);
  await db().from("offering_document_events").insert({ offering_id: input.offeringId, offering_document_id: d.id, version: null, event: "document_removed", actor_user_id: userId, detail: { title: d.title, reason: input.reason || null } });
  return { ok: true };
}

/** Short-lived link to read a template document on this fund. */
export async function fundTemplateDocumentUrl(userId: string, input: { offeringId: string; versionId: string }) {
  await staffOrManager(userId, input.offeringId);
  const { data: v } = await db().from("offering_document_versions").select("file_path, offering_id").eq("id", input.versionId).maybeSingle();
  if (!v || v.offering_id !== input.offeringId) throw new Error("That document was not found.");
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(v.file_path, 300);
  if (error) throw new Error(error.message);
  return { url: data.signedUrl };
}

export async function templateDownloadUrl(userId: string, input: { templateId: string; version: number }) {
  await staff(userId);
  const { data: v } = await db().from("document_template_versions").select("file_path").eq("template_id", input.templateId).eq("version", input.version).maybeSingle();
  if (!v) throw new Error("Version not found.");
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(v.file_path, 300);
  if (error) throw new Error(error.message);
  return { url: data.signedUrl };
}


/** Staff assign which fund types a template is used for. */
export async function setTemplateFundTypes(userId: string, input: { templateId: string; fundTypes: string[] }) {
  await staff(userId);
  const clean = Array.from(new Set(input.fundTypes.map((x) => x.trim()).filter(Boolean)));
  const { error } = await db().from("document_templates").update({ fund_types: clean.length ? clean : null }).eq("id", input.templateId);
  if (error) throw new Error("Could not save the fund types.");
  return { ok: true };
}

/** Approved templates assigned to this fund's type, and whether each was already generated for it. */
export async function fundTypeTemplates(userId: string, offeringId: string) {
  await staffOrManager(userId, offeringId);
  const { templatesForFundType } = await import("@/lib/fund-type-templates");
  const results = await Promise.all([
    db().from("offerings").select("fund_type").eq("id", offeringId).maybeSingle(),
    db().from("document_templates").select("id, title, category, fund_types").is("archived_at", null),
    db().from("document_template_versions").select("template_id, version").eq("status", "approved").order("version", { ascending: false }),
    db().from("document_template_uses").select("template_id").eq("offering_id", offeringId),
  ]);
  if (results.some((r) => r.error)) throw new Error("Could not load the assigned fund templates.");
  const [{ data: off }, { data: t }, { data: v }, { data: u }] = results;
  const fundType = ((off as any)?.fund_type ?? null) as string | null;
  const used = new Set(((u ?? []) as any[]).map((x) => String(x.template_id)));
  const list = templatesForFundType(((t ?? []) as any[]).map((x) => ({
    id: String(x.id), title: String(x.title), fundTypes: (x.fund_types ?? []) as string[],
    approvedVersion: (((v ?? []) as any[]).find((y) => y.template_id === x.id)?.version ?? null) as number | null,
  })), fundType);
  return { fundType, templates: list.map((x) => ({ ...x, generated: used.has(x.id) })) };
}

/** Generate every assigned template not yet generated for this fund (same path as using one template). */
export async function generateFundTypeDocuments(userId: string, offeringId: string) {
  const { templates } = await fundTypeTemplates(userId, offeringId);
  const made: { title: string; documentId: string; open: string[] }[] = [];
  for (const x of templates.filter((y) => !y.generated && y.approvedVersion != null)) {
    if (x.approvedVersion == null) continue;
    const r = await useTemplateInFund(userId, { templateId: x.id, version: x.approvedVersion, offeringId });
    made.push({ title: x.title, documentId: String((r as any).documentId), open: ((r as any).autofill?.open ?? []) as string[] });
  }
  return { made };
}
