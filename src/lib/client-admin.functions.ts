/**
 * Client 360 administration: editable client, people & roles, funds,
 * applicable services, pricing, SOW preview/generation and templates.
 * Every action is gated server-side by a granular Client capability.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  EDITABLE_CLIENT_FIELDS,
  RELATIONSHIP_ROLE_VALUES,
  diffClient,
  groupServices,
  planFundLink,
  portalFundAccess,
  serviceChangeRequirement,
  sowDisplayStatus,
  effectiveSelectionPrice,
  findApplicableSow,
  type Selection,
} from "@/lib/client-admin-model";

const uuid = z.string().uuid();

/* --------------------------------------------------------- client */

export const getClientAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { clientGate } = await import("@/lib/client-admin.server");
    const { db, caps } = await clientGate(context);
    const { data: client } = await db.from("clients").select("*").eq("id", data.clientId).maybeSingle();
    if (!client) throw new Error("Client not found.");
    const { data: staff } = await (context as any).supabase.rpc("list_staff_accounts");
    return {
      caps,
      client: Object.fromEntries(EDITABLE_CLIENT_FIELDS.map((f) => [f, (client as any)[f] ?? null]).concat([["ein_last4", client.ein_last4 ?? null]])),
      staff: ((staff ?? []) as any[]).map((s) => ({ id: s.user_id ?? s.id, label: s.legal_name || s.email || "Staff" })),
    };
  });

const clientPatch = z.object({
  legal_name: z.string().trim().min(1).max(200).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  dba_name: z.string().trim().max(200).nullable().optional(),
  client_type: z.string().trim().max(80).nullable().optional(),
  entity_type: z.string().trim().max(80).nullable().optional(),
  jurisdiction: z.string().trim().max(80).nullable().optional(),
  address: z.record(z.string(), z.string().max(200)).nullable().optional(),
  website: z.string().trim().max(200).nullable().optional(),
  primary_contact_name: z.string().trim().max(160).nullable().optional(),
  primary_contact_email: z.string().trim().email().max(200).nullable().optional().or(z.literal("")),
  phone: z.string().trim().max(40).nullable().optional(),
  relationship_owner_id: uuid.nullable().optional(),
  referral_source: z.string().trim().max(200).nullable().optional(),
  status: z.enum(["active", "inactive", "prospect", "offboarding", "terminated"]).optional(),
  notes: z.string().max(4000).nullable().optional(),
  billing_contact_name: z.string().trim().max(160).nullable().optional(),
  billing_contact_email: z.string().trim().email().max(200).nullable().optional().or(z.literal("")),
  default_billing_frequency: z.string().trim().max(40).nullable().optional(),
  payment_terms_days: z.number().int().min(0).max(365).nullable().optional(),
});

/** Edit client metadata. Contracts, SOWs, funds and history are never touched. */
export const updateClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: uuid, patch: clientPatch }).parse(d))
  .handler(async ({ data, context }) => {
    const { clientGate, audit } = await import("@/lib/client-admin.server");
    const { db, userId } = await clientGate(context, "edit_client");
    const { data: before } = await db.from("clients").select("*").eq("id", data.clientId).maybeSingle();
    if (!before) throw new Error("Client not found.");
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data.patch)) patch[k] = v === "" ? null : v;
    const changes = diffClient(before, patch);
    if (!changes.length) return { ok: true, changed: 0 };
    const clean = Object.fromEntries(changes.map((c) => [c.field, c.after]));
    const { error } = await db.from("clients").update(clean).eq("id", data.clientId);
    if (error) throw new Error(error.message);
    await audit(db, {
      actor: userId, clientId: data.clientId, action: "client_edited",
      before: Object.fromEntries(changes.map((c) => [c.field, c.before])),
      after: clean,
    });
    return { ok: true, changed: changes.length };
  });

/* --------------------------------------------------------- people */

export const listClientPeople = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { clientGate } = await import("@/lib/client-admin.server");
    const { db, caps } = await clientGate(context);
    const [{ data: people }, { data: scopes }, { data: funds }, { data: companies }] = await Promise.all([
      db.from("client_contacts").select("*").eq("client_id", data.clientId).order("created_at"),
      db.from("client_contact_scopes").select("*").eq("client_id", data.clientId),
      db.from("offerings").select("id, name").eq("client_id", data.clientId),
      db.from("ct_companies").select("id, name").eq("client_id", data.clientId),
    ]);
    const fundIds = ((funds ?? []) as any[]).map((f) => f.id);
    const { data: fm } = fundIds.length
      ? await db.from("fund_managers").select("user_id, offering_id").in("offering_id", fundIds)
      : { data: [] };
    return {
      caps,
      funds: funds ?? [],
      companies: companies ?? [],
      people: ((people ?? []) as any[]).map((p) => ({
        id: p.id,
        fullName: p.full_name,
        email: p.email,
        phone: p.phone,
        title: p.title,
        roles: (p.designations ?? []) as string[],
        notes: p.notes,
        status: p.status ?? "active",
        userId: p.user_id,
        scopes: ((scopes ?? []) as any[]).filter((s) => s.contact_id === p.id).map((s) => ({ id: s.id, offeringId: s.offering_id, companyId: s.company_id, role: s.role })),
        // Real portal access, from the existing authorization model only.
        portalFunds: portalFundAccess(p.user_id, (fm ?? []) as any[]),
      })),
    };
  });

const personInput = z.object({
  clientId: uuid,
  id: uuid.optional(),
  fullName: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  title: z.string().trim().max(120).optional().or(z.literal("")),
  roles: z.array(z.enum(RELATIONSHIP_ROLE_VALUES)).max(15),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

/** Add or edit a person. Roles are descriptive and grant no application authority. */
export const saveClientPerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => personInput.parse(d))
  .handler(async ({ data, context }) => {
    const { clientGate, audit } = await import("@/lib/client-admin.server");
    const { db, caps, userId } = await clientGate(context, "manage_people");
    const row = {
      client_id: data.clientId,
      full_name: data.fullName,
      email: data.email ? data.email.toLowerCase() : null,
      phone: data.phone || null,
      title: data.title || null,
      notes: data.notes || null,
      designations: [...new Set(data.roles)],
    };
    if (data.id) {
      const { data: before } = await db.from("client_contacts").select("*").eq("id", data.id).maybeSingle();
      if (!before || before.client_id !== data.clientId) throw new Error("That person is not on this client.");
      const rolesChanged = JSON.stringify([...(before.designations ?? [])].sort()) !== JSON.stringify([...row.designations].sort());
      if (rolesChanged && !caps.includes("manage_roles")) throw new Error('Forbidden: this needs the "manage_roles" permission.');
      const { error } = await db.from("client_contacts").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      await audit(db, { actor: userId, clientId: data.clientId, action: rolesChanged ? "person_roles_changed" : "person_edited", target: data.id, before: { name: before.full_name, email: before.email, roles: before.designations }, after: { name: row.full_name, email: row.email, roles: row.designations } });
      await syncPrimary(db, data.clientId, data.id, row);
      return { id: data.id };
    }
    if (row.designations.length && !caps.includes("manage_roles")) throw new Error('Forbidden: this needs the "manage_roles" permission.');
    const { data: ins, error } = await db.from("client_contacts").insert({ ...row, created_by: userId }).select("id").single();
    if (error) throw new Error(error.message);
    await audit(db, { actor: userId, clientId: data.clientId, action: "person_added", target: ins.id, after: { name: row.full_name, email: row.email, roles: row.designations } });
    await syncPrimary(db, data.clientId, ins.id, row);
    return { id: ins.id as string };
  });

async function syncPrimary(db: any, clientId: string, _id: string, row: any) {
  const patch: Record<string, unknown> = {};
  if (row.designations.includes("primary")) Object.assign(patch, { primary_contact_name: row.full_name, primary_contact_email: row.email });
  if (row.designations.includes("billing")) Object.assign(patch, { billing_contact_name: row.full_name, billing_contact_email: row.email });
  if (Object.keys(patch).length) await db.from("clients").update(patch).eq("id", clientId);
}

/** Deactivate or restore a relationship. Nothing is deleted. */
export const setClientPersonStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: uuid, id: uuid, active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { clientGate, audit } = await import("@/lib/client-admin.server");
    const { db, userId } = await clientGate(context, "manage_people");
    const { data: p } = await db.from("client_contacts").select("client_id, status").eq("id", data.id).maybeSingle();
    if (!p || p.client_id !== data.clientId) throw new Error("That person is not on this client.");
    await db.from("client_contacts").update(data.active ? { status: "active", deactivated_at: null, deactivated_by: null } : { status: "inactive", deactivated_at: new Date().toISOString(), deactivated_by: userId }).eq("id", data.id);
    await audit(db, { actor: userId, clientId: data.clientId, action: data.active ? "person_reactivated" : "person_deactivated", target: data.id, before: { status: p.status }, after: { status: data.active ? "active" : "inactive" } });
    return { ok: true };
  });

/** Associate a person with one fund or company. Descriptive only — portal access is unchanged. */
export const setClientPersonScope = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ clientId: uuid, contactId: uuid, offeringId: uuid.nullable().optional(), companyId: uuid.nullable().optional(), role: z.enum(RELATIONSHIP_ROLE_VALUES), add: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { clientGate, audit, assertOffering } = await import("@/lib/client-admin.server");
    const { db, userId } = await clientGate(context, "manage_roles");
    if (!!data.offeringId === !!data.companyId) throw new Error("Choose exactly one fund or company.");
    const { data: p } = await db.from("client_contacts").select("client_id").eq("id", data.contactId).maybeSingle();
    if (!p || p.client_id !== data.clientId) throw new Error("That person is not on this client.");
    if (data.offeringId) await assertOffering(db, data.clientId, data.offeringId);
    if (data.companyId) {
      const { data: c } = await db.from("ct_companies").select("client_id").eq("id", data.companyId).maybeSingle();
      if (!c || c.client_id !== data.clientId) throw new Error("That company does not belong to this client.");
    }
    if (data.add) {
      const { error } = await db.from("client_contact_scopes").insert({ contact_id: data.contactId, client_id: data.clientId, offering_id: data.offeringId ?? null, company_id: data.companyId ?? null, role: data.role, created_by: userId });
      if (error && !/duplicate/i.test(error.message)) throw new Error(error.message);
    } else {
      let q = db.from("client_contact_scopes").delete().eq("contact_id", data.contactId).eq("role", data.role);
      q = data.offeringId ? q.eq("offering_id", data.offeringId) : q.eq("company_id", data.companyId);
      await q;
    }
    await audit(db, { actor: userId, clientId: data.clientId, offeringId: data.offeringId ?? null, action: data.add ? (data.role === "fund_manager" ? "fund_manager_assigned" : "person_scope_added") : "person_scope_removed", target: data.contactId, after: { role: data.role, offeringId: data.offeringId, companyId: data.companyId } });
    return { ok: true };
  });

/* --------------------------------------------------------- funds */

export const listClientFunds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { clientGate, loadContractTerms } = await import("@/lib/client-admin.server");
    const { db, caps } = await clientGate(context);
    const [{ data: funds }, { data: sows }, { data: sels }, { data: scopes }, { data: people }, { data: drive }, { data: reassign }, terms] = await Promise.all([
      db.from("offerings").select("id, name, fund_type, entity_type, reg_type, is_open, legal_entity_name").eq("client_id", data.clientId),
      db.from("client_sows").select("id, client_id, offering_id, status, executed_at, locked, client_status, approval_status, amends_sow_id, template_version, review_blockers, generated_automatically").eq("client_id", data.clientId),
      db.from("client_service_selections").select("*").eq("client_id", data.clientId).not("status", "in", "(removed,terminated)"),
      db.from("client_contact_scopes").select("contact_id, offering_id, role").eq("client_id", data.clientId),
      db.from("client_contacts").select("id, full_name").eq("client_id", data.clientId),
      db.from("drive_folder_mappings").select("offering_id, status, investment_profile_id").is("investment_profile_id", null),
      db.from("fund_client_reassignments").select("*").or(`from_client_id.eq.${data.clientId},to_client_id.eq.${data.clientId}`).order("requested_at", { ascending: false }),
      loadContractTerms(db, data.clientId),
    ]);
    const names = new Map(((people ?? []) as any[]).map((p) => [p.id, p.full_name]));
    return {
      caps,
      msaStatus: terms.governing ? `Approved — ${terms.governing.title}` : "No approved MSA on file",
      reassignments: reassign ?? [],
      funds: ((funds ?? []) as any[]).map((f) => {
        const app = findApplicableSow((sows ?? []) as any[], data.clientId, f.id);
        const current = app.executed ?? app.draft;
        const fs = ((sels ?? []) as any[]).filter((s) => s.offering_id === f.id);
        const lines = (current as any)?.generated_lines ?? [];
        return {
          id: f.id,
          name: f.name,
          type: f.fund_type ?? f.entity_type ?? "—",
          managers: ((scopes ?? []) as any[]).filter((s) => s.offering_id === f.id && s.role === "fund_manager").map((s) => names.get(s.contact_id) ?? "—"),
          setupStatus: f.is_open ? "Open" : "In setup",
          services: fs.map((s) => ({ key: s.service_key, status: s.status })),
          sowStatus: sowDisplayStatus(current as any),
          sowVersion: (current as any)?.template_version ?? null,
          pricingSources: [...new Set((lines as any[]).map((l) => l.pricingSource).filter(Boolean))],
          driveStatus: ((drive ?? []) as any[]).find((d) => d.offering_id === f.id)?.status ?? "not created",
          contractuallyEngaged: !!app.executed,
        };
      }),
    };
  });

export const searchFundsToLink = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: uuid, q: z.string().trim().max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    const { clientGate } = await import("@/lib/client-admin.server");
    const { db } = await clientGate(context, "link_funds");
    let q = db.from("offerings").select("id, name, client_id, is_open, fund_type").order("name").limit(20);
    if (data.q) q = q.ilike("name", `%${data.q.replace(/[%_]/g, "")}%`);
    const { data: funds } = await q;
    const ids = ((funds ?? []) as any[]).map((f) => f.id);
    const clientIds = [...new Set(((funds ?? []) as any[]).map((f) => f.client_id).filter(Boolean))];
    const [{ data: clients }, { data: sows }, { data: fm }] = await Promise.all([
      clientIds.length ? db.from("clients").select("id, name").in("id", clientIds) : { data: [] },
      ids.length ? db.from("client_sows").select("offering_id, status, executed_at").in("offering_id", ids) : { data: [] },
      ids.length ? db.from("fund_managers").select("offering_id").in("offering_id", ids) : { data: [] },
    ]);
    const cname = new Map(((clients ?? []) as any[]).map((c) => [c.id, c.name]));
    return ((funds ?? []) as any[]).map((f) => ({
      id: f.id,
      name: f.name,
      currentClient: f.client_id ? cname.get(f.client_id) ?? "Another client" : null,
      sameClient: f.client_id === data.clientId,
      status: f.is_open ? "Open" : "In setup",
      managerCount: ((fm ?? []) as any[]).filter((m) => m.offering_id === f.id).length,
      sow: ((sows ?? []) as any[]).some((s) => s.offering_id === f.id && s.executed_at) ? "Executed SOW" : ((sows ?? []) as any[]).some((s) => s.offering_id === f.id) ? "Draft SOW" : "No SOW",
      plan: planFundLink(f, data.clientId).kind,
    }));
  });

const createFundInput = z.object({
  clientId: uuid,
  name: z.string().trim().min(2).max(160),
  fundType: z.string().trim().max(80).optional().or(z.literal("")),
  entityType: z.string().trim().max(80).optional().or(z.literal("")),
  legalEntityName: z.string().trim().max(200).optional().or(z.literal("")),
  jurisdiction: z.string().trim().max(80).optional().or(z.literal("")),
  regType: z.enum(["506b", "506c", "regcf", "rega", "regaplus"]).default("506b"),
  serviceKeys: z.array(z.string().max(80)).max(80).default([]),
});

/**
 * Create a fund pre-associated with the client. It exists, but Harmonious is not
 * contractually engaged until an SOW is executed. Setup stays incomplete.
 */
export const createClientFund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createFundInput.parse(d))
  .handler(async ({ data, context }) => {
    const { clientGate, audit, ensureDraftSow } = await import("@/lib/client-admin.server");
    const { db, caps, userId } = await clientGate(context, "link_funds");
    const { data: client } = await db.from("clients").select("id").eq("id", data.clientId).maybeSingle();
    if (!client) throw new Error("Client not found.");
    const base = data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "fund";
    let slug = base;
    for (let i = 2; i < 40; i += 1) {
      const { data: clash } = await db.from("offerings").select("id").eq("slug", slug).maybeSingle();
      if (!clash) break;
      slug = `${base}-${i}`;
    }
    const { seedFundFeeColumns } = await import("@/lib/fee-rates.server");
    const fees = await seedFundFeeColumns(db, data.clientId);
    const { data: ins, error } = await db
      .from("offerings")
      .insert({
        ...fees,
        client_id: data.clientId,
        name: data.name,
        slug,
        fund_type: data.fundType || null,
        entity_type: data.entityType || null,
        legal_entity_name: data.legalEntityName || null,
        state_formed: data.jurisdiction || null,
        reg_type: data.regType,
        is_open: false,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const offeringId = ins.id as string;
    await audit(db, { actor: userId, clientId: data.clientId, offeringId, action: "fund_created_from_client_360", after: { name: data.name, fundType: data.fundType, regType: data.regType } });
    if (data.serviceKeys.length && caps.includes("manage_services")) {
      await addSelections(db, userId, data.clientId, offeringId, data.serviceKeys);
    }
    const sow = caps.includes("manage_sows")
      ? await ensureDraftSow(db, userId, data.clientId, offeringId, { trigger: "fund_created" })
      : null;
    return { offeringId, sowOutcome: sow?.outcome ?? "not_permitted" };
  });

/** Link an unassigned fund, or open a reviewed reassignment — never a silent move. */
export const linkFundToClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: uuid, offeringId: uuid, reason: z.string().trim().max(1000).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { clientGate, audit, ensureDraftSow } = await import("@/lib/client-admin.server");
    const { db, caps, userId } = await clientGate(context, "link_funds");
    const { data: fund } = await db.from("offerings").select("id, client_id, name").eq("id", data.offeringId).maybeSingle();
    if (!fund) throw new Error("Fund not found.");
    const plan = planFundLink(fund, data.clientId);
    if (plan.kind === "already_linked") return { outcome: "already_linked" as const };
    if (plan.kind === "reassignment_required") {
      if (!data.reason || data.reason.length < 10) throw new Error("This fund belongs to another client. Give a reason (at least 10 characters) to request a reviewed reassignment.");
      const { error } = await db.from("fund_client_reassignments").insert({ offering_id: fund.id, from_client_id: plan.fromClientId, to_client_id: data.clientId, reason: data.reason, requested_by: userId });
      if (error) throw new Error(/duplicate/i.test(error.message) ? "A reassignment for this fund is already waiting for review." : error.message);
      await audit(db, { actor: userId, clientId: data.clientId, offeringId: fund.id, action: "fund_reassignment_requested", before: { client_id: plan.fromClientId }, after: { client_id: data.clientId }, reason: data.reason });
      return { outcome: "reassignment_requested" as const };
    }
    const { error } = await db.from("offerings").update({ client_id: data.clientId }).eq("id", fund.id).is("client_id", null);
    if (error) throw new Error(error.message);
    await audit(db, { actor: userId, clientId: data.clientId, offeringId: fund.id, action: "fund_linked", before: { client_id: null }, after: { client_id: data.clientId } });
    const sow = caps.includes("manage_sows") ? await ensureDraftSow(db, userId, data.clientId, fund.id, { trigger: "fund_linked" }) : null;
    return { outcome: "linked" as const, sowOutcome: sow?.outcome ?? "not_permitted" };
  });

/** A different person approves or rejects a reassignment. */
export const decideFundReassignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, approve: z.boolean(), note: z.string().trim().max(1000).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { clientGate, audit } = await import("@/lib/client-admin.server");
    const { db, userId } = await clientGate(context, "link_funds");
    const { data: r } = await db.from("fund_client_reassignments").select("*").eq("id", data.id).maybeSingle();
    if (!r || r.status !== "pending") throw new Error("That reassignment is not waiting for review.");
    if (r.requested_by === userId) throw new Error("Someone other than the requester must review this reassignment.");
    if (data.approve) {
      const { error } = await db.from("offerings").update({ client_id: r.to_client_id }).eq("id", r.offering_id).eq("client_id", r.from_client_id);
      if (error) throw new Error(error.message);
    }
    await db.from("fund_client_reassignments").update({ status: data.approve ? "approved" : "rejected", reviewed_by: userId, reviewed_at: new Date().toISOString(), review_note: data.note ?? null }).eq("id", r.id);
    await audit(db, { actor: userId, clientId: r.to_client_id, offeringId: r.offering_id, action: data.approve ? "fund_reassigned" : "fund_reassignment_rejected", before: { client_id: r.from_client_id }, after: { client_id: data.approve ? r.to_client_id : r.from_client_id }, reason: data.note ?? r.reason });
    return { ok: true };
  });

/* --------------------------------------------------------- services & pricing */

async function addSelections(db: any, userId: string, clientId: string, offeringId: string | null, keys: string[]) {
  const { data: cat } = await db.from("service_catalog").select("id, key, active, status").in("key", keys);
  const ok = ((cat ?? []) as any[]).filter((c) => c.active !== false && (c.status ?? "active") === "active");
  if (ok.length !== new Set(keys).size) throw new Error("Only approved, active catalog services can be selected.");
  const { data: sows } = await db.from("client_sows").select("id, client_id, offering_id, status, executed_at, amends_sow_id, locked").eq("client_id", clientId);
  const executed = findApplicableSow((sows ?? []) as any[], clientId, offeringId).executed;
  const change = serviceChangeRequirement(executed as any);
  for (const c of ok) {
    const { error } = await db.from("client_service_selections").insert({
      client_id: clientId, offering_id: offeringId, service_key: c.key, service_id: c.id,
      status: "proposed", pending_change: change === "amendment" ? "add" : null, created_by: userId,
    });
    if (error && !/duplicate/i.test(error.message)) throw new Error(error.message);
  }
  await db.from("clients").select("id").eq("id", clientId);
  return change;
}

export const getServicesPricing = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { clientGate, loadCatalog, loadPricingInputs, priceSelections } = await import("@/lib/client-admin.server");
    const { db, caps } = await clientGate(context);
    const [catalog, inputs, { data: groups }, { data: sels }, { data: funds }, { data: sows }] = await Promise.all([
      loadCatalog(db),
      loadPricingInputs(db, data.clientId),
      db.from("service_groups").select("*"),
      db.from("client_service_selections").select("*").eq("client_id", data.clientId).not("status", "in", "(removed,terminated)"),
      db.from("offerings").select("id, name").eq("client_id", data.clientId),
      db.from("client_sows").select("id, client_id, offering_id, status, executed_at, locked, client_status, approval_status, amends_sow_id, template_version, review_blockers").eq("client_id", data.clientId),
    ]);
    const prices = priceSelections((sels ?? []) as Selection[], catalog, inputs);
    const bySvc = new Map(catalog.map((c) => [c.key, c]));
    const fundName = new Map(((funds ?? []) as any[]).map((f) => [f.id, f.name]));
    return {
      caps,
      funds: funds ?? [],
      groups: groupServices(catalog, (groups ?? []) as any[]).map((g) => ({ key: g.key, label: g.label, services: g.services.map((s) => ({ key: s.key, name: s.name, description: s.description ?? s.standard_scope ?? null })) })),
      selections: ((sels ?? []) as any[]).map((s) => {
        const svc = bySvc.get(s.service_key);
        const r = prices[s.id]!;
        const eff = effectiveSelectionPrice(r, s);
        const scope = findApplicableSow((sows ?? []) as any[], data.clientId, s.offering_id);
        const sow = s.contracted_sow_id ? { id: s.contracted_sow_id } : scope.executed ?? scope.draft;
        return {
          id: s.id,
          serviceKey: s.service_key,
          serviceName: svc?.name ?? s.service_key,
          group: svc?.service_group ?? "custom",
          offeringId: s.offering_id,
          scopeLabel: s.offering_id ? fundName.get(s.offering_id) ?? "Fund" : "Client-wide",
          status: s.status,
          pendingChange: s.pending_change,
          pricingModel: r.status === "resolved" ? r.pricingModel ?? svc?.default_pricing_model ?? null : svc?.default_pricing_model ?? null,
          frequency: svc?.billing_frequency ?? null,
          cents: s.contracted_snapshot ? (s.contracted_snapshot as any).cents : eff.cents,
          source: s.contracted_snapshot ? (s.contracted_snapshot as any).pricingSource : eff.source,
          priceStatus: r.status,
          customPending: eff.customPending,
          override: s.custom_price_cents != null ? { cents: s.custom_price_cents, original: s.override_original_cents, reason: s.override_reason, status: s.override_status, by: s.override_by } : null,
          sowId: (sow as any)?.id ?? null,
          sowStatus: sowDisplayStatus((scope.executed ?? scope.draft) as any),
        };
      }),
    };
  });

export const setServiceSelections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ clientId: uuid, offeringId: uuid.nullable(), add: z.array(z.string().max(80)).max(80).default([]), remove: z.array(uuid).max(80).default([]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { clientGate, audit, assertOffering } = await import("@/lib/client-admin.server");
    const { db, userId } = await clientGate(context, "manage_services");
    await assertOffering(db, data.clientId, data.offeringId);
    let change: string | null = null;
    if (data.add.length) change = await addSelections(db, userId, data.clientId, data.offeringId, data.add);
    for (const id of data.remove) {
      const { data: s } = await db.from("client_service_selections").select("*").eq("id", id).maybeSingle();
      if (!s || s.client_id !== data.clientId) throw new Error("That service is not on this client.");
      if (s.status === "proposed") {
        await db.from("client_service_selections").update({ status: "removed" }).eq("id", id);
      } else {
        // Contracted scope stays until an amendment is executed.
        await db.from("client_service_selections").update({ pending_change: "remove" }).eq("id", id);
      }
    }
    await audit(db, { actor: userId, clientId: data.clientId, offeringId: data.offeringId, action: "services_changed", after: { added: data.add, removed: data.remove, requires: change } });
    return { ok: true, requires: change };
  });

/** Custom price for one selection only; global pricing is never changed. Needs a second approver. */
export const overrideServicePrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: uuid, selectionId: uuid, cents: z.number().int().min(0).max(1_000_000_000), reason: z.string().trim().min(5).max(1000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { clientGate, audit, loadCatalog, loadPricingInputs, priceSelections } = await import("@/lib/client-admin.server");
    const { db, userId } = await clientGate(context, "manage_pricing");
    const { data: s } = await db.from("client_service_selections").select("*").eq("id", data.selectionId).maybeSingle();
    if (!s || s.client_id !== data.clientId) throw new Error("That service is not on this client.");
    if (s.status !== "proposed") throw new Error("Contracted pricing can only change through an amendment.");
    const [catalog, inputs] = await Promise.all([loadCatalog(db), loadPricingInputs(db, data.clientId)]);
    const r = priceSelections([s], catalog, inputs)[s.id]!;
    const original = r.status === "resolved" ? r.cents : null;
    await db.from("client_service_selections").update({
      custom_price_cents: data.cents, override_original_cents: original, override_reason: data.reason,
      override_by: userId, override_at: new Date().toISOString(), override_status: "pending_approval",
      override_approved_by: null, override_approved_at: null,
    }).eq("id", s.id);
    await audit(db, { actor: userId, clientId: data.clientId, offeringId: s.offering_id, action: "pricing_override_proposed", target: s.id, before: { cents: original, source: r.status === "resolved" ? r.source : null }, after: { cents: data.cents }, reason: data.reason });
    return { ok: true };
  });

export const decideServicePrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: uuid, selectionId: uuid, approve: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { clientGate, audit } = await import("@/lib/client-admin.server");
    const { db, userId } = await clientGate(context, "manage_pricing");
    const { data: s } = await db.from("client_service_selections").select("*").eq("id", data.selectionId).maybeSingle();
    if (!s || s.client_id !== data.clientId || s.override_status !== "pending_approval") throw new Error("No custom price is waiting for approval.");
    if (s.override_by === userId) throw new Error("Someone other than the person who proposed it must approve custom pricing.");
    await db.from("client_service_selections").update({ override_status: data.approve ? "approved" : "rejected", override_approved_by: data.approve ? userId : null, override_approved_at: new Date().toISOString() }).eq("id", s.id);
    await audit(db, { actor: userId, clientId: data.clientId, offeringId: s.offering_id, action: data.approve ? "pricing_override_approved" : "pricing_override_rejected", target: s.id, after: { cents: s.custom_price_cents } });
    return { ok: true };
  });

/* --------------------------------------------------------- SOW */

export const previewClientSow = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: uuid, offeringId: uuid.nullable(), templateId: uuid.nullable().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { clientGate, buildPreview } = await import("@/lib/client-admin.server");
    const { db } = await clientGate(context);
    return buildPreview(db, data.clientId, data.offeringId, { templateId: data.templateId ?? null });
  });

export const generateClientSow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ clientId: uuid, offeringId: uuid.nullable(), templateId: uuid.nullable().optional(), overrideReason: z.string().trim().max(1000).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { clientGate, ensureDraftSow } = await import("@/lib/client-admin.server");
    const { db, userId } = await clientGate(context, "manage_sows");
    if (data.templateId && (!data.overrideReason || data.overrideReason.length < 5)) throw new Error("Give a reason for choosing a different template.");
    const r = await ensureDraftSow(db, userId, data.clientId, data.offeringId, { templateId: data.templateId ?? null, overrideReason: data.overrideReason ?? null, trigger: "manual" });
    return { outcome: r.outcome, sowId: r.sowId, blockers: r.preview.blockers };
  });

/* --------------------------------------------------------- templates */

export const listSowTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { clientGate } = await import("@/lib/client-admin.server");
    const { db, caps, userId } = await clientGate(context);
    const { data } = await db.from("sow_templates").select("*").order("engagement_type").order("version", { ascending: false });
    return { caps, me: userId, templates: data ?? [] };
  });

export const saveSowTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      name: z.string().trim().min(2).max(160),
      engagementType: z.enum(["fund_administration", "spv_administration", "client_services"]),
      version: z.number().int().min(1).max(999),
      effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      body: z.string().max(100_000).optional(),
      sourceDocumentPath: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { clientGate, audit } = await import("@/lib/client-admin.server");
    const { db, userId } = await clientGate(context, "manage_sows");
    const { data: ins, error } = await db.from("sow_templates").insert({ name: data.name, engagement_type: data.engagementType, version: data.version, effective_date: data.effectiveDate, body: data.body ?? null, source_document_path: data.sourceDocumentPath ?? null, status: "draft", created_by: userId }).select("id").single();
    if (error) throw new Error(/duplicate/i.test(error.message) ? "That version already exists for this engagement type." : error.message);
    await audit(db, { actor: userId, clientId: null, action: "sow_template_drafted", target: ins.id, after: data });
    return { id: ins.id as string };
  });

export const setSowTemplateStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, status: z.enum(["approved", "retired"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { clientGate, audit } = await import("@/lib/client-admin.server");
    const { db, userId } = await clientGate(context, "approve_terms");
    const { data: t } = await db.from("sow_templates").select("*").eq("id", data.id).maybeSingle();
    if (!t) throw new Error("Template not found.");
    if (data.status === "approved") {
      if (t.status !== "draft") throw new Error("Only a draft template can be approved.");
      if (t.created_by === userId) throw new Error("Someone other than the person who drafted it must approve the template.");
    }
    const patch = data.status === "approved" ? { status: "approved", approved_by: userId, approved_at: new Date().toISOString() } : { status: "retired", retired_at: new Date().toISOString() };
    const { error } = await db.from("sow_templates").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(db, { actor: userId, clientId: null, action: `sow_template_${data.status}`, target: data.id, before: { status: t.status }, after: patch });
    return { ok: true };
  });
