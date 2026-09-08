export type AuditChange = { field: string; from: string | null; to: string | null };

export type OfferingAuditEventType =
  | "offering_created"
  | "offering_updated"
  | "wire_updated"
  | "document_created"
  | "document_updated"
  | "document_deleted";

const MASKED_FIELDS = new Set(["account_number", "routing_number", "swift", "iban"]);

export const FIELD_LABELS: Record<string, string> = {
  name: "Fund name",
  slug: "URL slug",
  summary: "Summary",
  reg_type: "Reg D type",
  min_investment_cents: "Minimum investment",
  target_raise_cents: "Target raise",
  is_open: "Open for investment",
  bank_name: "Bank name",
  bank_address: "Bank address",
  account_name: "Account name",
  account_number: "Account number",
  routing_number: "Routing number",
  swift: "SWIFT / BIC",
  memo: "Memo / reference",
  title: "Title",
  doc_type: "Document type",
  requires_signature: "Requires signature",
  sort_order: "Order",
  body: "Document text",
};

export const EVENT_LABELS: Record<OfferingAuditEventType, string> = {
  offering_created: "created the fund",
  offering_updated: "updated fund details",
  wire_updated: "updated wire instructions",
  document_created: "added a document",
  document_updated: "updated a document",
  document_deleted: "removed a document",
};

export function maskValue(field: string, value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value);
  if (MASKED_FIELDS.has(field)) {
    const tail = text.slice(-4);
    return text.length > 4 ? `••${tail}` : "••••";
  }
  if (field === "body") return `${text.length} characters`;
  return text;
}

/** Compare two flat records and return the fields that changed, with sensitive values masked. */
export function diffRecords(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
  fields: string[],
): AuditChange[] {
  const changes: AuditChange[] = [];
  for (const field of fields) {
    const prevRaw = before ? before[field] : undefined;
    const nextRaw = after[field];
    const prev = prevRaw === undefined || prevRaw === null ? "" : String(prevRaw);
    const next = nextRaw === undefined || nextRaw === null ? "" : String(nextRaw);
    if (prev === next) continue;
    changes.push({
      field,
      from: before ? maskValue(field, prev) : null,
      to: maskValue(field, next),
    });
  }
  return changes;
}

export function summarizeChanges(eventType: OfferingAuditEventType, changes: AuditChange[]): string {
  const labels = changes.map((c) => FIELD_LABELS[c.field] ?? c.field);
  if (labels.length === 0) return EVENT_LABELS[eventType];
  return `${EVENT_LABELS[eventType]} — ${labels.join(", ")}`;
}
