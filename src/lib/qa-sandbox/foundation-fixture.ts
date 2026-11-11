/**
 * Fictional Foundation Administration data for /qa-sandbox. Names, dates and amounts are invented. Handlers apply the
 * same pure rules the server uses and never reach the backend; nothing is sent, contracted, billed or filed.
 */
import { annualReturnReferenceDate, authorityProblem, foundationHandoffTasks, type ComponentKey } from "@/lib/foundation-admin-model";

export const QA_FOUNDATION_CLIENT = "f0000000-0000-4000-8000-0000000000c1";
const ENTITY = "f0000000-0000-4000-8000-0000000000e1";
const SPARE_ENTITY = "f0000000-0000-4000-8000-0000000000e2";
const PROFILE = "f0000000-0000-4000-8000-0000000000f1";
const QUINN = "f0000000-0000-4000-8000-0000000000a1";
const AVERY = "f0000000-0000-4000-8000-0000000000a2";

export const QA_FOUNDATION_FNS = [
  "getFoundationWorkspace", "saveFoundationProfile", "storeFoundationTaxId", "uploadFoundationDocument", "openFoundationDocument",
  "addFoundationAuthority", "endFoundationAuthority", "startFoundationHandoff", "setFoundationFlag", "getQuoteFoundationOptions", "getFoundationFlagState",
] as const;

export type QaFoundation = { profiles: any[]; authority: any[]; documents: any[]; events: any[]; tasks: any[]; entities: any[]; seq: number };

export function createQaFoundation(): QaFoundation {
  return {
    seq: 1,
    entities: [
      { id: ENTITY, legal_name: "Fablewood Community Foundation", entity_type: "other", jurisdiction: "Delaware", formation_date: "2019-04-02", tax_id_masked: null, tax_id_status: "not_started", offering_id: null, status: "active" },
      { id: SPARE_ENTITY, legal_name: "Fablewood Arts Trust", entity_type: "other", jurisdiction: "Texas", formation_date: "2022-09-15", tax_id_masked: null, tax_id_status: "not_started", offering_id: null, status: "active" },
    ],
    profiles: [{ id: PROFILE, client_id: QA_FOUNDATION_CLIENT, client_entity_id: ENTITY, legal_structure: "nonprofit_corporation", legal_structure_other: null, classification: "private_nonoperating_foundation", exemption_status: "pending", exemption_effective_on: null, determination_letter_on: null, fiscal_year_end_month: 12, mission: "Fictional mission: community arts grants in the sandbox only.", primary_contact_person_id: QUINN, status: "active" }],
    authority: [], documents: [], tasks: [],
    events: [{ id: "ev-0", foundation_profile_id: PROFILE, event: "profile_created", detail: {}, created_at: "2026-11-01T15:00:00Z" }],
  };
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
    case "getFoundationFlagState": return { enabled: true, canToggle: false, show: true };
    case "setFoundationFlag": throw new Error("The sandbox keeps Foundation Administration on.");
    case "getQuoteFoundationOptions": return { enabled: true, foundations: s.profiles.map((p) => ({ profileId: p.id, clientEntityId: p.client_entity_id, name: s.entities.find((e) => e.id === p.client_entity_id)?.legal_name, classification: p.classification, exemptionStatus: p.exemption_status })) };
    case "getFoundationWorkspace": {
      // GET payloads travel in the URL and are not decoded by the mock; only this fictional client exists.
      if (data?.clientId && data.clientId !== QA_FOUNDATION_CLIENT) throw new Error("Foundation not found.");
      const ids = s.profiles.map((p) => p.client_entity_id);
      return {
        enabled: true, canEdit: true, canToggle: false, people: PEOPLE,
        entities: s.entities.map((e) => ({ ...e, eligible: true, hasProfile: ids.includes(e.id) })),
        foundations: s.profiles.map((p) => ({
          profile: p, entity: s.entities.find((e) => e.id === p.client_entity_id),
          primaryContactName: PEOPLE.find((x) => x.personId === p.primary_contact_person_id)?.name ?? null,
          authority: s.authority.filter((r) => r.foundation_profile_id === p.id).map((r) => ({ ...r, personName: PEOPLE.find((x) => x.personId === r.person_id)?.name, evidenceTitle: s.documents.find((d) => d.id === r.evidence_document_id)?.title ?? null })),
          documents: s.documents.filter((d) => d.foundation_profile_id === p.id),
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
      s.documents.unshift({ id, foundation_profile_id: p.id, kind: data.kind, title: data.title, file_name: data.fileName, size_bytes: 1, superseded_by: null, uploaded_at: new Date().toISOString() });
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
