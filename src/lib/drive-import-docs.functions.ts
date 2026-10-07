/**
 * Drive-imported documents inside the normal Documents experience. Every list,
 * search and open request re-derives the caller's authority on the server and
 * applies the same visibility rules. Read-only: no delete action exists.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";

async function withShares(db: any, docs: any[]) {
  const ids = docs.map((d) => d.id);
  if (!ids.length) return docs;
  const { data } = await db.from("drive_document_details").select("document_id, shared_profile_id, created_at").in("document_id", ids).order("created_at", { ascending: false });
  const m = new Map<string, string | null>();
  for (const x of (data ?? []) as any[]) if (!m.has(x.document_id)) m.set(x.document_id, x.shared_profile_id);
  return docs.map((d) => ({ ...d, shared_profile_id: m.get(d.id) ?? null }));
}

async function viewerFor(context: any) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const userId = context.userId as string;
  const [{ data: roles }, { data: managed }, { data: obs }] = await Promise.all([
    context.supabase.from("user_roles").select("role").eq("user_id", userId),
    db.from("fund_managers").select("offering_id").eq("user_id", userId),
    db.from("investor_onboardings").select("offering_id, investment_profile_id").eq("investor_user_id", userId),
  ]);
  return {
    db,
    viewer: {
      roles: (roles ?? []).map((r: any) => String(r.role)),
      managedOfferingIds: (managed ?? []).map((m: any) => String(m.offering_id)),
      ownInvestments: (obs ?? [])
        .filter((o: any) => o.investment_profile_id)
        .map((o: any) => ({ offeringId: String(o.offering_id), profileId: String(o.investment_profile_id) })),
    },
  };
}

export const listVisibleImportedDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ offeringId: z.string().uuid().optional(), search: z.string().max(120).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { visibleImports, presentImport } = await import("@/lib/drive-import-visibility");
    const { documentTypeLabel } = await import("@/lib/drive-intake");
    const { db, viewer } = await viewerFor(context);
    let q = db.from("drive_imported_documents").select("*").eq("environment", "production").order("imported_at", { ascending: false }).limit(500);
    if (data.offeringId) q = q.eq("offering_id", data.offeringId);
    const { data: docs } = await q;
    const all = (await withShares(db, (docs ?? []) as any[])) as any[];
    const visible = visibleImports(viewer, all, data);
    const importers = [...new Set(visible.filter((v) => v.audience === "staff").map((v) => v.doc.imported_by))];
    const { data: people } = importers.length
      ? await db.from("profiles").select("user_id,email,legal_name").in("user_id", importers)
      : { data: [] };
    return {
      rows: visible.map(({ doc, audience }) => {
        const who = (people ?? []).find((p: any) => p.user_id === doc.imported_by);
        return presentImport(doc, audience, all, documentTypeLabel(doc.category as any, doc.document_type) ?? "Document", who?.legal_name ?? who?.email);
      }),
    };
  });

export const openVisibleImportedDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { audienceFor } = await import("@/lib/drive-import-visibility");
    const { db, viewer } = await viewerFor(context);
    const { data: raw } = await db.from("drive_imported_documents").select("*").eq("id", data.id).maybeSingle();
    const doc = raw ? (await withShares(db, [raw]))[0] : null;
    if (!doc || !audienceFor(viewer, doc)) throw new Error("Document not found.");
    const { BUCKET } = await import("@/lib/drive-intake.server");
    const { data: signed, error } = await db.storage.from(BUCKET).createSignedUrl(doc.storage_path, 300);
    if (error || !signed) throw new Error("Could not open that document.");
    return { url: signed.signedUrl as string };
  });
