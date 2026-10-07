/**
 * Cross-fund document templates. A Fund's uploaded document (or a fresh upload)
 * becomes a versioned template; each version needs approval by a different
 * Harmonious team member (also enforced by a DB trigger). Using a template in
 * another Fund copies the file into that Fund as a NEW fund document version,
 * which still goes through that Fund's normal review, signing setup and
 * activation. Nothing is sent to investors and no Fund document is replaced.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { setupActor, forbid } from "@/lib/fund-setup.server";
import { DOCUMENT_CATEGORY_LABELS, type DocumentCategory } from "@/lib/offering-document-model";
import { createSetupDocument, uploadDocumentVersion } from "@/lib/offering-document-setup.server";

const db = () => supabaseAdmin as any;
const BUCKET = "offering-files";
const now = () => new Date().toISOString();
const safe = (n: string) => n.replace(/[^\w.\-]+/g, "_").slice(0, 120);

async function staff(userId: string) {
  const a = await setupActor(userId);
  if (!a.isStaff) forbid("only Harmonious can manage document templates.");
  return a;
}

export async function listTemplates(userId: string) {
  await staff(userId);
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
        description: tp.description as string | null, currentApproved: approved?.version ?? null, versions,
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
  const path = `templates/${input.templateId}/v${version}-${safe(input.fileName)}`;
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  const { error: e2 } = await db().from("document_template_versions").insert({ template_id: input.templateId, version, file_path: path, file_name: input.fileName, file_size_bytes: bytes.length, change_note: input.note || null, created_by: userId });
  if (e2) throw new Error(e2.message);
  return { version };
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

/** Copies an approved template version into a Fund as a new version awaiting that Fund's review. */
export async function useTemplateInFund(userId: string, input: { templateId: string; version: number; offeringId: string }) {
  await staff(userId);
  const { data: t } = await db().from("document_templates").select("*").eq("id", input.templateId).maybeSingle();
  if (!t) throw new Error("Template not found.");
  const { data: v } = await db().from("document_template_versions").select("*").eq("template_id", t.id).eq("version", input.version).maybeSingle();
  if (!v || v.status !== "approved") throw new Error("Only an approved template version can be used.");
  const category = (t.category in DOCUMENT_CATEGORY_LABELS ? t.category : "other") as DocumentCategory;
  const { id: documentId } = await createSetupDocument(userId, { offeringId: input.offeringId, category, title: t.title });
  const dest = `${input.offeringId}/templates/${t.id}-v${v.version}-${Date.now()}-${safe(v.file_name)}`;
  const { error } = await supabaseAdmin.storage.from(BUCKET).copy(v.file_path, dest);
  if (error) throw new Error(`Could not copy the file: ${error.message}`);
  const { version: fundVersion } = await uploadDocumentVersion(userId, { documentId, filePath: dest, fileName: v.file_name, fileSizeBytes: Number(v.file_size_bytes ?? 0) });
  await db().from("document_template_uses").insert({ template_id: t.id, template_version: v.version, offering_id: input.offeringId, offering_document_id: documentId, fund_version: fundVersion, used_by: userId });
  return { documentId, fundVersion };
}

export async function templateDownloadUrl(userId: string, input: { templateId: string; version: number }) {
  await staff(userId);
  const { data: v } = await db().from("document_template_versions").select("file_path").eq("template_id", input.templateId).eq("version", input.version).maybeSingle();
  if (!v) throw new Error("Version not found.");
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(v.file_path, 300);
  if (error) throw new Error(error.message);
  return { url: data.signedUrl };
}
