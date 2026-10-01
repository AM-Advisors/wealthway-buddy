/**
 * Full formation record for a Fund (record-only). Builds on fund_service_orders (formation
 * kind) and fund_setup_documents. Staff record; fund managers get a masked read view.
 * Nothing here files with a state, orders from a provider, or moves money.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { setupActor, forbid } from "@/lib/fund-setup.server";
import { ensureOrder, logEvent } from "@/lib/fund-services.server";
import { STATUS_LABELS, type ServiceStatus } from "@/lib/fund-services";
import {
  FORMATION_DOC_KEYS, docTypeLabel, managerFormationFields, timelineText, validateAuthorization, validateCost,
} from "@/lib/fund-formation";

const db = () => supabaseAdmin as any;

async function readActor(userId: string, offeringId: string) {
  const a = await setupActor(userId);
  if (!a.isStaff && !a.offeringIds.includes(offeringId)) forbid("you do not manage that fund.");
  return a;
}
async function staffActor(userId: string, offeringId?: string) {
  const a = offeringId ? await readActor(userId, offeringId) : await setupActor(userId);
  if (!a.isStaff) forbid("only Harmonious can update formation records.");
  return a;
}
const personName = (p: any) => `${p?.legal_first_name ?? ""} ${p?.legal_last_name ?? ""}`.trim() || "Unnamed person";

export async function getFormationRecord(userId: string, offeringId: string) {
  const a = await readActor(userId, offeringId);
  const staff = a.isStaff;
  const { data: order } = await db().from("fund_service_orders").select("*").eq("offering_id", offeringId).eq("kind", "formation").maybeSingle();
  const { data: offering } = await db().from("offerings").select("legal_entity_name, name").eq("id", offeringId).maybeSingle();
  const [prov, bun] = await Promise.all([
    order?.provider_id ? db().from("formation_providers").select("id, name").eq("id", order.provider_id).maybeSingle() : { data: null },
    order?.bundle_id ? db().from("formation_bundles").select("id, name").eq("id", order.bundle_id).maybeSingle() : { data: null },
  ]);

  const { data: auths } = await db().from("fund_formation_authorizations").select("*").eq("offering_id", offeringId).order("created_at", { ascending: false });
  const pids = [...new Set(((auths ?? []) as any[]).map((x) => x.authorized_by_person_id))];
  const { data: persons } = pids.length ? await db().from("persons").select("id, legal_first_name, legal_last_name").in("id", pids) : { data: [] };
  const pn = new Map<string, string>(((persons ?? []) as any[]).map((p) => [p.id, personName(p)]));
  const authorizations = ((auths ?? []) as any[]).map((x) => ({
    id: x.id, personName: pn.get(x.authorized_by_person_id) ?? "Unnamed person", authorizedOn: x.authorized_on, method: x.method,
    ...(staff ? { text: x.authorization_text, registeredAgentChoice: x.registered_agent_choice } : {}),
  }));

  const { data: setup } = await db().from("fund_setups").select("id").eq("offering_id", offeringId).maybeSingle();
  const { data: docs } = setup
    ? await db().from("fund_setup_documents").select("id, doc_type, title, version, is_current, created_at, status").eq("setup_id", setup.id).in("doc_type", FORMATION_DOC_KEYS).order("created_at", { ascending: false })
    : { data: [] };
  const documents = ((docs ?? []) as any[]).filter((d) => staff || d.is_current).map((d) => ({
    id: d.id, type: d.doc_type, typeLabel: docTypeLabel(d.doc_type), title: d.title, version: d.version, current: d.is_current, at: d.created_at,
  }));

  const { data: evs } = order
    ? await db().from("fund_service_order_events").select("event, from_status, to_status, detail, manager_visible, created_at").eq("order_id", order.id).order("created_at", { ascending: false }).limit(50)
    : { data: [] };
  const label = (s: string) => STATUS_LABELS[s as ServiceStatus] ?? s;
  const timeline = ((evs ?? []) as any[])
    .filter((e) => staff || e.manager_visible)
    .map((e) => ({ at: e.created_at, text: timelineText({ at: e.created_at, event: e.event, from: e.from_status, to: e.to_status, managerVisible: e.manager_visible, note: e.detail?.note ?? null }, label, !staff) }));

  let staffOnly: any = null;
  if (staff) {
    const [costs, disc, providers, bundles, prices] = await Promise.all([
      db().from("fund_formation_costs").select("*").eq("offering_id", offeringId).order("created_at", { ascending: false }),
      db().from("fund_formation_discrepancies").select("*").eq("offering_id", offeringId).order("created_at", { ascending: false }),
      db().from("formation_providers").select("id, name").eq("active", true).order("name"),
      db().from("formation_bundles").select("id, name").eq("active", true).order("name"),
      db().from("formation_service_prices").select("*").order("jurisdiction"),
    ]);
    const { data: o } = await db().from("offerings").select("client_id").eq("id", offeringId).maybeSingle();
    const { data: sig } = await db().from("fund_signatories").select("person_id").eq("offering_id", offeringId).eq("status", "active");
    const { data: cc } = o?.client_id
      ? await db().from("client_contacts").select("person_id").eq("client_id", o.client_id).eq("status", "active").is("deactivated_at", null).not("person_id", "is", null)
      : { data: [] };
    const ids = [...new Set([...(sig ?? []), ...(cc ?? [])].map((x: any) => x.person_id).filter(Boolean))];
    const { data: ppl } = ids.length ? await db().from("persons").select("id, legal_first_name, legal_last_name").in("id", ids) : { data: [] };
    staffOnly = {
      fields: order?.fields ?? {},
      costs: ((costs.data ?? []) as any[]).map((c) => ({ id: c.id, stateFees: Number(c.state_fees), providerCost: Number(c.provider_cost), customerTotal: Number(c.customer_total), note: c.note, at: c.created_at })),
      discrepancies: ((disc.data ?? []) as any[]).map((d) => ({ id: d.id, field: d.field_label, ours: d.our_value, provider: d.provider_value, status: d.status, resolution: d.resolution, note: d.resolution_note, at: d.created_at })),
      providers: providers.data ?? [], bundles: bundles.data ?? [],
      prices: ((prices.data ?? []) as any[]).map((p) => ({ id: p.id, jurisdiction: p.jurisdiction, entityType: p.entity_type, stateFee: Number(p.state_fee), expediteFee: Number(p.expedite_fee), providerFee: Number(p.provider_fee), verified: p.verified })),
      people: ((ppl ?? []) as any[]).map((p) => ({ personId: p.id, name: personName(p) })),
      providerId: order?.provider_id ?? null, bundleId: order?.bundle_id ?? null,
    };
  }

  const fields = (order?.fields ?? {}) as Record<string, string>;
  return {
    canEdit: staff,
    status: (order?.status ?? "not_started") as ServiceStatus,
    legalName: offering?.legal_entity_name ?? null,
    summary: managerFormationFields(fields) as Record<string, string>,
    providerName: prov.data?.name ?? null,
    bundleName: bun.data?.name ?? null,
    openDiscrepancies: staffOnly ? staffOnly.discrepancies.filter((d: any) => d.status === "open").length : 0,
    hasPendingConfirmation: !staff ? await hasOpenDisc(offeringId) : false,
    authorizations, documents, timeline, staff: staffOnly,
  };
}

async function hasOpenDisc(offeringId: string) {
  const { count } = await db().from("fund_formation_discrepancies").select("id", { count: "exact", head: true }).eq("offering_id", offeringId).eq("status", "open");
  return (count ?? 0) > 0;
}

export async function recordAuthorization(userId: string, i: { offeringId: string; personId: string; authorizedOn: string; method: string; authorizationText: string; registeredAgentChoice?: string | null | undefined }) {
  await staffActor(userId, i.offeringId);
  const err = validateAuthorization(i); if (err) throw new Error(err);
  const data = await getFormationRecord(userId, i.offeringId);
  if (!data.staff.people.some((p: any) => p.personId === i.personId)) throw new Error("Choose someone already listed on this Fund or its Client.");
  const { error } = await db().from("fund_formation_authorizations").insert({
    offering_id: i.offeringId, authorized_by_person_id: i.personId, authorized_on: i.authorizedOn, method: i.method,
    authorization_text: i.authorizationText.slice(0, 4000), registered_agent_choice: i.registeredAgentChoice ?? null, recorded_by: userId,
  });
  if (error) throw new Error(error.message);
  const order = await ensureOrder(i.offeringId, "formation");
  await logEvent(order.id, userId, "authorization_recorded", order.status, order.status, {}, true);
  return { ok: true };
}

export async function addFormationDocument(userId: string, i: { offeringId: string; docType: string; path: string; title?: string | null | undefined }) {
  await staffActor(userId, i.offeringId);
  if (!FORMATION_DOC_KEYS.includes(i.docType)) throw new Error("Choose a formation document type.");
  if (!i.path.startsWith(`fund-setup-restricted/${i.offeringId}/`)) throw new Error("That file does not belong to this fund.");
  const { data: s } = await db().from("fund_setups").select("id").eq("offering_id", i.offeringId).maybeSingle();
  if (!s) throw new Error("Save the Fund Details first so a setup record exists.");
  // Formation, certificate types stay linked to the entity record via the existing evidence path.
  if (i.docType === "formation_document" || i.docType === "certificate_of_formation") {
    const { linkEvidence, autoCompleteTasks } = await import("@/lib/fund-setup-extras.server");
    await linkEvidence(userId, s.id, i.docType === "formation_document" ? "formation" : "certificate", i.path);
    await autoCompleteTasks(i.offeringId);
  } else {
    const { data: existing } = await db().from("fund_setup_documents").select("id, version, is_current").eq("setup_id", s.id).eq("doc_type", i.docType).order("version", { ascending: false });
    const current = (existing ?? []).find((d: any) => d.is_current);
    if (current) await db().from("fund_setup_documents").update({ is_current: false }).eq("id", current.id);
    const { error } = await db().from("fund_setup_documents").insert({
      setup_id: s.id, doc_type: i.docType, title: (i.title?.trim() || docTypeLabel(i.docType)).slice(0, 200), storage_path: i.path,
      version: ((existing ?? [])[0]?.version ?? 0) + 1, is_current: true, status: "uploaded", investor_facing: false,
      uploaded_by: userId, uploaded_role: "harmonious", supersedes_id: current?.id ?? null,
    });
    if (error) throw new Error(error.message);
  }
  const order = await ensureOrder(i.offeringId, "formation");
  await logEvent(order.id, userId, "document_added", order.status, order.status, { type: i.docType }, true);
  return { ok: true };
}

export async function setProviderBundle(userId: string, i: { offeringId: string; providerId: string | null; bundleId: string | null }) {
  await staffActor(userId, i.offeringId);
  const order = await ensureOrder(i.offeringId, "formation");
  if (order.status === "completed") throw new Error("This formation is completed; its record is locked.");
  await db().from("fund_service_orders").update({ provider_id: i.providerId, bundle_id: i.bundleId, updated_at: new Date().toISOString() }).eq("id", order.id);
  await logEvent(order.id, userId, "provider_set", order.status, order.status);
  return { ok: true };
}

export async function recordCost(userId: string, i: { offeringId: string; priceId?: string | null | undefined; stateFees: number; providerCost: number; customerTotal: number; note?: string | null | undefined }) {
  await staffActor(userId, i.offeringId);
  const err = validateCost(i); if (err) throw new Error(err);
  const { error } = await db().from("fund_formation_costs").insert({
    offering_id: i.offeringId, price_id: i.priceId ?? null, state_fees: i.stateFees, provider_cost: i.providerCost,
    customer_total: i.customerTotal, note: i.note?.slice(0, 500) ?? null, recorded_by: userId,
  });
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function openDiscrepancy(userId: string, i: { offeringId: string; field: string; ours?: string | null | undefined; provider?: string | null | undefined }) {
  await staffActor(userId, i.offeringId);
  if (!i.field.trim()) throw new Error("Name the detail that differs.");
  const { error } = await db().from("fund_formation_discrepancies").insert({ offering_id: i.offeringId, field_label: i.field.slice(0, 200), our_value: i.ours ?? null, provider_value: i.provider ?? null, recorded_by: userId });
  if (error) throw new Error(error.message);
  const order = await ensureOrder(i.offeringId, "formation");
  await logEvent(order.id, userId, "discrepancy_opened", order.status, order.status, {}, true);
  return { ok: true };
}

export async function resolveDiscrepancy(userId: string, i: { offeringId: string; id: string; resolution: "kept_ours" | "accepted_provider" | "other"; note: string }) {
  await staffActor(userId, i.offeringId);
  if (!i.note.trim()) throw new Error("Explain how it was settled.");
  const { data, error } = await db().from("fund_formation_discrepancies").update({ status: "resolved", resolution: i.resolution, resolution_note: i.note.slice(0, 1000), resolved_by: userId, resolved_at: new Date().toISOString() })
    .eq("id", i.id).eq("offering_id", i.offeringId).eq("status", "open").select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("That discrepancy is already settled.");
  const order = await ensureOrder(i.offeringId, "formation");
  await logEvent(order.id, userId, "discrepancy_resolved", order.status, order.status, {}, true);
  return { ok: true };
}

/* Reference data (staff only): providers, prices, bundles. */
export async function listReference(userId: string) {
  await staffActor(userId);
  const [p, pr, b] = await Promise.all([
    db().from("formation_providers").select("*").order("name"),
    db().from("formation_service_prices").select("*").order("jurisdiction"),
    db().from("formation_bundles").select("*").order("name"),
  ]);
  return { providers: p.data ?? [], prices: pr.data ?? [], bundles: b.data ?? [] };
}

export async function saveProvider(userId: string, i: { id?: string | undefined; name: string; providerType: string; active: boolean; notes?: string | null | undefined }) {
  await staffActor(userId);
  const row = { name: i.name.trim().slice(0, 200), provider_type: i.providerType, active: i.active, notes: i.notes ?? null, updated_at: new Date().toISOString() };
  const q = i.id ? db().from("formation_providers").update(row).eq("id", i.id) : db().from("formation_providers").insert({ ...row, created_by: userId });
  const { error } = await q; if (error) throw new Error(error.message);
  return { ok: true };
}

export async function addPrice(userId: string, i: { providerId?: string | null | undefined; jurisdiction: string; entityType?: string | null | undefined; stateFee: number; expediteFee: number; providerFee: number; verified: boolean }) {
  await staffActor(userId);
  if ([i.stateFee, i.expediteFee, i.providerFee].some((v) => !Number.isFinite(v) || v < 0)) throw new Error("Amounts must be zero or more.");
  const now = new Date().toISOString();
  const { error } = await db().from("formation_service_prices").insert({
    provider_id: i.providerId ?? null, jurisdiction: i.jurisdiction.trim().toUpperCase().slice(0, 40), entity_type: i.entityType ?? null,
    state_fee: i.stateFee, expedite_fee: i.expediteFee, provider_fee: i.providerFee, verified: i.verified,
    verified_at: i.verified ? now : null, verified_by: i.verified ? userId : null, created_by: userId,
  });
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function saveBundle(userId: string, i: { id?: string | undefined; name: string; description?: string | null | undefined; servicePackageKey?: string | null | undefined; ra: boolean; ein: boolean; oa: boolean; expedite: boolean; active: boolean }) {
  await staffActor(userId);
  const row = { name: i.name.trim().slice(0, 200), description: i.description ?? null, service_package_key: i.servicePackageKey ?? null,
    includes_registered_agent: i.ra, includes_ein: i.ein, includes_operating_agreement: i.oa, includes_expedite: i.expedite, active: i.active, updated_at: new Date().toISOString() };
  const q = i.id ? db().from("formation_bundles").update(row).eq("id", i.id) : db().from("formation_bundles").insert({ ...row, created_by: userId });
  const { error } = await q; if (error) throw new Error(error.message);
  return { ok: true };
}
