/**
 * Full formation record (record-only). Pure helpers shared by server and UI:
 * document types, what a fund manager may see, and simple validation.
 * Nothing here files with a state or orders from a provider.
 */
export const FORMATION_DOC_TYPES = [
  { key: "formation_document", label: "Articles / Formation document" },
  { key: "certificate_of_formation", label: "Certificate of Formation" },
  { key: "operating_agreement", label: "Operating / LP agreement" },
  { key: "good_standing", label: "Certificate of good standing" },
  { key: "registered_agent_consent", label: "Registered agent consent" },
  { key: "formation_amendment", label: "Amendment" },
  { key: "formation_other", label: "Other formation document" },
] as const;
export type FormationDocType = (typeof FORMATION_DOC_TYPES)[number]["key"];
export const FORMATION_DOC_KEYS = FORMATION_DOC_TYPES.map((d) => d.key) as string[];
export const docTypeLabel = (k: string) => FORMATION_DOC_TYPES.find((d) => d.key === k)?.label ?? "Formation document";

export const PROCESSING_OPTIONS = ["Standard", "Expedited", "Same day"] as const;
export const NAME_CHECK_RESULTS = ["Not checked", "Available", "Unavailable", "Reserved"] as const;

/** Fields from the formation order a fund manager may see. */
const MANAGER_FORMATION_FIELDS = ["state", "entityType", "processingOption", "formationDate", "submittedOn", "completedOn", "actionRequired", "actionRequiredReason"];
export function managerFormationFields(fields: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(fields).filter(([k]) => MANAGER_FORMATION_FIELDS.includes(k)));
}

export type TimelineEntry = { at: string; event: string; from: string | null; to: string | null; managerVisible: boolean; note?: string | null };

/** Plain wording for a timeline entry. Managers never see internal notes. */
export function timelineText(e: TimelineEntry, statusLabel: (s: string) => string, forManager: boolean): string {
  let text: string;
  switch (e.event) {
    case "status_changed": text = `Moved to ${statusLabel(e.to ?? "")}`; break;
    case "fields_saved": text = "Formation details updated"; break;
    case "authorization_recorded": text = "Client authorization recorded"; break;
    case "document_added": text = "Formation document added"; break;
    case "provider_set": text = "Provider or package updated"; break;
    case "discrepancy_opened": text = forManager ? "Harmonious is confirming a detail" : "Discrepancy noted"; break;
    case "discrepancy_resolved": text = forManager ? "Detail confirmed" : "Discrepancy resolved"; break;
    default: text = "Formation updated";
  }
  if (!forManager && e.note) text += ` — ${e.note}`;
  return text;
}

export function validateAuthorization(i: { authorizationText: string; authorizedOn: string }): string | null {
  if (i.authorizationText.trim().length < 20) return "Enter the authorization wording the client agreed to.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.authorizedOn)) return "Enter the date the client gave authorization.";
  if (i.authorizedOn > new Date().toISOString().slice(0, 10)) return "The authorization date can't be in the future.";
  return null;
}

export function validateCost(i: { stateFees: number; providerCost: number; customerTotal: number }): string | null {
  for (const v of [i.stateFees, i.providerCost, i.customerTotal]) if (!Number.isFinite(v) || v < 0) return "Amounts must be zero or more.";
  return null;
}
