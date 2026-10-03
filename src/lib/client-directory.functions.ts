import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";
import { DEFAULT_TEAM_PERMISSIONS, type DirectoryRow } from "@/lib/client-directory-model";

const STAFF = ["admin", "super_admin", "operations", "client_success", "executive"];

/** Harmonious client-management staff only; returns the service client after the check. */
async function staffDb(context: any) {
  const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  if (!((roles ?? []) as any[]).some((r) => STAFF.includes(String(r.role)))) throw new Error("Only Harmonious staff can use this directory.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

const low = (e: unknown) => String(e ?? "").trim().toLowerCase();

async function statusFor(db: any, emails: string[]) {
  const active = new Set<string>();
  const verified = new Set<string>();
  if (!emails.length) return { active, verified };
  const { data: persons } = await db.from("persons").select("email, kyc_status, aml_status, user_id").in("email", emails);
  for (const p of (persons ?? []) as any[]) {
    if (p.user_id) active.add(low(p.email));
    if (p.kyc_status === "approved" && p.aml_status === "approved") verified.add(low(p.email));
  }
  const { data: profiles } = await db.from("profiles").select("email").in("email", emails);
  for (const p of (profiles ?? []) as any[]) active.add(low(p.email));
  return { active, verified };
}

export const listFundManagerContactsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await staffDb(context);
    const [{ data: offerings }, { data: clients }, { data: team }, { data: managers }, { data: invites }] = await Promise.all([
      db.from("offerings").select("id, name, client_id").order("name"),
      db.from("clients").select("id, name").order("name"),
      db.from("fund_team_members").select("offering_id, full_name, email, user_id, team_role").is("removed_at", null),
      db.from("fund_managers").select("offering_id, user_id"),
      db.from("fund_invitations").select("email, offering_id, status, invite_role").eq("invite_role", "fund_manager"),
    ]);
    const offeringById = new Map(((offerings ?? []) as any[]).map((o) => [o.id, o]));
    const clientName = new Map(((clients ?? []) as any[]).map((c) => [c.id, c.name]));
    const userIds = [...new Set(((managers ?? []) as any[]).map((m) => m.user_id).filter(Boolean))];
    const profileBy = new Map<string, any>();
    if (userIds.length) {
      const { data: profs } = await db.from("profiles").select("user_id, email, legal_name").in("user_id", userIds);
      for (const p of (profs ?? []) as any[]) profileBy.set(p.user_id, p);
    }
    const rows = new Map<string, DirectoryRow>();
    const add = (email: string, name: string, offeringId: string, role: string) => {
      const key = low(email);
      if (!key) return;
      const o = offeringById.get(offeringId);
      const r = rows.get(key) ?? { key, email: key, name: name || key, companies: [], assignments: [], invite: "not_invited", verified: false, clientIds: [] };
      if (name && r.name === key) r.name = name;
      if (o && !r.assignments.some((a) => a.id === o.id)) r.assignments.push({ id: o.id, name: o.name, role });
      if (o?.client_id) {
        if (!r.clientIds.includes(o.client_id)) r.clientIds.push(o.client_id);
        const cn = clientName.get(o.client_id);
        if (cn && !r.companies.includes(cn)) r.companies.push(cn);
      }
      rows.set(key, r);
    };
    for (const m of (managers ?? []) as any[]) {
      const p = profileBy.get(m.user_id);
      if (p?.email) add(p.email, p.legal_name ?? "", m.offering_id, "Fund manager");
    }
    for (const t of (team ?? []) as any[]) if (t.email) add(t.email, t.full_name ?? "", t.offering_id, String(t.team_role ?? "member"));
    const invited = new Set(((invites ?? []) as any[]).map((i) => low(i.email)));
    const { active, verified } = await statusFor(db, [...rows.keys()]);
    for (const r of rows.values()) {
      r.invite = active.has(r.key) ? "active" : invited.has(r.key) ? "invited" : "not_invited";
      r.verified = verified.has(r.key);
    }
    return {
      rows: [...rows.values()].sort((a, b) => a.name.localeCompare(b.name)),
      targets: ((offerings ?? []) as any[]).map((o) => ({ id: o.id, name: o.name, clientId: o.client_id, clientName: clientName.get(o.client_id) ?? null })),
      clients: (clients ?? []) as { id: string; name: string }[],
    };
  });

export const listFounderContactsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await staffDb(context);
    const [{ data: clients }, { data: companies }, { data: contacts }, { data: holders }] = await Promise.all([
      db.from("clients").select("id, name").order("name"),
      db.from("ct_companies").select("id, name, client_id").order("name"),
      db.from("client_contacts").select("id, client_id, full_name, email, designations, invited_at, status").contains("designations", ["Founder"]),
      db.from("ct_stakeholders").select("company_id, name, email, stakeholder_type, title").eq("stakeholder_type", "founder"),
    ]);
    const clientName = new Map(((clients ?? []) as any[]).map((c) => [c.id, c.name]));
    const companyById = new Map(((companies ?? []) as any[]).map((c) => [c.id, c]));
    const rows = new Map<string, DirectoryRow>();
    const get = (email: string, name: string) => {
      const key = low(email);
      const r = rows.get(key) ?? { key, email: key, name: name || key, companies: [], assignments: [], invite: "not_invited", verified: false, clientIds: [] };
      if (name && r.name === key) r.name = name;
      rows.set(key, r);
      return r;
    };
    const addClient = (r: DirectoryRow, clientId: string | null) => {
      if (!clientId) return;
      if (!r.clientIds.includes(clientId)) r.clientIds.push(clientId);
      const cn = clientName.get(clientId);
      if (cn && !r.companies.includes(cn)) r.companies.push(cn);
    };
    for (const c of (contacts ?? []) as any[]) {
      if (!c.email || c.status === "inactive") continue;
      const r = get(c.email, c.full_name ?? "");
      addClient(r, c.client_id);
      r.contactId = r.contactId ?? c.id;
      if (c.invited_at) r.invite = "invited";
    }
    for (const h of (holders ?? []) as any[]) {
      if (!h.email) continue;
      const co = companyById.get(h.company_id);
      const r = get(h.email, h.name ?? "");
      if (co && !r.assignments.some((a) => a.id === co.id)) r.assignments.push({ id: co.id, name: co.name, role: h.title || "Founder" });
      addClient(r, co?.client_id ?? null);
    }
    const { active, verified } = await statusFor(db, [...rows.keys()]);
    for (const r of rows.values()) {
      if (active.has(r.key)) r.invite = "active";
      r.verified = verified.has(r.key);
    }
    return {
      rows: [...rows.values()].sort((a, b) => a.name.localeCompare(b.name)),
      targets: ((companies ?? []) as any[]).map((c) => ({ id: c.id, name: c.name, clientId: c.client_id, clientName: clientName.get(c.client_id) ?? null })),
      clients: (clients ?? []) as { id: string; name: string }[],
    };
  });

const person = { email: z.string().trim().email().max(255), name: z.string().trim().min(1).max(120) };

/** Adds the person to a fund's Team with default permissions; GP/signatory/banking still need confirmation. */
export const assignContactToFundFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ...person, offeringId: z.string().uuid(), teamRole: z.enum(["manager", "member"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await staffDb(context);
    const email = low(data.email);
    const { data: existing } = await db.from("fund_team_members").select("id").eq("offering_id", data.offeringId).ilike("email", email).is("removed_at", null).maybeSingle();
    if (existing) return { ok: true, already: true };
    const { error } = await db.from("fund_team_members").insert({
      offering_id: data.offeringId, full_name: data.name, email, team_role: data.teamRole,
      permissions: DEFAULT_TEAM_PERMISSIONS, created_by: context.userId, added_as: "harmonious_directory",
    });
    if (error) throw new Error(error.message);
    return { ok: true, already: false };
  });

/** Adds the person to a cap table as a founder (reusing a holder with the same email) and logs it. */
export const assignContactToCapTableFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ...person, companyId: z.string().uuid(), title: z.string().trim().max(120).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await staffDb(context);
    const email = low(data.email);
    const { data: existing } = await db.from("ct_stakeholders").select("id").eq("company_id", data.companyId).ilike("email", email).maybeSingle();
    if (existing) return { ok: true, already: true };
    const { data: row, error } = await db.from("ct_stakeholders").insert({
      company_id: data.companyId, name: data.name, email, stakeholder_type: "founder", title: data.title || "Founder",
    }).select("id").single();
    if (error) throw new Error(error.message);
    await db.from("ct_events").insert({
      company_id: data.companyId, actor_id: context.userId, action: "stakeholder.created", entity_type: "stakeholder",
      entity_id: row.id, new_state: { name: data.name, email, stakeholder_type: "founder" }, reason: "Assigned from Harmonious founder directory",
    });
    return { ok: true, already: false };
  });

/** Finds or creates the client contact for a founder (tagged Founder) so the standard contact invite can be sent. */
export const ensureFounderContactFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ...person, clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await staffDb(context);
    const email = low(data.email);
    const { data: found } = await db.from("client_contacts").select("id, designations").eq("client_id", data.clientId).ilike("email", email).maybeSingle();
    if (found) {
      const tags = (found.designations ?? []) as string[];
      if (!tags.includes("Founder")) await db.from("client_contacts").update({ designations: [...tags, "Founder"] }).eq("id", found.id);
      return { id: found.id as string };
    }
    const { data: row, error } = await db.from("client_contacts").insert({
      client_id: data.clientId, full_name: data.name, email, designations: ["Founder"], created_by: context.userId, status: "active",
    }).select("id").single();
    if (error) throw new Error(error.message);
    await db.from("client_contact_events").insert({ contact_id: row.id, client_id: data.clientId, actor_id: context.userId, event_kind: "created", detail: { source: "founder_directory" } });
    return { id: row.id as string };
  });
