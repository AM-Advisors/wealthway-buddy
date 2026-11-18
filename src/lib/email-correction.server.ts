/**
 * Connected email correction (server). Finds every live place one person's
 * email is recorded and updates them together. History (sent emails,
 * signatures, accepted invitations, audit trails) keeps the original address.
 * Callers authorize first; this module only reads and writes with the admin client.
 */
import { normalizeEmail, planEmailCorrection, type EmailFootprintRow, type CorrectionConflicts } from "@/lib/email-correction-model";

type Db = any;
export interface EmailSubject { userId: string | null; personId: string | null }

const same = (a: string | null | undefined, list: string[]) => list.includes(normalizeEmail(a));

/** Rows whose email column matches one of `emails` exactly (case-insensitive). */
async function byEmail(db: Db, table: string, col: string, fields: string, emails: string[], extra?: (q: any) => any) {
  const out: any[] = [];
  for (const e of emails) {
    let q = db.from(table).select(fields).ilike(col, e.replace(/[\\%_]/g, (m) => `\\${m}`)).limit(200);
    if (extra) q = extra(q);
    const { data } = await q;
    for (const r of (data ?? []) as any[]) if (same(r[col], emails)) out.push(r);
  }
  return out;
}

async function byColumn(db: Db, table: string, fields: string, col: string, value: string | null, extra?: (q: any) => any) {
  if (!value) return [] as any[];
  let q = db.from(table).select(fields).eq(col, value).limit(200);
  if (extra) q = extra(q);
  const { data } = await q;
  return (data ?? []) as any[];
}

const uniq = (rows: any[]) => [...new Map(rows.map((r) => [r.id, r])).values()];

export async function loadEmailFootprint(db: Db, subject: EmailSubject) {
  const { userId } = subject;
  let personId = subject.personId;
  const rows: EmailFootprintRow[] = [];
  let loginEmail: string | null = null;
  if (userId) {
    const { data } = await db.auth.admin.getUserById(userId);
    loginEmail = data?.user?.email ?? null;
    rows.push({ area: "login", id: userId, email: loginEmail, where: null });
    const { data: prof } = await db.from("profiles").select("user_id, email").eq("user_id", userId).maybeSingle();
    if (prof) rows.push({ area: "profile", id: userId, email: prof.email, where: null });
  }
  const persons = uniq([
    ...(await byColumn(db, "persons", "id, email, user_id, merged_into_person_id", "id", personId)),
    ...(await byColumn(db, "persons", "id, email, user_id, merged_into_person_id", "user_id", userId)),
  ]).filter((p) => !p.merged_into_person_id);
  for (const p of persons) rows.push({ area: "person", id: p.id, email: p.email, where: null });
  personId = personId ?? persons[0]?.id ?? null;
  const personIds = persons.map((p) => p.id);

  // Every address already tied to this person; email-only matches use these.
  const emails = [...new Set(rows.map((r) => normalizeEmail(r.email)).filter(Boolean))];
  const mine = (r: any, userCol: string | null, personCol: string | null) => {
    const u = userCol ? r[userCol] : null;
    const p = personCol ? r[personCol] : null;
    if ((u && u === userId) || (p && personIds.includes(p))) return true;
    return !u && !p; // unlinked row: matched by email only
  };

  const offeringIds = new Set<string>();
  const clientIds = new Set<string>();
  const push = (area: EmailFootprintRow["area"], list: any[], col: string, scope: { offering?: string; client?: string }) => {
    for (const r of list) {
      if (scope.offering && r[scope.offering]) offeringIds.add(r[scope.offering]);
      if (scope.client && r[scope.client]) clientIds.add(r[scope.client]);
      rows.push({ area, id: r.id, email: r[col], where: (scope.offering && r[scope.offering]) || (scope.client && r[scope.client]) || null });
    }
  };

  const active = (q: any) => q.eq("status", "active").is("invite_cancelled_at", null);
  push("client_contact", uniq([
    ...(await byColumn(db, "client_contacts", "id, email, user_id, person_id, client_id", "user_id", userId, active)),
    ...(await byColumn(db, "client_contacts", "id, email, user_id, person_id, client_id", "person_id", personId, active)),
    ...(await byEmail(db, "client_contacts", "email", "id, email, user_id, person_id, client_id", emails, active)),
  ]).filter((r) => mine(r, "user_id", "person_id")), "email", { client: "client_id" });

  const pending = (q: any) => q.eq("status", "pending");
  push("client_invitation", await byEmail(db, "client_invitations", "email", "id, email, client_id", emails, pending), "email", { client: "client_id" });
  push("fund_invitation", await byEmail(db, "fund_invitations", "email", "id, email, offering_id", emails, pending), "email", { offering: "offering_id" });

  const notRemoved = (q: any) => q.is("removed_at", null);
  push("fund_team_member", uniq([
    ...(await byColumn(db, "fund_team_members", "id, email, user_id, offering_id", "user_id", userId, notRemoved)),
    ...(await byEmail(db, "fund_team_members", "email", "id, email, user_id, offering_id", emails, notRemoved)),
  ]).filter((r) => mine(r, "user_id", null)), "email", { offering: "offering_id" });

  const liveGrant = (q: any) => q.is("revoked_at", null).neq("status", "revoked");
  push("fund_team_grant", uniq([
    ...(await byColumn(db, "fund_team_grants", "id, grantee_email, grantee_user_id, offering_id", "grantee_user_id", userId, liveGrant)),
    ...(await byEmail(db, "fund_team_grants", "grantee_email", "id, grantee_email, grantee_user_id, offering_id", emails, liveGrant)),
  ]).filter((r) => mine(r, "grantee_user_id", null)), "grantee_email", { offering: "offering_id" });

  push("fund_setup_party", uniq([
    ...(await byColumn(db, "fund_setup_parties", "id, contact_email, user_id, person_id", "user_id", userId)),
    ...(await byColumn(db, "fund_setup_parties", "id, contact_email, user_id, person_id", "person_id", personId)),
    ...(await byEmail(db, "fund_setup_parties", "contact_email", "id, contact_email, user_id, person_id", emails)),
  ]).filter((r) => mine(r, "user_id", "person_id") && r.contact_email), "contact_email", {});

  push("onboarding_participant", uniq([
    ...(await byColumn(db, "onboarding_participants", "id, email, user_id, offering_id", "user_id", userId, notRemoved)),
    ...(await byEmail(db, "onboarding_participants", "email", "id, email, user_id, offering_id", emails, notRemoved)),
  ]).filter((r) => mine(r, "user_id", null)), "email", { offering: "offering_id" });

  const notArchived = (q: any) => q.is("archived_at", null);
  push("crm_contact", uniq([
    ...(await byColumn(db, "crm_contacts", "id, email, person_id, client_id", "person_id", personId, notArchived)),
    ...(await byEmail(db, "crm_contacts", "email", "id, email, person_id, client_id", emails, notArchived)),
  ]).filter((r) => mine(r, null, "person_id")), "email", { client: "client_id" });

  push("cap_stakeholder", uniq([
    ...(await byColumn(db, "cap_stakeholders", "id, email, person_id, client_id", "person_id", personId)),
    ...(await byEmail(db, "cap_stakeholders", "email", "id, email, person_id, client_id", emails)),
  ]).filter((r) => mine(r, null, "person_id")), "email", { client: "client_id" });

  push("client_primary_contact", await byEmail(db, "clients", "primary_contact_email", "id, primary_contact_email", emails), "primary_contact_email", {});
  push("client_billing_contact", await byEmail(db, "clients", "billing_contact_email", "id, billing_contact_email", emails), "billing_contact_email", {});
  for (const r of rows) if (r.area === "client_primary_contact" || r.area === "client_billing_contact") clientIds.add(r.id);

  const [{ data: offs }, { data: cls }] = await Promise.all([
    offeringIds.size ? db.from("offerings").select("id, name").in("id", [...offeringIds]) : { data: [] },
    clientIds.size ? db.from("clients").select("id, name").in("id", [...clientIds]) : { data: [] },
  ]);
  const names = new Map<string, string>([...((offs ?? []) as any[]), ...((cls ?? []) as any[])].map((x) => [x.id, x.name]));
  for (const r of rows) {
    if (r.area === "client_primary_contact" || r.area === "client_billing_contact") r.where = names.get(r.id) ?? null;
    else if (r.where) r.where = names.get(r.where) ?? null;
  }
  return { rows, loginEmail, personId, userId };
}

export async function correctionConflicts(db: Db, subject: { userId: string | null; personIds: string[] }, newEmail: string): Promise<CorrectionConflicts> {
  const e = normalizeEmail(newEmail);
  const esc = e.replace(/[\\%_]/g, (m) => `\\${m}`);
  const [{ data: profs }, { data: people }] = await Promise.all([
    db.from("profiles").select("user_id, email").ilike("email", esc).limit(5),
    db.from("persons").select("id, email, user_id, merged_into_person_id").ilike("email", esc).limit(5),
  ]);
  const otherLogin = ((profs ?? []) as any[]).some((p) => normalizeEmail(p.email) === e && p.user_id !== subject.userId);
  const otherPerson = ((people ?? []) as any[]).some(
    (p) => normalizeEmail(p.email) === e && !p.merged_into_person_id && !subject.personIds.includes(p.id) && (!subject.userId || p.user_id !== subject.userId),
  );
  return { otherLogin, otherPerson };
}

const TABLE: Record<string, { table: string; col: string; key?: string }> = {
  profile: { table: "profiles", col: "email", key: "user_id" },
  person: { table: "persons", col: "email" },
  client_contact: { table: "client_contacts", col: "email" },
  client_invitation: { table: "client_invitations", col: "email" },
  fund_invitation: { table: "fund_invitations", col: "email" },
  fund_team_member: { table: "fund_team_members", col: "email" },
  fund_team_grant: { table: "fund_team_grants", col: "grantee_email" },
  fund_setup_party: { table: "fund_setup_parties", col: "contact_email" },
  onboarding_participant: { table: "onboarding_participants", col: "email" },
  crm_contact: { table: "crm_contacts", col: "email" },
  cap_stakeholder: { table: "cap_stakeholders", col: "email" },
  client_primary_contact: { table: "clients", col: "primary_contact_email" },
  client_billing_contact: { table: "clients", col: "billing_contact_email" },
};

/** Applies the plan. The login changes first; if it fails nothing else is touched. */
export async function applyEmailCorrection(db: Db, footprint: Awaited<ReturnType<typeof loadEmailFootprint>>, newEmail: string) {
  const e = normalizeEmail(newEmail);
  const changes = planEmailCorrection(footprint.rows, e);
  const login = changes.find((c) => c.area === "login");
  if (login) {
    const { error } = await db.auth.admin.updateUserById(login.id, { email: e, email_confirm: true });
    if (error) throw new Error(String(error.message ?? "").includes("already") ? "Another login already uses that email." : "Could not change the sign-in email.");
  }
  const failed: string[] = [];
  const done: EmailFootprintRow[] = login ? [login] : [];
  for (const c of changes) {
    if (c.area === "login") continue;
    const t = TABLE[c.area]!;
    const { error } = await db.from(t.table).update({ [t.col]: e }).eq(t.key ?? "id", c.id);
    if (error) failed.push(c.area);
    else done.push(c);
  }
  // Listed team entries and client contacts now carrying the login's address connect to it.
  if (footprint.userId) await db.rpc("connect_listed_entries", { _uid: footprint.userId }).then(() => undefined, () => undefined);
  return { done, failed };
}
