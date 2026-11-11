/**
 * Foundation verification requirements (pure projection, browser-safe).
 *
 * Kept distinct, never merged:
 *  - account identity (the sign-in check on a login), shown for context only and never counted here;
 *  - foundation/entity records review, an explicit Compliance decision recorded per foundation;
 *  - related-person identity and screening, read from each person's canonical verification record;
 *  - foundation screening, which runs only through the existing screening process (not connected for foundations yet);
 *  - authority to act, from recorded roles backed by accepted evidence.
 * Foundations have no equity owners: control persons come from recorded authority and no ownership percentages are asked.
 * Nothing here approves anything; missing or unreadable evidence stays unresolved.
 */
import type { ComponentKey } from "@/lib/foundation-admin-model";
import { AUTHORITY_ROLES, AUTHORITY_SCOPES, EVIDENCED_SCOPES, type AuthorityScope } from "@/lib/foundation-admin-model";

export type ReqStatus = "satisfied" | "in_review" | "missing" | "exception";
export type ReqArea = "entity" | "screening" | "person" | "authority";

export type Requirement = {
  key: string; area: ReqArea; label: string; why: string; status: ReqStatus;
  personId?: string | null; source: string | null; items: string[];
};

export type VDoc = { id: string; kind: string; source: "staff" | "client"; superseded_by: string | null; review: "accepted" | "correction_requested" | null };
export type VAuthority = { person_id: string; role: string; authority_scopes: readonly string[]; evidence_document_id: string | null; status: string };
export type VPerson = { name: string; kyc_status: string | null; aml_status: string | null } | null | undefined;
export type VEntityReview = { decision: "approved" | "declined" | "more_information"; evidence_document_ids: readonly string[]; note: string; created_at: string } | null;

export type VerificationInput = {
  profile: { classification: string; exemption_status: string; legal_structure: string };
  entity: { tax_id_status: string | null } | null;
  documents: readonly VDoc[];
  authority: readonly VAuthority[];
  persons: Readonly<Record<string, VPerson>>;
  entityReview: VEntityReview;
  components: readonly ComponentKey[];
};

/** Roles that control or act for a foundation. Paperwork preparers never do. */
export const CONTROL_ROLES = ["director", "trustee", "officer", "authorized_signer", "approver"] as const;

export const usableDoc = (d: VDoc | undefined) => !!d && !d.superseded_by && (d.source === "staff" || d.review === "accepted");

export const OWNERSHIP_NOTE = "Foundations have no equity owners, so no ownership percentages are collected. The people who need checks come from the directors, trustees, officers, signers and approvers on record.";
export const SCREENING_NOT_CONNECTED = "Foundation screening runs only through the existing screening process, which isn't connected for foundations yet. It stays unresolved until it is.";

function personStatus(v: string | null | undefined): ReqStatus {
  if (v === "approved") return "satisfied";
  if (v === "declined") return "exception";
  if (v === "pending" || v === "review" || v === "in_review") return "in_review";
  return "missing";
}

/** Authority the service scope needs someone to hold, with evidence. */
export function scopesNeeded(components: readonly ComponentKey[]): AuthorityScope[] {
  const s: AuthorityScope[] = ["sign_agreements"];
  if (components.includes("grant_administration")) s.push("approve_grants");
  if (components.includes("bookkeeping_reporting")) s.push("banking");
  return s;
}

export function foundationRequirements(input: VerificationInput): Requirement[] {
  const docs = new Map(input.documents.map((d) => [d.id, d]));
  const current = input.documents.filter((d) => !d.superseded_by);
  const usable = current.filter(usableDoc);
  const has = (kind: string) => usable.some((d) => d.kind === kind);
  const pendingKind = (kind: string) => current.some((d) => d.kind === kind && d.source === "client" && d.review === null);
  const out: Requirement[] = [];

  // 1. Foundation records (entity verification): explicit Compliance decision on accepted evidence.
  const entityItems: string[] = [];
  if (!has("governing_document")) entityItems.push(pendingKind("governing_document") ? "Governing document uploaded, waiting for review" : "Governing document, such as articles, bylaws or a trust instrument");
  if (input.entity?.tax_id_status !== "issued") entityItems.push("The foundation's EIN");
  const r = input.entityReview;
  const reviewStillValid = r?.decision === "approved" && r.evidence_document_ids.every((id) => usableDoc(docs.get(id)))
    && r.evidence_document_ids.some((id) => docs.get(id)?.kind === "governing_document");
  let entityStatus: ReqStatus;
  if (r?.decision === "declined") { entityStatus = "exception"; entityItems.unshift(`Declined: ${r.note}`); }
  else if (reviewStillValid && !entityItems.length) entityStatus = "satisfied";
  else if (r?.decision === "approved" && !reviewStillValid) { entityStatus = "in_review"; entityItems.unshift("The evidence behind the earlier approval was replaced; it needs a new decision"); }
  else if (r?.decision === "more_information") { entityStatus = "missing"; entityItems.unshift(`More information requested: ${r.note}`); }
  else entityStatus = entityItems.length ? "missing" : "in_review";
  if (entityStatus === "in_review" && !entityItems.length) entityItems.push("Waiting for a Compliance decision");
  out.push({ key: "entity_records", area: "entity", label: "Foundation records reviewed", why: "Confirms the foundation exists as described, from its governing documents and EIN.", status: entityStatus, source: r ? "Compliance decision" : null, items: entityItems });

  // 2. Tax exemption evidence: status alone never counts; an approved records decision must cite the letter.
  const charitable = !["unknown", "other"].includes(input.profile.classification) || input.components.some((c) => c === "contributions_restrictions" || c === "annual_compliance");
  if (charitable) {
    const cited = reviewStillValid && r!.evidence_document_ids.some((id) => docs.get(id)?.kind === "determination_letter");
    const items: string[] = [];
    let status: ReqStatus;
    if (input.profile.exemption_status === "revoked") { status = "exception"; items.push("Exemption is recorded as revoked"); }
    else if (cited && input.profile.exemption_status === "determined") status = "satisfied";
    else {
      status = has("determination_letter") ? "in_review" : "missing";
      if (input.profile.exemption_status !== "determined") items.push(`Exemption status: ${input.profile.exemption_status === "pending" ? "application pending" : input.profile.exemption_status === "not_applied" ? "not applied" : "not known yet"}`);
      items.push(has("determination_letter") ? "Determination letter on file, not yet cited in a Compliance decision" : "IRS determination letter");
    }
    out.push({ key: "exemption_evidence", area: "entity", label: "Tax exemption confirmed", why: "Recorded exemption status is only a claim until the determination letter is reviewed.", status, source: cited ? "Compliance decision" : null, items });
  }

  // 3. Foundation screening: only the existing screening process may satisfy it.
  out.push({ key: "entity_screening", area: "screening", label: "Foundation screening", why: "Required before Harmonious provides services to the foundation.", status: "missing", source: null, items: [SCREENING_NOT_CONNECTED] });

  // 4. Control persons: identity and screening from each person's own verification record.
  const active = input.authority.filter((a) => a.status === "active");
  const control = [...new Set(active.filter((a) => (CONTROL_ROLES as readonly string[]).includes(a.role) || a.authority_scopes.some((s) => (EVIDENCED_SCOPES as readonly string[]).includes(s))).map((a) => a.person_id))];
  for (const pid of control) {
    const p = input.persons[pid];
    const roles = [...new Set(active.filter((a) => a.person_id === pid).map((a) => AUTHORITY_ROLES[a.role as keyof typeof AUTHORITY_ROLES] ?? a.role))].join(", ");
    const name = p?.name ?? "Person on file";
    if (!p) {
      out.push({ key: `person_identity:${pid}`, area: "person", personId: pid, label: `${name}: identity`, why: roles, status: "missing", source: null, items: ["Their verification record couldn't be read"] });
      out.push({ key: `person_screening:${pid}`, area: "screening", personId: pid, label: `${name}: screening`, why: roles, status: "missing", source: null, items: ["Their verification record couldn't be read"] });
      continue;
    }
    const idS = personStatus(p.kyc_status), amlS = personStatus(p.aml_status);
    out.push({ key: `person_identity:${pid}`, area: "person", personId: pid, label: `${name}: identity`, why: roles, status: idS, source: idS === "missing" ? null : "Person's verification record", items: idS === "satisfied" ? [] : [idS === "exception" ? "Identity was declined" : idS === "in_review" ? "Identity check in review" : "Identity not verified yet"] });
    out.push({ key: `person_screening:${pid}`, area: "screening", personId: pid, label: `${name}: screening`, why: roles, status: amlS, source: amlS === "missing" ? null : "Person's verification record", items: amlS === "satisfied" ? [] : [amlS === "exception" ? "Screening has an unresolved result" : amlS === "in_review" ? "Screening in review" : "Not screened yet"] });
  }
  if (!control.length) out.push({ key: "control_persons", area: "person", label: "Directors, trustees or officers", why: OWNERSHIP_NOTE, status: "missing", source: null, items: ["Record at least one director, trustee or officer"] });

  // 5. Authority to act, for what the service needs.
  for (const scope of scopesNeeded(input.components)) {
    const holders = active.filter((a) => a.authority_scopes.includes(scope) && a.role !== "paperwork_preparer");
    const evidenced = holders.filter((a) => usableDoc(docs.get(a.evidence_document_id ?? "")));
    const label = AUTHORITY_SCOPES[scope];
    out.push({
      key: `authority:${scope}`, area: "authority", label: `Authority: ${label.toLowerCase()}`,
      why: scope === "sign_agreements" ? "Someone must be able to sign the foundation's agreement with Harmonious." : scope === "approve_grants" ? "Grant administration needs the person who approves grants on record." : "Bookkeeping needs the people with bank account authority on record.",
      status: evidenced.length ? "satisfied" : holders.length ? "in_review" : "missing",
      source: evidenced.length ? "Recorded role with accepted evidence" : null,
      items: evidenced.length ? [] : holders.length ? ["Evidence for this authority isn't current and accepted"] : [`Record who can ${label.toLowerCase()}, with the document that grants it`],
    });
  }
  return out;
}

export function verificationSummary(reqs: readonly Requirement[]) {
  const unresolved = reqs.filter((r) => r.status !== "satisfied");
  return { complete: unresolved.length === 0, unresolved: unresolved.length, exceptions: reqs.filter((r) => r.status === "exception").length };
}

/** What a client member may see: plain status only. Screening details and decision notes stay with Harmonious. */
export function clientVerificationView(reqs: readonly Requirement[]) {
  return reqs.map((r) => ({
    key: r.key, label: r.label,
    status: r.area === "screening" ? (r.status === "satisfied" ? "satisfied" : "in_review") as ReqStatus : r.status === "exception" ? "in_review" as ReqStatus : r.status,
    items: r.area === "screening" || r.status === "exception" ? [] : r.items.filter((i) => !i.startsWith("Declined") && !i.startsWith("More information requested")),
  }));
}
