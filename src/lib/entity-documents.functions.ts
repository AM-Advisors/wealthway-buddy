import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";
import { CONTRACT_ROLES, STAFF_ROLES } from "@/lib/contracts.functions";
import {
  ENTITY_DOC_BUCKET, ENTITY_DOC_KIND_VALUES, ENTITY_DOC_TYPES, entityDocPath, pathBelongsTo, sortEntityDocs,
} from "@/lib/entity-document-model";

/** Staff-only: company documents can hold EIN letters and ownership schedules. */
async function staffAccess(context: any) {
  const { data, error } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  if (error) throw new Error("Your access could not be checked. Please try again.");
  const roles = ((data ?? []) as any[]).map((r) => String(r.role));
  const isStaff = roles.some((r) => (STAFF_ROLES as readonly string[]).includes(r));
  const canManage = roles.some((r) => (CONTRACT_ROLES as readonly string[]).includes(r));
  if (!isStaff) throw new Error("Forbidden: company documents are for the Harmonious team.");
  return { canManage };
}

async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function loadEntity(db: any, entityId: string) {
  const { data } = await db.from("client_entities").select("id, client_id, legal_name").eq("id", entityId).maybeSingle();
  if (!data) throw new Error("Company not found.");
  return data as { id: string; client_id: string; legal_name: string };
}

async function audit(db: any, actor: string, clientId: string, action: string, target: string, value: Record<string, unknown>) {
  await db.from("contract_audit_events").insert({ actor_id: actor, area: "entities", source: "portal", client_id: clientId, action, target, new_value: value });
}

export const listEntityDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ entityId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { canManage } = await staffAccess(context);
    const db = await adminDb();
    const { data: rows, error } = await db.from("client_entity_documents")
      .select("id, doc_kind, title, original_filename, mime_type, size_bytes, source, effective_date, added_at")
      .eq("entity_id", data.entityId).is("retired_at", null);
    if (error) throw new Error("Documents could not be loaded. Please try again.");
    const docs = ((rows ?? []) as any[]).map((r) => ({
      id: r.id as string, docKind: r.doc_kind as string, title: r.title as string, fileName: r.original_filename as string,
      mimeType: (r.mime_type as string) ?? null, sizeBytes: r.size_bytes === null ? null : Number(r.size_bytes),
      source: r.source as string, effectiveDate: (r.effective_date as string) ?? null, addedAt: r.added_at as string,
    }));
    return { canManage, documents: sortEntityDocs(docs) };
  });

export const openEntityDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ documentId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await staffAccess(context);
    const db = await adminDb();
    const { data: doc } = await db.from("client_entity_documents").select("id, client_id, storage_path, retired_at, title")
      .eq("id", data.documentId).maybeSingle();
    if (!doc || doc.retired_at) throw new Error("That document is no longer available.");
    const { data: signed, error } = await db.storage.from(ENTITY_DOC_BUCKET).createSignedUrl(doc.storage_path, 300);
    if (error || !signed) throw new Error("The document could not be opened. Please try again.");
    await audit(db, context.userId, doc.client_id, "entity_document_opened", doc.id, { title: doc.title });
    return { url: signed.signedUrl as string };
  });

export const entityDocumentUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ entityId: z.string().uuid(), fileName: z.string().trim().min(1).max(200) }).parse(d))
  .handler(async ({ context, data }) => {
    const { canManage } = await staffAccess(context);
    if (!canManage) throw new Error("Adding company documents needs legal, compliance, finance, client success or admin authority.");
    const ext = data.fileName.split(".").pop()?.toLowerCase() ?? "";
    if (!(ENTITY_DOC_TYPES as readonly string[]).includes(ext)) throw new Error("Use a PDF, Word, PNG or JPG file.");
    const db = await adminDb();
    await loadEntity(db, data.entityId);
    const path = entityDocPath(data.entityId, crypto.randomUUID(), data.fileName);
    const { data: signed, error } = await db.storage.from(ENTITY_DOC_BUCKET).createSignedUploadUrl(path);
    if (error) throw new Error("The upload could not start. Please try again.");
    return { path, token: signed.token as string };
  });

export const recordEntityDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    entityId: z.string().uuid(), path: z.string().max(400), fileName: z.string().trim().min(1).max(200),
    title: z.string().trim().min(2).max(200), docKind: z.enum(ENTITY_DOC_KIND_VALUES),
    effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const { canManage } = await staffAccess(context);
    if (!canManage) throw new Error("Adding company documents needs legal, compliance, finance, client success or admin authority.");
    if (!pathBelongsTo(data.entityId, data.path)) throw new Error("Unexpected file.");
    const db = await adminDb();
    const entity = await loadEntity(db, data.entityId);
    const { data: blob, error: dlErr } = await db.storage.from(ENTITY_DOC_BUCKET).download(data.path);
    if (dlErr || !blob) throw new Error("The uploaded file wasn't found. Please upload it again.");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map((b) => b.toString(16).padStart(2, "0")).join("");
    const { data: row, error } = await db.from("client_entity_documents").insert({
      entity_id: entity.id, client_id: entity.client_id, doc_kind: data.docKind, title: data.title,
      original_filename: data.fileName, mime_type: blob.type || null, size_bytes: bytes.byteLength, sha256: hash,
      storage_path: data.path, source: "upload", effective_date: data.effectiveDate ?? null, added_by: context.userId,
    }).select("id").single();
    if (error) throw new Error("The document could not be saved. Please try again.");
    await audit(db, context.userId, entity.client_id, "entity_document_added", row.id, { title: data.title, kind: data.docKind });
    return { id: row.id as string };
  });

export const retireEntityDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ documentId: z.string().uuid(), reason: z.string().trim().min(3).max(500) }).parse(d))
  .handler(async ({ context, data }) => {
    const { canManage } = await staffAccess(context);
    if (!canManage) throw new Error("Removing company documents needs legal, compliance, finance, client success or admin authority.");
    const db = await adminDb();
    const { data: doc } = await db.from("client_entity_documents").select("id, client_id, title, retired_at").eq("id", data.documentId).maybeSingle();
    if (!doc || doc.retired_at) throw new Error("That document is no longer listed.");
    const { error } = await db.from("client_entity_documents")
      .update({ retired_at: new Date().toISOString(), retired_by: context.userId, retire_reason: data.reason })
      .eq("id", doc.id).is("retired_at", null);
    if (error) throw new Error("The document could not be removed. Please try again.");
    await audit(db, context.userId, doc.client_id, "entity_document_retired", doc.id, { title: doc.title, reason: data.reason });
    return { ok: true };
  });
