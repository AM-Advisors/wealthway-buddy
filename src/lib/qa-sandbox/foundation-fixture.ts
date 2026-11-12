/**
 * Fictional Foundation Administration data for /qa-sandbox. Names, dates and amounts are invented. Handlers apply the
 * same pure rules the server uses and never reach the backend; nothing is sent, contracted, billed or filed.
 */
import { annualReturnReferenceDate, authorityProblem, foundationHandoffTasks, FOUNDATION_COMPONENTS, type ComponentKey } from "@/lib/foundation-admin-model";
import { CLIENT_FACT_FIELDS, clientFactsSchema, onboardingChecklist, personRequestSchema, proposedChanges, reviewProblem, type FactChange } from "@/lib/foundation-onboarding-model";
import { clientVerificationView, foundationRequirements, verificationSummary } from "@/lib/foundation-verification-model";
import { PROTECTED_FINANCIAL, RELEASE_DIMENSIONS, RELEASE_EVIDENCE, REQUIRED_EVIDENCE, releaseRequestProblem, releaseState } from "@/lib/foundation-release-model";

export const QA_FOUNDATION_CLIENT = "f0000000-0000-4000-8000-0000000000c1";
const ENTITY = "f0000000-0000-4000-8000-0000000000e1";
const SPARE_ENTITY = "f0000000-0000-4000-8000-0000000000e2";
const PROFILE = "f0000000-0000-4000-8000-0000000000f1";
const QUINN = "f0000000-0000-4000-8000-0000000000a1";
const AVERY = "f0000000-0000-4000-8000-0000000000a2";

export const QA_FOUNDATION_FNS = [
  "getFoundationWorkspace", "saveFoundationProfile", "storeFoundationTaxId", "uploadFoundationDocument", "openFoundationDocument",
  "addFoundationAuthority", "endFoundationAuthority", "startFoundationHandoff", "setFoundationFlag", "getQuoteFoundationOptions", "getFoundationFlagState",
  "getFoundationReleaseView", "getFoundationReview", "reviewFoundationSubmission", "reviewFoundationDocument", "getFoundationVerification", "decideFoundationEntityReview",
  "getFoundationReleaseControls", "requestFoundationRelease", "decideFoundationRelease",
  "getClientFoundationAvailability", "getClientFoundations", "submitClientFoundationFacts", "requestClientFoundationPerson", "uploadClientFoundationDocument",
  "openClientFoundationDocument", "markClientFoundationReady", "withdrawClientFoundationSubmission",
] as const;

/** Fictional actors: the sandbox staff reviewer and a separate fictional client member, so maker-checker shows. */
const STAFF_USER = "f0000000-0000-4000-8000-0000000000b1";
const CLIENT_USER = "f0000000-0000-4000-8000-0000000000b2";
const FLAGS = { foundation_administration: true, foundation_quote_drafting: true, foundation_client_onboarding: true };

export type QaFoundation = { profiles: any[]; authority: any[]; documents: any[]; events: any[]; tasks: any[]; entities: any[]; seq: number; submissions: any[]; docReviews: any[]; verificationReviews: any[]; releaseEvents: any[] };

export function createQaFoundation(): QaFoundation {
  return {
    seq: 1,
    entities: [
      { id: ENTITY, legal_name: "Fablewood Community Foundation", entity_type: "other", jurisdiction: "Delaware", formation_date: "2019-04-02", tax_id_masked: null, tax_id_status: "not_started", offering_id: null, status: "active" },
      { id: SPARE_ENTITY, legal_name: "Fablewood Arts Trust", entity_type: "other", jurisdiction: "Texas", formation_date: "2022-09-15", tax_id_masked: null, tax_id_status: "not_started", offering_id: null, status: "active" },
    ],
    profiles: [{ id: PROFILE, client_id: QA_FOUNDATION_CLIENT, client_entity_id: ENTITY, legal_structure: "nonprofit_corporation", legal_structure_other: null, classification: "private_nonoperating_foundation", exemption_status: "pending", exemption_effective_on: null, determination_letter_on: null, fiscal_year_end_month: 12, mission: "Fictional mission: community arts grants in the sandbox only.", primary_contact_person_id: QUINN, status: "active" }],
    authority: [], documents: [], tasks: [], submissions: [], docReviews: [], verificationReviews: [], releaseEvents: [],
    events: [{ id: "ev-0", foundation_profile_id: PROFILE, event: "profile_created", detail: {}, created_at: "2026-11-01T15:00:00Z" }],
  };
}

const nowIso = () => new Date().toISOString();
const lastReview = (s: QaFoundation, docId: string) => [...s.docReviews].reverse().find((r) => r.document_id === docId) ?? null;
const docView = (s: QaFoundation, d: any) => { const r = d.source === "client" ? lastReview(s, d.id) : null; return { ...d, review: r?.decision ?? null, reviewNote: r?.note ?? null, review_note: r?.note ?? null, usable: !d.superseded_by && (d.source !== "client" || r?.decision === "accepted") }; };
function verification(s: QaFoundation, p: any) {
  const e = s.entities.find((x) => x.id === p.client_entity_id);
  const persons = Object.fromEntries(PEOPLE.map((x) => [x.personId, { name: x.name, kyc_status: x.personId === QUINN ? "approved" : "not_started", aml_status: x.personId === QUINN ? "review" : "not_started" }]));
  const reviews = s.verificationReviews.filter((r) => r.foundation_profile_id === p.id);
  return foundationRequirements({ profile: p, entity: e ?? null, documents: s.documents.filter((d) => d.foundation_profile_id === p.id).map((d) => docView(s, d)), authority: s.authority.filter((a) => a.foundation_profile_id === p.id), persons, entityReview: reviews[reviews.length - 1] ?? null, components: ["onboarding_setup"] });
}
function submitQa(s: QaFoundation, p: any, kind: string, payload: any, base: any = {}) {
  const id = `sub-${s.seq++}`;
  s.submissions.unshift({ id, foundation_profile_id: p.id, kind, payload, base, status: "submitted", submitted_by: CLIENT_USER, submitted_at: nowIso(), reviewed_by: null, reviewed_at: null, review_note: null });
  log(s, p.id, "client_submission");
  return { id };
}

const PEOPLE = [
  { personId: QUINN, name: "Quinn Rivera", email: "quinn.rivera@example.com", title: "Board chair" },
  { personId: AVERY, name: "Avery Chen", email: "avery.chen@example.com", title: "Office manager" },
];

function log(s: QaFoundation, profileId: string, event: string) {
  s.events.unshift({ id: `ev-${s.seq++}`, foundation_profile_id: profileId, event, detail: {}, created_at: new Date().toISOString() });
}

export function handleQaFoundationCall(fn: string, data: any, s: QaFoundation): unknown {
  const profile = (id: string) => { const p = s.profiles.find((x) => x.id === id); if (!p) throw new Error("Foundation not found."); return p; };
  switch (fn) {
    case "getFoundationFlagState": return { enabled: true, flags: FLAGS, canToggle: false, show: true };
    case "getFoundationReleaseView": return { commercial: [], delivery: [] };
    case "getFoundationReleaseControls": {
      const st = releaseState(s.releaseEvents);
      return { userId: STAFF_USER, canRequest: true, canApprove: false, flags: FLAGS, components: FOUNDATION_COMPONENTS.map((c) => ({ key: c.key, name: c.name, capability: c.readiness.capability, available: c.readiness.available, missing: c.readiness.missing, state: st[c.key] })), events: [...s.releaseEvents].reverse(), dimensions: RELEASE_DIMENSIONS, evidence: RELEASE_EVIDENCE, required: REQUIRED_EVIDENCE, protectedFinancial: PROTECTED_FINANCIAL };
    }
    case "requestFoundationRelease": {
      const st = releaseState(s.releaseEvents);
      const problem = releaseRequestProblem({ component: data.component, dimension: data.dimension, evidence: data.evidence ?? {}, reason: data.reason ?? "", roles: ["admin"], state: st[data.component as ComponentKey][data.dimension as "commercial" | "delivery"] });
      if (problem) throw new Error(problem);
      s.releaseEvents.push({ id: `rel-${s.seq++}`, component: data.component, dimension: data.dimension, action: "requested", request_id: null, evidence: data.evidence, reason: data.reason, actor_id: STAFF_USER, created_at: nowIso() });
      return { ok: true };
    }
    case "decideFoundationRelease": {
      if (data.action !== "withdrawn") throw new Error("Only a different Super Admin can approve or revoke a release. The sandbox reviewer can't.");
      const open = releaseState(s.releaseEvents)[data.component as ComponentKey][data.dimension as "commercial" | "delivery"].openRequest;
      if (!open) throw new Error("There is no open release request.");
      s.releaseEvents.push({ id: `rel-${s.seq++}`, component: data.component, dimension: data.dimension, action: "withdrawn", request_id: open.id, evidence: {}, reason: data.reason, actor_id: STAFF_USER, created_at: nowIso() });
      return { ok: true };
    }
    case "getFoundationReview": {
      const p = profile(data.profileId);
      return {
        canReview: true,
        submissions: s.submissions.filter((x) => x.foundation_profile_id === p.id).map((x) => ({ ...x, changes: x.payload?.changes ?? [], candidates: x.kind === "person_new" && x.status === "submitted" && String(x.payload?.lastName).toLowerCase() === "rivera" ? [{ id: QUINN, name: "Quinn Rivera", email: "quinn.rivera@example.com", hasLogin: false }] : [], changedSince: [], personName: PEOPLE.find((pp) => pp.personId === x.payload?.personId)?.name ?? null, ownSubmission: x.submitted_by === STAFF_USER })),
        pendingDocuments: s.documents.filter((d) => d.foundation_profile_id === p.id && d.source === "client" && !d.superseded_by && !lastReview(s, d.id)).map((d) => ({ ...d, ownUpload: false })),
      };
    }
    case "reviewFoundationSubmission": {
      const x = s.submissions.find((y) => y.id === data.submissionId);
      if (!x) throw new Error("Submission not found.");
      const problem = reviewProblem({ reviewerId: STAFF_USER, submitterId: x.submitted_by, decision: data.decision, note: data.note ?? null, status: x.status });
      if (problem) throw new Error(problem);
      if (data.decision === "accepted" && x.kind === "profile_facts") Object.assign(profile(x.foundation_profile_id), Object.fromEntries((x.payload.changes as FactChange[]).map((c) => [c.field, c.field === "fiscal_year_end_month" && c.to ? Number(c.to) : c.to])));
      if (data.decision === "accepted" && x.kind === "person_new" && x.candidates?.length && !data.person) throw new Error("Choose the matching person or confirm a new person.");
      Object.assign(x, { status: data.decision, reviewed_by: STAFF_USER, reviewed_at: nowIso(), review_note: data.note ?? null });
      log(s, x.foundation_profile_id, data.decision === "accepted" ? "submission_accepted" : "submission_correction_requested");
      return { ok: true };
    }
    case "reviewFoundationDocument": {
      const d = s.documents.find((y) => y.id === data.documentId && !y.superseded_by && y.source === "client");
      if (!d) throw new Error("Only the current version of a client upload can be reviewed.");
      if (data.decision === "correction_requested" && String(data.note ?? "").trim().length < 3) throw new Error("Say what needs to be corrected.");
      if (s.docReviews.some((r) => r.document_id === d.id)) throw new Error("This document was already reviewed. A replacement upload gets its own review.");
      s.docReviews.push({ document_id: d.id, decision: data.decision, note: data.note ?? null, created_at: nowIso() });
      log(s, d.foundation_profile_id, data.decision === "accepted" ? "document_accepted" : "document_correction_requested");
      return { ok: true };
    }
    case "getFoundationVerification": {
      const p = profile(data.profileId);
      const reqs = verification(s, p);
      return { requirements: reqs, summary: verificationSummary(reqs), reviews: s.verificationReviews.filter((r) => r.foundation_profile_id === p.id), canDecide: true, userId: STAFF_USER,
        evidenceOptions: s.documents.filter((d) => d.foundation_profile_id === p.id).map((d) => docView(s, d)).filter((d) => d.usable).map((d) => ({ id: d.id, title: d.title, kind: d.kind, uploadedByMe: d.source !== "client" })),
        accountChecks: [{ personId: QUINN, status: "approved" }] };
    }
    case "decideFoundationEntityReview": {
      const p = profile(data.profileId);
      const docs = s.documents.filter((d) => d.foundation_profile_id === p.id).map((d) => docView(s, d));
      if (data.decision === "approved") {
        if (!data.evidenceDocumentIds.some((id: string) => docs.find((d) => d.id === id && d.kind === "governing_document" && d.usable))) throw new Error("Approval needs a current, accepted governing document as evidence.");
        if (s.entities.find((e) => e.id === p.client_entity_id)?.tax_id_status !== "issued") throw new Error("Approval needs the foundation's EIN on file.");
      }
      s.verificationReviews.push({ id: `vr-${s.seq++}`, foundation_profile_id: p.id, decision: data.decision, evidence_document_ids: data.evidenceDocumentIds, note: data.note, decided_by: STAFF_USER, created_at: nowIso() });
      log(s, p.id, "verification_decided");
      return { ok: true };
    }
    case "getClientFoundationAvailability": return { available: true };
    case "getClientFoundations": return {
      available: true,
      foundations: s.profiles.map((p) => {
        const e = s.entities.find((x) => x.id === p.client_entity_id);
        const docs = s.documents.filter((d) => d.foundation_profile_id === p.id).map((d) => docView(s, d));
        const authority = s.authority.filter((a) => a.foundation_profile_id === p.id);
        const subs = s.submissions.filter((x) => x.foundation_profile_id === p.id);
        return {
          profileId: p.id, canEdit: true, name: e?.legal_name, jurisdiction: e?.jurisdiction, formationDate: e?.formation_date, einMasked: e?.tax_id_masked ?? null,
          facts: Object.fromEntries(Object.keys(CLIENT_FACT_FIELDS).map((k) => [k, p[k] ?? null])),
          people: PEOPLE.map((x) => ({ personId: x.personId, name: x.name, title: x.title })),
          authority: authority.filter((a) => a.status === "active").map((a) => ({ id: a.id, name: PEOPLE.find((x) => x.personId === a.person_id)?.name, role: a.role, title: a.title, scopes: a.authority_scopes })),
          documents: docs.map((d) => ({ id: d.id, kind: d.kind, title: d.title, uploadedAt: d.uploaded_at, source: d.source ?? "staff", superseded: !!d.superseded_by, review: d.review, reviewNote: d.review === "correction_requested" ? d.reviewNote : null, mine: d.source === "client" })),
          submissions: subs.map((x) => ({ id: x.id, kind: x.kind, status: x.status, submittedAt: x.submitted_at, reviewedAt: x.reviewed_at, note: x.status === "correction_requested" ? x.review_note : null, mine: x.submitted_by === CLIENT_USER, summary: x.kind === "profile_facts" ? `Details: ${(x.payload.changes as FactChange[]).map((c) => CLIENT_FACT_FIELDS[c.field]).join(", ")}` : x.kind === "ready_for_review" ? "Ready for review" : `Person: ${x.payload.firstName ?? PEOPLE.find((pp) => pp.personId === x.payload.personId)?.name ?? ""} ${x.payload.lastName ?? ""}`.trim() })),
          checklist: onboardingChecklist({ profile: p, entity: e ?? null, documents: docs, authority, submissions: subs }),
          verification: clientVerificationView(verification(s, p)),
        };
      }),
    };
    case "submitClientFoundationFacts": {
      const p = profile(data.profileId);
      const changes = proposedChanges(p, clientFactsSchema.parse(data.facts));
      if (!changes.length) throw new Error("Nothing changed.");
      if (s.submissions.some((x) => x.foundation_profile_id === p.id && x.kind === "profile_facts" && x.status === "submitted")) throw new Error("Your earlier changes are still being reviewed. Withdraw them first to send new ones.");
      return submitQa(s, p, "profile_facts", { changes }, Object.fromEntries(changes.map((c) => [c.field, c.from])));
    }
    case "requestClientFoundationPerson": {
      const p = profile(data.profileId);
      const r = personRequestSchema.parse(data.request);
      return submitQa(s, p, r.mode === "existing" ? "person_existing" : "person_new", r);
    }
    case "uploadClientFoundationDocument": {
      const p = profile(data.profileId);
      const id = `doc-${s.seq++}`;
      if (data.replacesId) { const old = s.documents.find((d) => d.id === data.replacesId && !d.superseded_by && d.source === "client"); if (!old) throw new Error("Only your own current upload can be replaced."); old.superseded_by = id; }
      s.documents.unshift({ id, foundation_profile_id: p.id, kind: data.kind, title: data.title, file_name: data.fileName, size_bytes: 1, superseded_by: null, uploaded_at: nowIso(), source: "client" });
      log(s, p.id, "document_uploaded");
      return { id };
    }
    case "openClientFoundationDocument": return { url: "about:blank" };
    case "markClientFoundationReady": {
      const p = profile(data.profileId);
      if (s.submissions.some((x) => x.foundation_profile_id === p.id && x.kind === "ready_for_review" && x.status === "submitted")) throw new Error("Harmonious already has this for review.");
      return submitQa(s, p, "ready_for_review", {});
    }
    case "withdrawClientFoundationSubmission": {
      const x = s.submissions.find((y) => y.id === data.submissionId && y.status === "submitted");
      if (!x) throw new Error("This was already reviewed.");
      Object.assign(x, { status: "withdrawn", reviewed_by: CLIENT_USER, reviewed_at: nowIso() });
      return { ok: true };
    }
    case "setFoundationFlag": throw new Error("The sandbox keeps Foundation Administration on.");
    case "getQuoteFoundationOptions": return { enabled: true, foundations: s.profiles.map((p) => ({ profileId: p.id, clientEntityId: p.client_entity_id, name: s.entities.find((e) => e.id === p.client_entity_id)?.legal_name, classification: p.classification, exemptionStatus: p.exemption_status })) };
    case "getFoundationWorkspace": {
      // GET payloads travel in the URL and are not decoded by the mock; only this fictional client exists.
      if (data?.clientId && data.clientId !== QA_FOUNDATION_CLIENT) throw new Error("Foundation not found.");
      const ids = s.profiles.map((p) => p.client_entity_id);
      return {
        enabled: true, flags: FLAGS, canEdit: true, canReview: true, canToggle: false, userId: STAFF_USER, people: PEOPLE,
        entities: s.entities.map((e) => ({ ...e, eligible: true, hasProfile: ids.includes(e.id) })),
        foundations: s.profiles.map((p) => ({
          profile: p, entity: s.entities.find((e) => e.id === p.client_entity_id),
          primaryContactName: PEOPLE.find((x) => x.personId === p.primary_contact_person_id)?.name ?? null,
          authority: s.authority.filter((r) => r.foundation_profile_id === p.id).map((r) => ({ ...r, personName: PEOPLE.find((x) => x.personId === r.person_id)?.name, evidenceTitle: s.documents.find((d) => d.id === r.evidence_document_id)?.title ?? null })),
          documents: s.documents.filter((d) => d.foundation_profile_id === p.id).map((d) => docView(s, d)),
          events: s.events.filter((e) => e.foundation_profile_id === p.id),
          tasks: s.tasks.filter((t) => t.related_entity_id === p.client_entity_id),
          quotes: [], referenceDeadline: annualReturnReferenceDate(p.fiscal_year_end_month, new Date().toISOString().slice(0, 10)),
        })),
      };
    }
    case "saveFoundationProfile": {
      if (data.clientId !== QA_FOUNDATION_CLIENT || !s.entities.some((e) => e.id === data.clientEntityId)) throw new Error("That entity doesn't belong to this client.");
      if (data.exemptionStatus === "determined" && !data.determinationLetterOn) throw new Error("Enter the determination letter date, or choose a different exemption status.");
      const row = { legal_structure: data.legalStructure, legal_structure_other: data.legalStructureOther ?? null, classification: data.classification, exemption_status: data.exemptionStatus, exemption_effective_on: data.exemptionEffectiveOn ?? null, determination_letter_on: data.determinationLetterOn ?? null, fiscal_year_end_month: data.fiscalYearEndMonth ?? null, mission: data.mission ?? null, primary_contact_person_id: data.primaryContactPersonId ?? null };
      if (data.id) { Object.assign(profile(data.id), row); log(s, data.id, "profile_updated"); return { id: data.id }; }
      if (s.profiles.some((p) => p.client_entity_id === data.clientEntityId)) throw new Error("Couldn't create the foundation. It may already exist for that entity.");
      const id = `f0000000-0000-4000-8000-${String(100000000000 + s.seq++).padStart(12, "0")}`;
      s.profiles.push({ id, client_id: QA_FOUNDATION_CLIENT, client_entity_id: data.clientEntityId, status: "active", ...row });
      log(s, id, "profile_created");
      return { id };
    }
    case "storeFoundationTaxId": {
      const p = profile(data.profileId);
      const digits = String(data.ein).replace(/\D/g, "");
      if (digits.length !== 9) throw new Error("An EIN has 9 digits.");
      const e = s.entities.find((x) => x.id === p.client_entity_id)!;
      e.tax_id_masked = `•••••${digits.slice(-4)}`; e.tax_id_status = "issued";
      log(s, p.id, "tax_id_stored");
      return { masked: e.tax_id_masked };
    }
    case "uploadFoundationDocument": {
      const p = profile(data.profileId);
      const id = `doc-${s.seq++}`;
      if (data.replacesId) { const old = s.documents.find((d) => d.id === data.replacesId && !d.superseded_by); if (!old) throw new Error("Only a current document of this foundation can be replaced."); old.superseded_by = id; }
      s.documents.unshift({ id, foundation_profile_id: p.id, kind: data.kind, title: data.title, file_name: data.fileName, size_bytes: 1, superseded_by: null, uploaded_at: new Date().toISOString(), source: "staff" });
      log(s, p.id, data.replacesId ? "document_replaced" : "document_uploaded");
      return { id };
    }
    case "openFoundationDocument": return { url: "about:blank" };
    case "addFoundationAuthority": {
      const p = profile(data.profileId);
      const problem = authorityProblem({ role: data.role, scopes: data.scopes, evidenceDocumentId: data.evidenceDocumentId ?? null });
      if (problem) throw new Error(problem);
      if (!PEOPLE.some((x) => x.personId === data.personId)) throw new Error("Choose one of this client's people. Add them under People first.");
      if (s.authority.some((r) => r.foundation_profile_id === p.id && r.person_id === data.personId && r.role === data.role && r.status === "active")) throw new Error("Couldn't record that role. The person may already hold it.");
      const id = `role-${s.seq++}`;
      s.authority.push({ id, foundation_profile_id: p.id, person_id: data.personId, role: data.role, title: data.title ?? null, authority_scopes: data.scopes, evidence_document_id: data.evidenceDocumentId ?? null, evidence_note: data.evidenceNote ?? null, effective_on: new Date().toISOString().slice(0, 10), status: "active", ended_on: null });
      log(s, p.id, "authority_recorded");
      return { id };
    }
    case "endFoundationAuthority": {
      const r = s.authority.find((x) => x.id === data.roleId && x.status === "active");
      if (!r) throw new Error("This role was already ended.");
      r.status = "ended"; r.ended_on = new Date().toISOString().slice(0, 10);
      log(s, r.foundation_profile_id, "authority_ended");
      return { ok: true };
    }
    case "startFoundationHandoff": {
      const p = profile(data.profileId);
      const e = s.entities.find((x) => x.id === p.client_entity_id)!;
      let created = 0;
      for (const t of foundationHandoffTasks(e.legal_name, data.components as ComponentKey[])) {
        if (s.tasks.some((x) => x.title === t.title)) continue;
        s.tasks.push({ id: `task-${s.seq++}`, title: t.title, status: "open", due_date: new Date(Date.now() + t.dueInDays * 86400000).toISOString().slice(0, 10), related_entity_id: p.client_entity_id });
        created++;
      }
      log(s, p.id, "handoff_started");
      return { created };
    }
  }
  throw new Error("Not modeled in the sandbox.");
}
