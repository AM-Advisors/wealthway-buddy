/**
 * Fund Operations Services (record-only). Harmonious staff record formation, EIN and
 * BOI work; a different staff member reviews before submission is recorded. Nothing
 * here files with any state, the IRS or FinCEN.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { setupActor, forbid } from "@/lib/fund-setup.server";
import { autoCompleteTasks } from "@/lib/fund-setup-extras.server";
import {
  checkTransition, managerView, SERVICE_KINDS, allowedNext,
  type ServiceKind, type ServiceStatus,
} from "@/lib/fund-services";

const db = () => supabaseAdmin as any;

const FIELD_KEYS: Record<ServiceKind, string[]> = {
  formation: ["state", "entityType", "registeredAgent", "submittedOn", "completedOn", "confirmationNumber", "notes"],
  ein: ["responsibleParty", "submittedOn", "completedOn", "notes"],
  boi: ["submittedOn", "completedOn", "confirmationNumber", "exemptionReason", "notes"],
};

async function actorFor(userId: string, offeringId: string) {
  const a = await setupActor(userId);
  if (!a.isStaff && !a.offeringIds.includes(offeringId)) forbid("you do not manage that fund.");
  return a;
}
async function staffFor(userId: string, offeringId: string) {
  const a = await actorFor(userId, offeringId);
  if (!a.isStaff) forbid("only Harmonious can update operations services.");
  return a;
}

async function ensureOrder(offeringId: string, kind: ServiceKind) {
  const { data } = await db().from("fund_service_orders").select("*").eq("offering_id", offeringId).eq("kind", kind).maybeSingle();
  if (data) return data;
  const { data: created, error } = await db().from("fund_service_orders").upsert({ offering_id: offeringId, kind }, { onConflict: "offering_id,kind" }).select("*").single();
  if (error) throw new Error(error.message);
  return created;
}

async function logEvent(orderId: string, userId: string, ev: string, from: string | null, to: string | null, detail: Record<string, unknown> = {}) {
  await db().from("fund_service_order_events").insert({ order_id: orderId, actor_user_id: userId, event: ev, from_status: from, to_status: to, detail });
}

async function evidenceFlags(offeringId: string) {
  const { data: s } = await db().from("fund_setups").select("id").eq("offering_id", offeringId).maybeSingle();
  if (!s) return { hasCertificate: false, hasEinLetter: false, setupId: null as string | null };
  const { data: ef } = await db().from("fund_entity_formation").select("certificate_document_id, ein_letter_document_id").eq("setup_id", s.id).maybeSingle();
  return { hasCertificate: !!ef?.certificate_document_id, hasEinLetter: !!ef?.ein_letter_document_id, setupId: s.id as string };
}

async function names(userIds: string[]) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return new Map<string, string>();
  const { data } = await db().from("persons").select("user_id, legal_first_name, legal_last_name").in("user_id", ids);
  return new Map<string, string>(((data ?? []) as any[]).map((p) => [p.user_id, `${p.legal_first_name ?? ""} ${p.legal_last_name ?? ""}`.trim() || "Harmonious team member"]));
}

export async function getServices(userId: string, offeringId: string) {
  const a = await actorFor(userId, offeringId);
  const { data: rows } = await db().from("fund_service_orders").select("*").eq("offering_id", offeringId);
  const byKind = new Map<string, any>(((rows ?? []) as any[]).map((r) => [r.kind, r]));
  const ev = await evidenceFlags(offeringId);
  const who = await names(((rows ?? []) as any[]).flatMap((r) => [r.prepared_by, r.reviewed_by]));

  let parties: any[] = [];
  let candidates: { personId: string; name: string }[] = [];
  if (a.isStaff) {
    const { data: p } = await db().from("fund_boi_parties").select("id, person_id, role, id_document_provided").eq("offering_id", offeringId).is("removed_at", null);
    const { data: sig } = await db().from("fund_signatories").select("person_id").eq("offering_id", offeringId).eq("status", "active");
    const { data: o } = await db().from("offerings").select("client_id").eq("id", offeringId).maybeSingle();
    const { data: cc } = o?.client_id
      ? await db().from("client_contacts").select("person_id").eq("client_id", o.client_id).eq("status", "active").is("deactivated_at", null).not("person_id", "is", null)
      : { data: [] };
    const ids = [...new Set([...(p ?? []), ...(sig ?? []), ...(cc ?? [])].map((x: any) => x.person_id).filter(Boolean))];
    const { data: persons } = ids.length ? await db().from("persons").select("id, legal_first_name, legal_last_name").in("id", ids) : { data: [] };
    const nm = new Map<string, string>(((persons ?? []) as any[]).map((x) => [x.id, `${x.legal_first_name ?? ""} ${x.legal_last_name ?? ""}`.trim() || "Unnamed person"]));
    parties = ((p ?? []) as any[]).map((x) => ({ id: x.id, personId: x.person_id, name: nm.get(x.person_id) ?? "Unnamed person", role: x.role, idProvided: x.id_document_provided }));
    candidates = ids.map((id) => ({ personId: id as string, name: nm.get(id as string) ?? "Unnamed person" }));
  }

  return {
    canEdit: a.isStaff,
    userId,
    hasSetup: !!ev.setupId,
    evidence: { certificate: ev.hasCertificate, einLetter: ev.hasEinLetter },
    services: SERVICE_KINDS.map((kind) => {
      const r = byKind.get(kind);
      const status = (r?.status ?? "not_started") as ServiceStatus;
      const fields = (r?.fields ?? {}) as Record<string, string>;
      return {
        kind, status,
        fields: (a.isStaff ? fields : managerView(fields)) as Record<string, string>,
        next: a.isStaff ? allowedNext(kind, status) : [],
        preparedBy: r?.prepared_by ?? null,
        preparedByName: r?.prepared_by ? who.get(r.prepared_by) ?? "Harmonious team member" : null,
        reviewedByName: r?.reviewed_by ? who.get(r.reviewed_by) ?? "Harmonious team member" : null,
        reviewedAt: r?.reviewed_at ?? null,
      };
    }),
    parties, candidates,
  };
}

export async function saveServiceFields(userId: string, input: { offeringId: string; kind: ServiceKind; fields: Record<string, string> }) {
  await staffFor(userId, input.offeringId);
  const order = await ensureOrder(input.offeringId, input.kind);
  if (order.status === "completed") throw new Error("This service is completed; its record is locked.");
  const allowed = FIELD_KEYS[input.kind];
  const clean = Object.fromEntries(Object.entries(input.fields).filter(([k]) => allowed.includes(k)).map(([k, v]) => [k, String(v).slice(0, 1000)]));
  const fields = { ...(order.fields ?? {}), ...clean };
  await db().from("fund_service_orders").update({ fields, updated_at: new Date().toISOString() }).eq("id", order.id);
  await logEvent(order.id, userId, "fields_saved", order.status, order.status, { keys: Object.keys(clean) });
  return { ok: true };
}

export async function moveService(userId: string, input: { offeringId: string; kind: ServiceKind; to: ServiceStatus; note?: string | null | undefined }) {
  await staffFor(userId, input.offeringId);
  const order = await ensureOrder(input.offeringId, input.kind);
  const ev = await evidenceFlags(input.offeringId);
  let boiPartyCount = 0;
  if (input.kind === "boi") {
    const { count } = await db().from("fund_boi_parties").select("id", { count: "exact", head: true }).eq("offering_id", input.offeringId).is("removed_at", null);
    boiPartyCount = count ?? 0;
  }
  const err = checkTransition({
    kind: input.kind, from: order.status, to: input.to, actorId: userId, preparedBy: order.prepared_by,
    fields: order.fields ?? {}, hasCertificate: ev.hasCertificate, hasEinLetter: ev.hasEinLetter, boiPartyCount,
  });
  if (err) throw new Error(err);
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: input.to, updated_at: now };
  if (input.to === "ready_for_review") { patch["prepared_by"] = userId; patch["prepared_at"] = now; patch["reviewed_by"] = null; patch["reviewed_at"] = null; }
  if (input.to === "reviewed") { patch["reviewed_by"] = userId; patch["reviewed_at"] = now; }
  if (input.to === "preparing") { patch["reviewed_by"] = null; patch["reviewed_at"] = null; }
  // Optimistic concurrency: only move from the status we checked.
  const { data: moved } = await db().from("fund_service_orders").update(patch).eq("id", order.id).eq("status", order.status).select("id");
  if (!moved?.length) throw new Error("Someone else just updated this service. Refresh and try again.");
  await logEvent(order.id, userId, "status_changed", order.status, input.to, input.note ? { note: input.note.slice(0, 1000) } : {});

  if (input.kind === "ein" && ev.setupId && (input.to === "submitted" || input.to === "completed")) {
    const col = input.to === "submitted" ? "ein_requested_at" : "ein_received_at";
    await db().from("fund_entity_formation").update({ [col]: now, updated_by: userId, updated_at: now }).eq("setup_id", ev.setupId).then(() => null, () => null);
  }
  await autoCompleteTasks(input.offeringId);
  return { ok: true };
}

export async function addBoiParty(userId: string, input: { offeringId: string; personId: string; role: "beneficial_owner" | "company_applicant" }) {
  await staffFor(userId, input.offeringId);
  const data = await getServices(userId, input.offeringId);
  if (!data.candidates.some((c) => c.personId === input.personId)) throw new Error("Choose someone already listed on this Fund or its Client.");
  const order = await ensureOrder(input.offeringId, "boi");
  if (order.status === "completed") throw new Error("This BOI report is completed; its record is locked.");
  const { error } = await db().from("fund_boi_parties").insert({ offering_id: input.offeringId, person_id: input.personId, role: input.role, added_by: userId });
  if (error) throw new Error(error.code === "23505" ? "That person is already listed in that role." : error.message);
  await logEvent(order.id, userId, "party_added", order.status, order.status, { role: input.role });
  return { ok: true };
}

export async function updateBoiParty(userId: string, input: { offeringId: string; id: string; idProvided?: boolean | undefined; remove?: boolean | undefined }) {
  await staffFor(userId, input.offeringId);
  const order = await ensureOrder(input.offeringId, "boi");
  if (order.status === "completed") throw new Error("This BOI report is completed; its record is locked.");
  const patch: Record<string, unknown> = input.remove
    ? { removed_at: new Date().toISOString(), removed_by: userId }
    : { id_document_provided: !!input.idProvided };
  await db().from("fund_boi_parties").update(patch).eq("id", input.id).eq("offering_id", input.offeringId).is("removed_at", null);
  await logEvent(order.id, userId, input.remove ? "party_removed" : "party_updated", order.status, order.status);
  return { ok: true };
}
