/** Pure rules for documents kept on a client company record (client_entities). */
export const ENTITY_DOC_KINDS = [
  { value: "certificate_of_formation", label: "Certificate of formation" },
  { value: "formation_filing", label: "State formation filing" },
  { value: "ein_letter", label: "IRS EIN letter" },
  { value: "operating_agreement", label: "Operating agreement" },
  { value: "seal", label: "Company seal" },
  { value: "other", label: "Other document" },
] as const;

export type EntityDocKind = (typeof ENTITY_DOC_KINDS)[number]["value"];
export const ENTITY_DOC_KIND_VALUES = ENTITY_DOC_KINDS.map((k) => k.value) as [EntityDocKind, ...EntityDocKind[]];

export const ENTITY_DOC_BUCKET = "entity-documents";
export const ENTITY_DOC_TYPES = ["pdf", "png", "jpg", "jpeg", "docx"] as const;

export const entityDocKindLabel = (v: string) => ENTITY_DOC_KINDS.find((k) => k.value === v)?.label ?? "Document";

export function safeFileName(name: string): string {
  const cleaned = name.trim().replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").replace(/^[_.]+/, "");
  return (cleaned || "document").slice(0, 120);
}

export function entityDocPath(entityId: string, id: string, fileName: string): string {
  return `entities/${entityId}/${id}-${safeFileName(fileName)}`;
}

/** A recorded file must sit in its own company's folder. */
export function pathBelongsTo(entityId: string, path: string): boolean {
  const prefix = `entities/${entityId}/`;
  return path.startsWith(prefix) && !path.slice(prefix.length).includes("/") && !path.includes("..");
}

/** Documents in a fixed reading order: formation first, then tax, governance, other. */
export function sortEntityDocs<T extends { docKind: string; title: string }>(docs: T[]): T[] {
  const order = ENTITY_DOC_KIND_VALUES as readonly string[];
  return [...docs].sort((a, b) => {
    const d = order.indexOf(a.docKind) - order.indexOf(b.docKind);
    return d !== 0 ? d : a.title.localeCompare(b.title);
  });
}
