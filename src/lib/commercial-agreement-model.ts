/**
 * Harmonious commercial agreements (MSA / SOW between Harmonious and its client).
 * Pure projection. This is NEVER an operational gate: an incomplete agreement is a
 * Harmonious follow-up item only. It is unrelated to investor subscription agreements
 * and never feeds Investment Readiness.
 */

export const CONTRACT_STRUCTURES = ["combined", "separate", "msa_only", "sow_only", "not_determined"] as const;
export type ContractStructure = (typeof CONTRACT_STRUCTURES)[number];
export const CONTRACT_STRUCTURE_LABELS: Record<ContractStructure, string> = {
  combined: "Combined MSA + SOW",
  separate: "Separate MSA and SOW",
  msa_only: "MSA Only",
  sow_only: "SOW Only",
  not_determined: "Not Yet Determined",
};
export const isContractStructure = (v: unknown): v is ContractStructure =>
  typeof v === "string" && (CONTRACT_STRUCTURES as readonly string[]).includes(v);

export type DocStatus = "not_prepared" | "draft" | "sent" | "partially_signed" | "signed" | "superseded";
export const DOC_STATUS_LABELS: Record<DocStatus, string> = {
  not_prepared: "Not Prepared", draft: "Draft", sent: "Sent", partially_signed: "Partially Signed", signed: "Signed", superseded: "Superseded",
};

export type AgreementOverall = "complete" | "follow_up" | "needs_review";
export const AGREEMENT_OVERALL_LABELS: Record<AgreementOverall, string> = {
  complete: "Complete", follow_up: "Follow-up required", needs_review: "Setup needs review",
};

/** Status of an MSA record. Only recorded execution counts as signed. */
export function msaDocStatus(row: { status?: string | null; executed_at?: string | null; client_approved_at?: string | null } | null, clientMsaSignedOn?: string | null): DocStatus {
  if (row?.executed_at) return "signed";
  if (!row) return clientMsaSignedOn ? "signed" : "not_prepared";
  const s = String(row.status ?? "").toLowerCase();
  if (s === "superseded") return "superseded";
  if (row.client_approved_at) return "partially_signed";
  if (s === "sent" || s === "awaiting_signature") return "sent";
  return "draft";
}

/** Status of a SOW record. Continued operations never change these facts. */
export function sowDocStatus(row: { status?: string | null; executed_at?: string | null; signed_on?: string | null; signed_by?: string | null; client_signed_at?: string | null; client_status?: string | null } | null): DocStatus {
  if (!row) return "not_prepared";
  const s = String(row.status ?? "").toLowerCase();
  if (s === "superseded" || s === "terminated") return "superseded";
  if (row.executed_at || (row.signed_on && row.signed_by && s === "active")) return "signed";
  if (row.client_signed_at) return "partially_signed";
  const cs = String(row.client_status ?? "").toLowerCase();
  if (cs === "sent" || cs === "awaiting_signature" || cs === "in_review" || cs === "pending") return "sent";
  return "draft";
}

export type AgreementLine = { key: "agreement" | "msa" | "sow"; label: string; status: DocStatus; followUp: boolean };
export type CommercialAgreementStatus = {
  structure: ContractStructure;
  structureLabel: string;
  overall: AgreementOverall;
  overallLabel: string;
  lines: AgreementLine[];
  /** e.g. "MSA unsigned", "SOW unsigned", "MSA and SOW unsigned". */
  remaining: string | null;
  headline: string | null;
  supporting: string | null;
  followUpItems: string[];
};

const done = (s: DocStatus) => s === "signed";

export function commercialAgreementStatus(structure: ContractStructure, msa: DocStatus, sow: DocStatus): CommercialAgreementStatus {
  const base = { structure, structureLabel: CONTRACT_STRUCTURE_LABELS[structure] };
  if (structure === "not_determined") {
    return { ...base, overall: "needs_review", overallLabel: AGREEMENT_OVERALL_LABELS.needs_review, lines: [], remaining: null,
      headline: "Agreement setup needs review", supporting: "Harmonious Operations needs to record how this client's agreement is structured. Operations may continue.",
      followUpItems: ["Review agreement setup"] };
  }
  let lines: AgreementLine[];
  if (structure === "combined") {
    // One document, tracked on the statement-of-work record; never a fake separate MSA.
    lines = [{ key: "agreement", label: "Agreement", status: sow, followUp: !done(sow) }];
  } else if (structure === "separate") {
    lines = [
      { key: "msa", label: "MSA", status: msa, followUp: !done(msa) },
      { key: "sow", label: "SOW", status: sow, followUp: !done(sow) },
    ];
  } else if (structure === "msa_only") {
    lines = [{ key: "msa", label: "MSA", status: msa, followUp: !done(msa) }];
  } else {
    lines = [{ key: "sow", label: "SOW", status: sow, followUp: !done(sow) }];
  }
  const open = lines.filter((l) => l.followUp);
  if (!open.length) {
    return { ...base, overall: "complete", overallLabel: AGREEMENT_OVERALL_LABELS.complete, lines, remaining: null, headline: null, supporting: null, followUpItems: [] };
  }
  const remaining = structure === "combined" ? "Combined MSA + SOW unsigned"
    : open.length === 2 ? "MSA and SOW unsigned" : `${open[0]!.label} unsigned`;
  const supporting = structure === "combined"
    ? "Combined MSA + SOW is not fully executed. Operations may continue."
    : `${remaining}. Operations may continue.`;
  const followUpItems = structure === "combined" ? ["Obtain executed agreement"] : open.map((l) => `Obtain executed ${l.label}`);
  return { ...base, overall: "follow_up", overallLabel: AGREEMENT_OVERALL_LABELS.follow_up, lines, remaining,
    headline: "Agreement Follow-Up Required", supporting, followUpItems };
}

/** What a client/fund manager sees — non-disruptive and free of internal notes. */
export function clientAgreementNotice(s: Pick<CommercialAgreementStatus, "overall">): { title: string; body: string } | null {
  // "Setup needs review" is an internal Harmonious item; clients see nothing for it.
  if (s.overall !== "follow_up") return null;
  return {
    title: "Agreement requires attention",
    body: "Your Harmonious agreement has not yet been completed. You may continue using the workspace while this is resolved.",
  };
}
