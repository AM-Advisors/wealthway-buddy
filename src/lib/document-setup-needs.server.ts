import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { documentSetupNeeds, type SetupNeed } from "@/lib/document-setup-needs";
import { isSigningTimeBlank, templatePlaceholders } from "@/lib/document-blanks";

const db = () => supabaseAdmin as any;
const BUCKET = "offering-files";

// Template versions are immutable once saved, so their blanks are read once per file.
const placeholderCache = new Map<string, string[]>();
async function templateVersionBlanks(filePath: string, fileName: string): Promise<string[]> {
  if (!/\.docx$/i.test(fileName)) return [];
  const cached = placeholderCache.get(filePath);
  if (cached) return cached;
  const { data: blob, error } = await supabaseAdmin.storage.from(BUCKET).download(filePath);
  if (error || !blob) return [];
  const found = await templatePlaceholders(new Uint8Array(await blob.arrayBuffer()));
  placeholderCache.set(filePath, found);
  return found;
}

/**
 * Callers authorize first. A fund using Harmonious templates must record every fund detail those
 * templates fill in; documents also report blanks left when they were filled. Investor and signing
 * blanks in subscription agreements are filled per investor, so they are never setup details.
 */
export async function fundDocumentSetupNeeds(offeringId: string): Promise<SetupNeed[]> {
  const [{ data: docs }, { data: vers }, { data: uses }] = await Promise.all([
    db().from("offering_documents").select("id, document_category").eq("offering_id", offeringId).is("removed_at", null),
    db().from("offering_document_versions").select("offering_document_id, version, generation_issues").eq("offering_id", offeringId).limit(1000),
    db().from("document_template_uses").select("offering_document_id, template_id, template_version, used_at").eq("offering_id", offeringId).order("used_at", { ascending: false }).limit(500),
  ]);
  const category = new Map<string, string>(((docs ?? []) as any[]).map((d) => [d.id, String(d.document_category ?? "")]));
  const blanks: string[] = [];
  const add = (names: string[], cat: string) => { for (const n of names) if (!isSigningTimeBlank(n, cat)) blanks.push(n); };

  const latest = new Map<string, any>();
  for (const v of (vers ?? []) as any[]) {
    if (!category.has(v.offering_document_id)) continue;
    const cur = latest.get(v.offering_document_id);
    if (!cur || v.version > cur.version) latest.set(v.offering_document_id, v);
  }
  for (const v of latest.values()) add((v.generation_issues ?? []) as string[], category.get(v.offering_document_id) ?? "");

  // The template each live document was most recently made from.
  const byDoc = new Map<string, any>();
  for (const u of (uses ?? []) as any[]) if (category.has(u.offering_document_id) && !byDoc.has(u.offering_document_id)) byDoc.set(u.offering_document_id, u);
  if (byDoc.size) {
    const templateIds = [...new Set([...byDoc.values()].map((u) => u.template_id))];
    const [{ data: tvs }, { data: ts }] = await Promise.all([
      db().from("document_template_versions").select("id, template_id, version, file_path, file_name").in("template_id", templateIds),
      db().from("document_templates").select("id, category").in("id", templateIds),
    ]);
    const tCat = new Map<string, string>(((ts ?? []) as any[]).map((t) => [t.id, String(t.category ?? "")]));
    for (const [docId, u] of byDoc) {
      const tv = ((tvs ?? []) as any[]).find((x) => x.template_id === u.template_id && x.version === u.template_version);
      if (!tv) continue;
      add(await templateVersionBlanks(tv.file_path, tv.file_name), category.get(docId) || tCat.get(u.template_id) || "");
    }
  }
  if (!blanks.length) return [];
  const { fundTemplateValues } = await import("@/lib/fund-doc-templates.server");
  return documentSetupNeeds(blanks, await fundTemplateValues(offeringId));
}
