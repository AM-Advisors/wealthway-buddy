/** Sealed archive: records kept for legal retention but hidden from every normal view. */
export type SealedTable = "offering_document_versions" | "document_template_versions";

export async function sealedIds(db: any, table: SealedTable): Promise<Set<string>> {
  const { data, error } = await db.from("sealed_records").select("record_id").eq("record_table", table);
  if (error) throw new Error("Documents could not be loaded. Please try again.");
  return new Set(((data ?? []) as any[]).map((r) => r.record_id as string));
}

/** Drops sealed rows. Rows must include `id`. */
export function withoutSealed<T extends { id?: string }>(rows: T[], sealed: Set<string>): T[] {
  return rows.filter((r) => !r.id || !sealed.has(r.id));
}
