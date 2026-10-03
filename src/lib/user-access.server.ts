/**
 * Revoke / archive / restore people, cancel invites, and Test & Demo marking. Server-only.
 * Only Super Admin and Operations leads may act; every action appends user_access_events.
 * Nothing is hard-deleted: global blocks use an auth ban (restorable); scoped client revokes
 * move the membership row into user_access_states.membership_snapshot and restore re-inserts it;
 * fund revokes set fund_team_members.removed_at.
 */
const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;

export const ACCESS_MANAGERS = ["super_admin", "executive", "admin", "operations"];
const STAFF = ["leadership", "super_admin", "super_administrator", "executive", "admin", "operations", "finance", "tax", "compliance", "legal",
  "fund_administration", "client_success", "sales_management", "cro", "account_executive", "bdr", "account_manager",
  "marketing_manager", "marketing_specialist", "operations_administrator", "access_administrator", "staff_administrator"];
const BAN = "876000h"; // ~100 years; lifted on restore

async function rolesOf(db: any, uid: string) {
  const { data } = await db.from("user_roles").select("role").eq("user_id", uid);
  return ((data ?? []) as any[]).map((r) => String(r.role));
}
export async function requireAccessManager(uid: string) {
  const db = await admin();
  const r = await rolesOf(db, uid);
  if (!r.some((x) => ACCESS_MANAGERS.includes(x))) throw new Error("Only Super Admin and Operations leads can manage access.");
  return db;
}
/** Reads: access managers plus the view-only Leadership role. */
export async function requireAccessViewer(uid: string) {
  const db = await admin();
  const r = await rolesOf(db, uid);
  if (!r.some((x) => ACCESS_MANAGERS.includes(x) || x === "leadership")) throw new Error("Only leadership and Operations leads can view access.");
  return db;
}
async function log(db: any, e: { subject_kind: string; subject_id: string; action: string; scope?: string | null; scope_id?: string | null; reason?: string | null; actor_id: string }) {
  await db.from("user_access_events").insert(e);
}

async function allAuthUsers(db: any) {
  const out: any[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    out.push(...(data?.users ?? []));
    if ((data?.users ?? []).length < 1000) break;
  }
  return out;
}

/** Resolve a user id from id or email. */
async function resolveUser(db: any, d: { userId?: string | null | undefined; email?: string | null | undefined }) {
  if (d.userId) return d.userId;
  if (!d.email) return null;
  const { data } = await db.from("profiles").select("user_id").ilike("email", d.email).limit(1).maybeSingle();
  return (data?.user_id as string) ?? null;
}

/** Second check used by the server-side portal gate. */
export async function isGloballyBlocked(uid: string) {
  const db = await admin();
  const { data } = await db.from("user_access_states").select("id").eq("user_id", uid).eq("scope", "global").is("lifted_at", null).limit(1);
  return (data ?? []).length > 0;
}

/* ---------- Directory ---------- */
export type PersonType = "Employee" | "Fund Manager" | "Founder" | "Client contact" | "Investor" | "User";
export async function directory(viewer: string) {
  const db = await requireAccessViewer(viewer);
  const [users, roles, cu, ftm, contacts, profiles, states, persons, si, ci, fi] = await Promise.all([
    allAuthUsers(db),
    db.from("user_roles").select("user_id, role").limit(50000),
    db.from("client_users").select("user_id, client_id").limit(50000),
    db.from("fund_team_members").select("user_id, offering_id").is("removed_at", null).not("user_id", "is", null).limit(50000),
    db.from("client_contacts").select("user_id, email, designations").limit(50000),
    db.from("profiles").select("user_id, legal_name, email, is_test_demo").limit(50000),
    db.from("user_access_states").select("*").is("lifted_at", null).limit(50000),
    db.from("persons").select("user_id").not("user_id", "is", null).limit(50000),
    db.from("staff_invitations").select("id, email, invited_name, invited_by, status, created_at, is_test_demo").eq("status", "pending").limit(5000),
    db.from("client_invitations").select("id, email, invited_name, invited_by, status, created_at, invite_sent_at, client_id, is_test_demo").eq("status", "pending").limit(5000),
    db.from("fund_invitations").select("id, email, invited_name, invited_by, status, created_at, last_sent_at, offering_id, invite_role, is_test_demo").eq("status", "pending").is("accepted_at", null).limit(5000),
  ]);
  const by = <T,>(rows: any[], k: string) => { const m = new Map<string, T[]>(); for (const r of rows ?? []) if (r[k]) m.set(r[k], [...(m.get(r[k]) ?? []), r]); return m; };
  const R = by<any>(roles.data, "user_id"), CU = by<any>(cu.data, "user_id"), F = by<any>(ftm.data, "user_id"), C = by<any>(contacts.data, "user_id"), S = by<any>(states.data, "user_id");
  const P = new Map(((profiles.data ?? []) as any[]).map((p) => [p.user_id, p]));
  const investorUsers = new Set(((persons.data ?? []) as any[]).map((p) => p.user_id));
  const people = users.map((u: any) => {
    const r = (R.get(u.id) ?? []).map((x: any) => String(x.role));
    const isFounder = (C.get(u.id) ?? []).some((c: any) => (c.designations ?? []).some((d: string) => /founder/i.test(d)));
    const types: PersonType[] = [];
    if (r.some((x) => STAFF.includes(x))) types.push("Employee");
    if (F.get(u.id)?.length || r.includes("fund_manager")) types.push("Fund Manager");
    if (isFounder) types.push("Founder");
    if (CU.get(u.id)?.length) types.push("Client contact");
    if (investorUsers.has(u.id) || r.includes("investor")) types.push("Investor");
    const st = (S.get(u.id) ?? []) as any[];
    const global = st.find((s) => s.scope === "global");
    const p = P.get(u.id);
    return {
      kind: "user" as const, id: u.id, email: u.email ?? p?.email ?? "", name: p?.legal_name || u.user_metadata?.full_name || "",
      types: types.length ? types : ["User" as PersonType], lastSignIn: u.last_sign_in_at ?? null, createdAt: u.created_at,
      status: global ? (global.state as "revoked" | "archived") : "active" as const,
      scopedRevokes: st.filter((s) => s.scope !== "global").map((s) => ({ id: s.id, scope: s.scope, scopeId: s.scope_id, reason: s.reason })),
      isTestDemo: !!p?.is_test_demo, isSelf: u.id === viewer,
    };
  });
  const names = new Map(((profiles.data ?? []) as any[]).map((p) => [p.user_id, p.legal_name || p.email]));
  const invites = [
    ...((si.data ?? []) as any[]).map((i) => ({ table: "staff_invitations", id: i.id, email: i.email, name: i.invited_name, type: "Employee", invitedBy: names.get(i.invited_by) ?? "", sentAt: i.created_at, lastSent: i.created_at, isTestDemo: i.is_test_demo })),
    ...((ci.data ?? []) as any[]).map((i) => ({ table: "client_invitations", id: i.id, email: i.email, name: i.invited_name, type: "Client contact", invitedBy: names.get(i.invited_by) ?? "", sentAt: i.created_at, lastSent: i.invite_sent_at ?? i.created_at, isTestDemo: i.is_test_demo })),
    ...((fi.data ?? []) as any[]).map((i) => ({ table: "fund_invitations", id: i.id, email: i.email, name: i.invited_name, type: String(i.invite_role ?? i.role ?? "").includes("investor") ? "Investor" : "Fund Manager", invitedBy: names.get(i.invited_by) ?? "", sentAt: i.created_at, lastSent: i.last_sent_at ?? i.created_at, isTestDemo: i.is_test_demo })),
  ];
  const { data: clients } = await db.from("clients").select("id, name, status, is_test_demo").order("name");
  const canManage = (await rolesOf(db, viewer)).some((x) => ACCESS_MANAGERS.includes(x));
  return {canManage,  people, invites, clients: clients ?? [] };
}

/** Quick status lookup for list pages (by emails). */
export async function statusByEmail(viewer: string, emails: string[]) {
  const db = await requireAccessViewer(viewer);
  const list = [...new Set(emails.filter(Boolean).map((e) => e.toLowerCase()))].slice(0, 2000);
  if (!list.length) return {};
  const { data: profs } = await db.from("profiles").select("user_id, email, is_test_demo").in("email", list);
  const ids = ((profs ?? []) as any[]).map((p) => p.user_id);
  const { data: st } = ids.length ? await db.from("user_access_states").select("user_id, state, scope").is("lifted_at", null).in("user_id", ids) : { data: [] };
  const out: Record<string, { userId: string; status: string; isTestDemo: boolean; scoped: number }> = {};
  for (const p of (profs ?? []) as any[]) {
    const mine = ((st ?? []) as any[]).filter((s) => s.user_id === p.user_id);
    const g = mine.find((s) => s.scope === "global");
    out[String(p.email).toLowerCase()] = { userId: p.user_id, status: g ? g.state : "active", isTestDemo: !!p.is_test_demo, scoped: mine.length - (g ? 1 : 0) };
  }
  return out;
}

/* ---------- Actions ---------- */
async function guardTarget(db: any, viewer: string, target: string) {
  if (target === viewer) throw new Error("You can't revoke or archive your own account.");
  const r = await rolesOf(db, target);
  if (r.includes("super_admin")) {
    const { data } = await db.from("user_roles").select("user_id").eq("role", "super_admin");
    const ids = ((data ?? []) as any[]).map((x) => x.user_id);
    const { data: blocked } = await db.from("user_access_states").select("user_id").eq("scope", "global").is("lifted_at", null).in("user_id", ids);
    const activeLeft = ids.filter((id: string) => id !== target && !((blocked ?? []) as any[]).some((b) => b.user_id === id));
    if (!activeLeft.length) throw new Error("This is the last active Super Admin and can't be blocked.");
  }
}

export async function revoke(viewer: string, d: { userId?: string | null | undefined; email?: string | null | undefined; scope: "global" | "client" | "offering"; scopeId?: string | null | undefined; reason: string; archive?: boolean | undefined }) {
  const db = await requireAccessManager(viewer);
  const uid = await resolveUser(db, d);
  if (!uid) throw new Error("This person hasn't created an account yet — cancel their invitation instead.");
  await guardTarget(db, viewer, uid);
  const state = d.archive ? "archived" : "revoked";
  const scope = d.archive ? "global" : d.scope;
  if (scope === "global") {
    const { data: ex } = await db.from("user_access_states").select("id, state").eq("user_id", uid).eq("scope", "global").is("lifted_at", null).maybeSingle();
    if (ex) await db.from("user_access_states").update({ state, reason: d.reason }).eq("id", ex.id);
    else await db.from("user_access_states").insert({ user_id: uid, email: d.email ?? null, state, scope: "global", reason: d.reason, actor_id: viewer });
    const { error } = await db.auth.admin.updateUserById(uid, { ban_duration: BAN });
    if (error) throw new Error(`Couldn't block sign-in: ${error.message}`);
    // Ending sessions: the ban makes refresh fail; also revoke refresh tokens where supported.
    await db.auth.admin.signOut?.(uid, "global").catch?.(() => {});
  } else {
    if (!d.scopeId) throw new Error("Choose which client or fund to remove them from.");
    if (scope === "client") {
      const { data: rows } = await db.from("client_users").select("*").eq("user_id", uid).eq("client_id", d.scopeId);
      if (!(rows ?? []).length) throw new Error("They aren't a member of that client.");
      await db.from("user_access_states").insert({ user_id: uid, state, scope, scope_id: d.scopeId, reason: d.reason, actor_id: viewer, membership_snapshot: rows });
      await db.from("client_users").delete().eq("user_id", uid).eq("client_id", d.scopeId);
      await db.from("client_contacts").update({ status: "inactive", deactivated_at: new Date().toISOString(), deactivated_by: viewer }).eq("user_id", uid).eq("client_id", d.scopeId);
    } else {
      const { data: rows } = await db.from("fund_team_members").select("id").eq("user_id", uid).eq("offering_id", d.scopeId).is("removed_at", null);
      if (!(rows ?? []).length) throw new Error("They aren't on that fund's team.");
      await db.from("user_access_states").insert({ user_id: uid, state, scope, scope_id: d.scopeId, reason: d.reason, actor_id: viewer, membership_snapshot: rows });
      await db.from("fund_team_members").update({ removed_at: new Date().toISOString(), removed_by: viewer }).eq("user_id", uid).eq("offering_id", d.scopeId).is("removed_at", null);
    }
  }
  await log(db, { subject_kind: "user", subject_id: uid, action: state, scope, scope_id: d.scopeId ?? null, reason: d.reason, actor_id: viewer });
  return { ok: true };
}

export async function restore(viewer: string, d: { userId?: string | null | undefined; email?: string | null | undefined; stateId?: string | null | undefined; reason: string }) {
  const db = await requireAccessManager(viewer);
  const uid = await resolveUser(db, d);
  if (!uid) throw new Error("No account found.");
  let q = db.from("user_access_states").select("*").eq("user_id", uid).is("lifted_at", null);
  q = d.stateId ? q.eq("id", d.stateId) : q.eq("scope", "global");
  const { data: rows } = await q;
  for (const s of (rows ?? []) as any[]) {
    if (s.scope === "global") {
      const { error } = await db.auth.admin.updateUserById(uid, { ban_duration: "none" });
      if (error) throw new Error(`Couldn't restore sign-in: ${error.message}`);
    } else if (s.scope === "client") {
      for (const m of (s.membership_snapshot ?? []) as any[]) {
        await db.from("client_users").upsert({ client_id: m.client_id, user_id: m.user_id, client_role: m.client_role, can_approve: m.can_approve }, { onConflict: "client_id,user_id", ignoreDuplicates: true });
      }
      await db.from("client_contacts").update({ status: "active", deactivated_at: null, deactivated_by: null }).eq("user_id", uid).eq("client_id", s.scope_id);
    } else if (s.scope === "offering") {
      const ids = ((s.membership_snapshot ?? []) as any[]).map((m) => m.id);
      if (ids.length) await db.from("fund_team_members").update({ removed_at: null, removed_by: null }).in("id", ids);
    }
    await db.from("user_access_states").update({ lifted_at: new Date().toISOString(), lifted_by: viewer }).eq("id", s.id);
    await log(db, { subject_kind: "user", subject_id: uid, action: "restored", scope: s.scope, scope_id: s.scope_id, reason: d.reason, actor_id: viewer });
  }
  return { ok: true, restored: (rows ?? []).length };
}

const INVITE_TABLES = ["staff_invitations", "client_invitations", "fund_invitations"] as const;
export async function cancelInvite(viewer: string, table: (typeof INVITE_TABLES)[number], id: string, reason: string) {
  const db = await requireAccessManager(viewer);
  const { error } = await db.from(table).update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", id).eq("status", "pending");
  if (error) throw new Error(error.message);
  await log(db, { subject_kind: table, subject_id: id, action: "invite_cancelled", reason, actor_id: viewer });
  return { ok: true };
}

export async function setTestDemo(viewer: string, kind: "user" | "client" | (typeof INVITE_TABLES)[number], id: string, value: boolean) {
  const db = await requireAccessManager(viewer);
  if (kind === "user") {
    await db.from("profiles").update({ is_test_demo: value }).eq("user_id", id);
    await db.from("persons").update({ is_test_demo: value }).eq("user_id", id);
  } else if (kind === "client") await db.from("clients").update({ is_test_demo: value }).eq("id", id);
  else await db.from(kind).update({ is_test_demo: value }).eq("id", id);
  await log(db, { subject_kind: kind, subject_id: id, action: value ? "marked_test_demo" : "unmarked_test_demo", actor_id: viewer });
  return { ok: true };
}

export async function archiveClient(viewer: string, clientId: string, archive: boolean, reason: string) {
  const db = await requireAccessManager(viewer);
  // Archiving a client hides it; members keep their records. Their access is revoked per person.
  await db.from("clients").update({ status: archive ? "archived" : "active", updated_at: new Date().toISOString() }).eq("id", clientId);
  await log(db, { subject_kind: "client", subject_id: clientId, action: archive ? "archived" : "restored", reason, actor_id: viewer });
  return { ok: true };
}

export async function accessHistory(viewer: string, subjectId: string) {
  const db = await requireAccessViewer(viewer);
  const { data } = await db.from("user_access_events").select("*").eq("subject_id", subjectId).order("created_at", { ascending: false }).limit(100);
  return data ?? [];
}

/** Ids marked test/demo, for excluding from totals. */
export async function testDemoIds() {
  const db = await admin();
  const [p, c, pe] = await Promise.all([
    db.from("profiles").select("user_id").eq("is_test_demo", true),
    db.from("clients").select("id").eq("is_test_demo", true),
    db.from("persons").select("id, user_id").eq("is_test_demo", true),
  ]);
  const users = new Set<string>(((p.data ?? []) as any[]).map((x) => x.user_id));
  const persons = new Set<string>();
  for (const x of (pe.data ?? []) as any[]) { persons.add(x.id); if (x.user_id) users.add(x.user_id); }
  return { users, persons, clients: new Set<string>(((c.data ?? []) as any[]).map((x) => x.id)) };
}

/** True when a row belongs to a test/demo client, user or person. */
export function isTestRow(t: { users: Set<string>; persons: Set<string>; clients: Set<string> }, r: any) {
  return (r.client_id && t.clients.has(r.client_id)) || (r.investor_user_id && t.users.has(r.investor_user_id)) || (r.owner_user_id && t.users.has(r.owner_user_id)) || (r.person_id && t.persons.has(r.person_id));
}
