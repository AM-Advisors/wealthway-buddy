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
  const [users, roles, cu, ftm, contacts, profiles, states, persons, si, ci, fi, ftg, off, fm] = await Promise.all([
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
    db.from("fund_team_grants").select("grantee_user_id, role, scope, offering_id").eq("status", "active").not("grantee_user_id", "is", null).limit(50000),
    db.from("offerings").select("id, name").limit(20000),
    db.from("fund_managers").select("user_id, offering_id").limit(50000),
  ]);
  const by = <T,>(rows: any[], k: string) => { const m = new Map<string, T[]>(); for (const r of rows ?? []) if (r[k]) m.set(r[k], [...(m.get(r[k]) ?? []), r]); return m; };
  const R = by<any>(roles.data, "user_id"), CU = by<any>(cu.data, "user_id"), F = by<any>(ftm.data, "user_id"), C = by<any>(contacts.data, "user_id"), S = by<any>(states.data, "user_id"), FM = by<any>(fm.data, "user_id"), FTG = by<any>(ftg.data, "grantee_user_id");
  const OFF = new Map(((off.data ?? []) as any[]).map((o) => [o.id, String(o.name ?? "")]));
  const P = new Map(((profiles.data ?? []) as any[]).map((p) => [p.user_id, p]));
  const investorUsers = new Set(((persons.data ?? []) as any[]).map((p) => p.user_id));
  const people = users.map((u: any) => {
    const r = (R.get(u.id) ?? []).map((x: any) => String(x.role));
    const isFounder = (C.get(u.id) ?? []).some((c: any) => (c.designations ?? []).some((d: string) => /founder/i.test(d)));
    const types: PersonType[] = [];
    if (r.some((x) => STAFF.includes(x))) types.push("Employee");
    if (F.get(u.id)?.length || FM.get(u.id)?.length || r.includes("fund_manager")) types.push("Fund Manager");
    if (isFounder) types.push("Founder");
    if (CU.get(u.id)?.length) types.push("Client contact");
    if (investorUsers.has(u.id) || r.includes("investor")) types.push("Investor");
    const st = (S.get(u.id) ?? []) as any[];
    const global = st.find((s) => s.scope === "global");
    const p = P.get(u.id);
    const ftg = (FTG.get(u.id) ?? []) as any[];
    const funds = [...new Set([...(F.get(u.id) ?? []), ...(FM.get(u.id) ?? [])].map((x: any) => OFF.get(x.offering_id)).filter(Boolean))] as string[];
    if (ftg.some((g) => g.scope === "all_funds" || g.scope === "all_managed")) funds.push("All funds");
    return {
      kind: "user" as const, id: u.id, email: u.email ?? p?.email ?? "", name: p?.legal_name || u.user_metadata?.full_name || "",
      types: types.length ? types : ["User" as PersonType], lastSignIn: u.last_sign_in_at ?? null, createdAt: u.created_at,
      status: global ? (global.state as "revoked" | "archived") : "active" as const,
      scopedRevokes: st.filter((s) => s.scope !== "global").map((s) => ({ id: s.id, scope: s.scope, scopeId: s.scope_id, reason: s.reason })),
      funds,
      fundTeam: ftg.length
        ? { grants: ftg.length, allFunds: ftg.some((g) => g.scope === "all_funds"), allManaged: ftg.some((g) => g.scope === "all_managed") }
        : null,
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
  const { directoryInsights } = await import("@/lib/user-insights.server");
  const insights = await directoryInsights(db, people);
  const fiFund = new Map(((fi.data ?? []) as any[]).map((i) => [i.id, OFF.get(i.offering_id) ?? ""]));
  const pending = insights.invitations.filter((i: any) => i.table !== "client_contacts" && (i.status === "pending" || i.status === "accepted" && insights.people.some((p: any) => String(p.email).toLowerCase() === i.email && !p.lastSignIn)));
  return { canManage, providerError: insights.providerError, people: insights.people, invites: pending.map((i: any) => ({ ...i, type: i.table === "staff_invitations" ? "Employee" : i.table === "client_invitations" ? "Client contact" : String(i.role).includes("investor") ? "Investor" : "Fund Manager", fundName: fiFund.get(i.id) || null, sentAt: i.firstSent, lastSent: i.lastSent })), clients: clients ?? [], fundOptions: ((off.data ?? []) as any[]).map((o) => ({ id: o.id, name: String(o.name ?? "") })).filter((o) => o.name).sort((a, b) => a.name.localeCompare(b.name)) };
}

/** Quick status lookup for list pages (by emails). */
export async function statusByEmail(viewer: string, emails: string[]) {
  const db = await requireAccessViewer(viewer);
  const list = [...new Set(emails.filter(Boolean).map((e) => e.toLowerCase()))].slice(0, 2000);
  if (!list.length) return {};
  const [profsRow, invitesRow] = await Promise.all([
    db.from("profiles").select("user_id, email, is_test_demo").in("email", list),
    (async () => {
      try { return await (await import("@/lib/user-insights.server")).invitationSummaries(db, list); } catch { return []; }
    })(),
  ]);
  const profs = profsRow.data, invites = invitesRow as any[];
  const ids = ((profs ?? []) as any[]).map((p) => p.user_id);
  const { data: st } = ids.length ? await db.from("user_access_states").select("user_id, state, scope").is("lifted_at", null).in("user_id", ids) : { data: [] };
  // Latest still-open invitation per email, for "Invite sent" + delivery display next to the resend action.
  const latestByEmail = new Map<string, any>();
  for (const i of invites) {
    if (!["pending", "accepted"].includes(String(i.status))) continue;
    const prev = latestByEmail.get(i.email);
    const at = i.attempts[0]?.at ?? i.createdAt;
    if (!prev || String(at) > String(prev.attempts[0]?.at ?? prev.createdAt)) latestByEmail.set(i.email, i);
  }
  const out: Record<string, { userId: string; status: string; isTestDemo: boolean; scoped: number; invite?: { lastSent: string | null; outcome: any } | undefined }> = {};
  for (const p of (profs ?? []) as any[]) {
    const email = String(p.email).toLowerCase();
    const mine = ((st ?? []) as any[]).filter((s) => s.user_id === p.user_id);
    const g = mine.find((s) => s.scope === "global");
    const latest = latestByEmail.get(email);
    out[email] = { userId: p.user_id, status: g ? g.state : "active", isTestDemo: !!p.is_test_demo, scoped: mine.length - (g ? 1 : 0), invite: latest ? { lastSent: latest.lastSent ?? latest.reportedSentAt, outcome: latest.outcome } : undefined };
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
  if (!uid) throw new Error("This person hasn't created an account yet, cancel their invitation instead.");
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

/** Resends a pending invitation with a fresh one-time set-password link. */
export async function resendInvite(viewer: string, table: (typeof INVITE_TABLES)[number], id: string) {
  const db = await requireAccessManager(viewer);
  const { data: invite, error } = await db.from(table).select("*").eq("id", id).in("status", ["pending", "accepted"]).maybeSingle();
  if (error) throw new Error(error.message);
  if (!invite) throw new Error("That invitation is no longer pending.");
  const email = String(invite.email ?? "").toLowerCase();
  if (!email) throw new Error("That invitation has no email address.");

  const shared = await import("@/lib/account-invite.server");
  await shared.ensureAccount(db, email, invite.invited_name ?? "");
  const portalUrl = await shared.setPasswordLink(db, email);
  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
  const { data: inviter } = await db.from("profiles").select("legal_name, email").eq("user_id", invite.invited_by).maybeSingle();
  const invitedByName = (inviter as any)?.legal_name || (inviter as any)?.email || "The Harmonious team";

  let sent = false;
  if (table === "fund_invitations") {
    const { data: off } = await db.from("offerings").select("name").eq("id", invite.offering_id).maybeSingle();
    const r = await sendTemplateEmail("fund-invitation", email, {
      auditTarget: { kind: table, id, actorId: viewer },
      templateData: {
        inviteeName: invite.invited_name || email,
        offeringName: (off as any)?.name ?? "Harmonious",
        role: invite.invite_role ?? "investor",
        invitedByName,
        portalUrl,
        signInUrl: `${shared.PORTAL_ORIGIN}/auth`,
      },
    });
    sent = r.sent;
  } else {
    let clientName = "Harmonious";
    if (table === "client_invitations" && invite.client_id) {
      const { data: cl } = await db.from("clients").select("name").eq("id", invite.client_id).maybeSingle();
      clientName = (cl as any)?.name ?? clientName;
    }
    const r = await sendTemplateEmail("client-invitation", email, {
      auditTarget: { kind: table, id, actorId: viewer },
      templateData: {
        contactName: invite.invited_name || email,
        clientName,
        roleLabel: table === "staff_invitations" ? `Harmonious ${String(invite.role ?? "team member").replace(/_/g, " ")}` : "Client contact",
        invitedByName,
        passwordUrl: portalUrl,
        signInUrl: `${shared.PORTAL_ORIGIN}/auth`,
      },
    });
    sent = r.sent;
  }

  const now = new Date().toISOString();
  const col = table === "fund_invitations" ? "last_sent_at" : table === "client_invitations" ? "invite_sent_at" : "updated_at";
  if (sent) {
    const { error } = await db.from(table).update({ [col]: now }).eq("id", id);
    if (error) throw new Error("Email sent, but the invitation timestamp could not be updated.");
  }
  await log(db, { subject_kind: table, subject_id: id, action: "invite_resent", reason: sent ? null : "email send failed", actor_id: viewer });
  if (!sent) throw new Error("The invitation was updated but the email could not be sent.");
  return { ok: true };
}

/** Makes a fresh personal invite link to copy and send by hand (replaces earlier unused links). */
export async function copyInviteLink(viewer: string, userId: string) {
  const db = await requireAccessManager(viewer);
  const { data: profile } = await db.from("profiles").select("email").eq("user_id", userId).maybeSingle();
  let email = (profile as any)?.email as string | undefined;
  if (!email) { const { data: u } = await db.auth.admin.getUserById(userId); email = u?.user?.email ?? undefined; }
  if (!email) throw new Error("That person has no email address on file.");
  const shared = await import("@/lib/account-invite.server");
  const url = await shared.setPasswordLink(db, email.toLowerCase(), viewer);
  if (!url.includes("/invite/")) throw new Error("Could not create a personal link for that account.");
  await log(db, { subject_kind: "user", subject_id: userId, action: "invite_link_copied", actor_id: viewer });
  return { url };
}

/** Emails a one-time password-reset link to an existing user. */
export async function resetUserPassword(viewer: string, userId: string) {
  const db = await requireAccessManager(viewer);
  const { data: profile } = await db.from("profiles").select("email, legal_name").eq("user_id", userId).maybeSingle();
  let email = (profile as any)?.email as string | undefined;
  if (!email) {
    const { data: u } = await db.auth.admin.getUserById(userId);
    email = u?.user?.email ?? undefined;
  }
  if (!email) throw new Error("That person has no email address on file.");
  const shared = await import("@/lib/account-invite.server");
  const portalUrl = await shared.setPasswordLink(db, email.toLowerCase());
  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
  const r = await sendTemplateEmail("investor-message", email.toLowerCase(), {
    auditTarget: { kind: "user", id: userId, actorId: viewer, label: "Password reset" },
    templateData: {
      investorName: (profile as any)?.legal_name || email,
      offeringName: "Harmonious",
      subject: "Reset your Harmonious password",
      body: `We received a request to reset the password for your Harmonious account.\n\nUse this one-time link to choose a new password: ${portalUrl}\n\nThe link expires in 7 days and only works once. If you didn't ask for this, you can ignore this email - your password stays the same.`,
    },
  });
  await log(db, { subject_kind: "user", subject_id: userId, action: "password_reset_sent", reason: r.sent ? null : "email send failed", actor_id: viewer });
  if (!r.sent) throw new Error("The reset email could not be sent.");
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
  return (r.client_id && t.clients.has(r.client_id)) || (r.investor_user_id && t.users.has(r.investor_user_id)) || (r.owner_user_id && t.users.has(r.owner_user_id)) || (r.user_id && t.users.has(r.user_id)) || (r.person_id && t.persons.has(r.person_id));
}

/** Full activity trail for one user: account, pages, clicks, actions and access changes. Read-only. */
export async function personActivity(viewer: string, subjectId: string, options: { before?: string | undefined; from?: string | undefined; to?: string | undefined } = {}) {
  const db = await requireAccessViewer(viewer);
  const activityQuery = (table: string, fields: string, column: string) => {
    let q = db.from(table).select(fields).eq(column, subjectId).order("created_at", { ascending: false }).order("id", { ascending: false });
    if (options.before) q = q.lt("created_at", options.before);
    if (options.from) q = q.gte("created_at", options.from);
    if (options.to) q = q.lte("created_at", options.to);
    return q.limit(101);
  };
  const [{ data: prof }, { data: auth }, { data: acts }, { data: audits }, { data: access }, { data: roles }, security, sessionEvents, revocation, latestActivity] = await Promise.all([
    db.from("profiles").select("legal_name, email").eq("user_id", subjectId).maybeSingle(),
    db.auth.admin.getUserById(subjectId),
    activityQuery("staff_activity_events", "id, kind, path, label, created_at", "user_id"),
    activityQuery("access_audit_events", "id, action, created_at", "actor_user_id"),
    activityQuery("user_access_events", "id, action, reason, created_at", "subject_id"),
    db.from("user_roles").select("role").eq("user_id", subjectId),
    activityQuery("security_events", "id,event_type,action,path,created_at", "user_id").neq("event_type", "heartbeat").neq("event_type", "page_view"),
    db.from("security_events").select("event_type,action,created_at").eq("user_id", subjectId).in("event_type", ["sign_in", "sign_out", "session_timeout"]).order("created_at", { ascending: false }).limit(50),
    db.from("security_session_revocations").select("revoked_after").eq("user_id", subjectId).maybeSingle(),
    db.from("staff_activity_events").select("created_at,path,label").eq("user_id", subjectId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const kindLabel: Record<string, string> = { page: "Viewed", click: "Clicked", action: "Action" };
  const events = [
    ...((security.data ?? []) as any[]).map(a => ({ id: `security:${a.id}`, when: a.created_at, kind: "Security", what: `${String(a.event_type).replace(/_/g, " ")}${a.action ? ` — ${a.action}` : ""}`, path: a.path })),
    ...((acts ?? []) as any[]).map((a) => ({ id: a.id, when: a.created_at, kind: kindLabel[a.kind] ?? a.kind, what: a.label || a.path || "", path: a.path })),
    ...((audits ?? []) as any[]).map((a) => ({ id: a.id, when: a.created_at, kind: "Action", what: String(a.action).replace(/_/g, " "), path: null })),
    ...((access ?? []) as any[]).map((a) => ({ id: a.id, when: a.created_at, kind: "Access change", what: `${String(a.action).replace(/_/g, " ")}${a.reason && !String(a.action).startsWith("email_") ? ` — ${a.reason}` : ""}`, path: null })),
  ].sort((a, b) => String(b.when).localeCompare(String(a.when)));
  const u = auth?.user;
  const email = (u?.email ?? prof?.email ?? "").toLowerCase();
  const { setupGaps } = await import("@/lib/user-insights-model");
  const PF = "id,user_id,email,secondary_email,legal_first_name,legal_last_name,phone,secondary_phone,address_line1,address_line2,city,region,postal_code,kyc_status,aml_status,onboarding_state";
  const [linkedP, emailP, cu, ftm, inv, managers] = await Promise.all([
    db.from("persons").select(PF).eq("user_id", subjectId),
    email ? db.from("persons").select(PF).ilike("email", email).is("user_id", null) : Promise.resolve({ data: [] as any[] }),
    db.from("client_users").select("client_id, client_role, clients(name)").eq("user_id", subjectId),
    db.from("fund_team_members").select("offering_id, team_role, offerings(name)").eq("user_id", subjectId).is("removed_at", null),
    db.from("investor_onboardings").select("id, offering_id, commitment_amount_cents, funded_amount_cents, funding_status, offerings(name)").eq("investor_user_id", subjectId),
    db.from("fund_managers").select("offering_id, offerings(name)").eq("user_id", subjectId),
  ]);
  const isStaff = ((roles ?? []) as any[]).length > 0 && !((cu.data ?? []) as any[]).length;
  const mapP = (p: any, linked: boolean) => ({
    id: p.id, linked, name: [p.legal_first_name, p.legal_last_name].filter(Boolean).join(" "), email: p.email, phone: p.phone,
    secondaryEmail: p.secondary_email, secondaryPhone: p.secondary_phone,
    address: [p.address_line1, p.address_line2, p.city, p.region, p.postal_code].filter(Boolean).join(", "),
    kyc: p.kyc_status, aml: p.aml_status, state: p.onboarding_state, gaps: setupGaps(p, isStaff),
  });
  const people = [...((linkedP.data ?? []) as any[]).map((p) => mapP(p, true)), ...((emailP.data ?? []) as any[]).map((p) => mapP(p, false))];
  // Identity check results (document, liveness, face match, AML) - display only, last-four only.
  const linkedIds = people.filter((p) => p.linked).map((p) => p.id);
  const [kv, ac] = await Promise.all([
    linkedIds.length ? db.from("kyc_verifications").select("id, status, document_type, document_issuing_country, document_number_last4, document_expiration_date, liveness_status, face_match_status, face_match_score, provider_decision, harmonious_decision, verification_completed_on, created_at").in("person_id", linkedIds).order("created_at", { ascending: false }).limit(10) : { data: [] },
    db.from("account_identity_checks").select("id, status, decision_summary, decided_at, created_at").eq("user_id", subjectId).order("created_at", { ascending: false }).limit(10),
  ]);
  const identityChecks = [
    ...((kv.data ?? []) as any[]).map((k) => ({ id: k.id, kind: "Investor verification", status: k.harmonious_decision || k.provider_decision || k.status, when: k.verification_completed_on || k.created_at, document: [k.document_type, k.document_issuing_country, k.document_number_last4 ? `••••${k.document_number_last4}` : null].filter(Boolean).join(" · ") || null, expires: k.document_expiration_date, liveness: k.liveness_status, faceMatch: k.face_match_status, faceScore: k.face_match_score, aml: null as string | null })),
    ...((ac.data ?? []) as any[]).map((c) => { const s = c.decision_summary ?? {}; return { id: c.id, kind: "Account verification", status: c.status, when: c.decided_at || c.created_at, document: [s.document?.type, s.document?.country, s.document?.last4 ? `••••${s.document.last4}` : null].filter(Boolean).join(" · ") || null, expires: s.document?.expires ?? null, liveness: s.liveness ?? null, faceMatch: s.faceMatch ?? null, faceScore: null, aml: s.aml?.status ?? null }; }),
  ].sort((a, b) => String(b.when).localeCompare(String(a.when)));
  // Full identity/AML report (display only; ID numbers last-four only, no images).
  const [kvFull, profs, pFull] = await Promise.all([
    linkedIds.length ? db.from("kyc_verifications").select("id, status, session_id, workflow_id, document_type, document_issuing_country, document_issuing_region, document_issue_date, document_expiration_date, document_number_last4, document_expired, review_details, verified_full_name, verified_date_of_birth, liveness_status, face_match_status, face_match_score, address_check_status, proof_of_address_status, provider_decision, provider_warnings, harmonious_decision, harmonious_decision_reason, verification_completed_on, created_at, updated_at").in("person_id", linkedIds).order("created_at", { ascending: false }).limit(5) : { data: [] },
    linkedIds.length ? db.from("investment_profiles").select("id, profile_type, display_label, legal_name, status, tax_id_type, tax_id_last4, city, region, country").in("person_id", linkedIds) : { data: [] },
    linkedIds.length ? db.from("persons").select("id, date_of_birth, citizenship_country, residence_country, tax_residency_country, kyc_status, aml_status, kyc_verified_at, aml_screened_at, identity_verified_at, reverification_due_at, tax_id_last4").in("id", linkedIds) : { data: [] },
  ]);
  const acFull = ((ac.data ?? []) as any[]);
  const { data: acRows } = acFull.length ? await db.from("account_identity_checks").select("id, status, session_id, warnings, decision_note, decided_at, decided_by, created_at, updated_at, decision_summary, review_details").in("id", acFull.map((c) => c.id)) : { data: [] as any[] };
  const kycReport = {
    person: ((pFull.data ?? []) as any[])[0] ?? null,
    accountChecks: ((acRows ?? []) as any[]).filter((c) => c.status !== "not_started").sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
    verifications: (kvFull.data ?? []) as any[],
    profiles: (profs.data ?? []) as any[],
  };
  const { accountSessionStatus } = await import("@/lib/account-session-status");
  const funds = new Map<string, { id: string; name: string; role: string | null }>();
  for (const f of ftm.data ?? []) funds.set(f.offering_id, { id: f.offering_id, name: f.offerings?.name ?? "Fund", role: f.team_role });
  for (const f of managers.data ?? []) funds.set(f.offering_id, { id: f.offering_id, name: f.offerings?.name ?? "Fund", role: "Fund manager" });
  return {
    sessionStatus: sessionEvents.error || revocation.error ? { state: "unknown" as const, at: null } : accountSessionStatus(sessionEvents.data ?? [], revocation.data?.revoked_after ?? null, u?.last_sign_in_at ?? null),
    lastActivity: latestActivity.data ?? null,
    checkedAt: new Date().toISOString(),
    identityChecks,
    kycReport,
    name: prof?.legal_name || "", email: u?.email ?? prof?.email ?? "",
    roles: ((roles ?? []) as any[]).map((r) => r.role as string),
    createdAt: u?.created_at ?? null, lastSignIn: u?.last_sign_in_at ?? null, confirmedAt: u?.email_confirmed_at ?? null,
    people,
    missing: people.some((p) => p.linked) ? [...new Set(people.filter((p) => p.linked).flatMap((p) => p.gaps))] : setupGaps(null, isStaff),
    clients: ((cu.data ?? []) as any[]).map((c) => ({ id: c.client_id as string, name: (c.clients?.name ?? "Client") as string, role: c.client_role as string | null })),
    funds: [...funds.values()],
    investments: ((inv.data ?? []) as any[]).map((i) => ({ id: i.id as string, offeringId: i.offering_id as string, fund: (i.offerings?.name ?? "Fund") as string, committed: i.commitment_amount_cents as number | null, funded: i.funded_amount_cents as number, status: i.funding_status as string })),
    events: events.slice(0, 100), nextCursor: events.length > 100 ? events[99]?.when ?? null : null,
  };
}
