/**
 * Loads a person's clients, funds and investments for buildPersonConnections.
 * Server-only, admin client: callers authorize first. Matches addresses
 * exactly (case-insensitive, wildcards escaped) and skips merged person records.
 */
import { buildPersonConnections, normalizeEmail, type ConnectionIdentity } from "@/lib/person-connections-model";

type Db = any;
const esc = (e: string) => e.replace(/[\\%_]/g, (m) => `\\${m}`);

async function byEmails(db: Db, table: string, fields: string, col: string, emails: string[]) {
  const out: any[] = [];
  for (const e of emails) {
    const { data } = await db.from(table).select(fields).ilike(col, esc(e)).limit(200);
    for (const r of (data ?? []) as any[]) if (normalizeEmail(r[col]) === e) out.push(r);
  }
  return out;
}
const byIds = async (db: Db, table: string, fields: string, col: string, ids: (string | null)[]) => {
  const list = ids.filter(Boolean) as string[];
  if (!list.length) return [] as any[];
  const { data } = await db.from(table).select(fields).in(col, list).limit(1000);
  return (data ?? []) as any[];
};
const uniq = (rows: any[]) => [...new Map(rows.map((r) => [r.id ?? JSON.stringify(r), r])).values()];

/** The person's login, non-merged person records and every address on file. */
export async function loadConnectionIdentity(db: Db, userId: string | null, personId: string | null = null): Promise<ConnectionIdentity> {
  const emails = new Set<string>();
  if (userId) {
    const [{ data: auth }, { data: prof }] = await Promise.all([
      db.auth.admin.getUserById(userId).catch(() => ({ data: null })),
      db.from("profiles").select("email").eq("user_id", userId).maybeSingle(),
    ]);
    if ((auth as any)?.user?.email) emails.add(normalizeEmail((auth as any).user.email));
    if (prof?.email) emails.add(normalizeEmail(prof.email));
  }
  const persons = uniq([
    ...(await byIds(db, "persons", "id, email, secondary_email, user_id, merged_into_person_id", "id", [personId])),
    ...(await byIds(db, "persons", "id, email, secondary_email, user_id, merged_into_person_id", "user_id", [userId])),
  ]).filter((p) => !p.merged_into_person_id);
  for (const p of persons) { if (p.email) emails.add(normalizeEmail(p.email)); if (p.secondary_email) emails.add(normalizeEmail(p.secondary_email)); }
  emails.delete("");
  return { userId, personIds: persons.map((p) => p.id), emails: [...emails] };
}

export async function loadPersonConnections(db: Db, identity: ConnectionIdentity) {
  const { userId, personIds, emails } = identity;
  const C = "id, client_id, user_id, person_id, email, designations, status, deactivated_at, invite_cancelled_at, clients(name)";
  const T = "id, offering_id, team_role, user_id, email, removed_at, offerings(name, client_id)";
  const G = "id, offering_id, role, status, revoked_at, expires_at, grantee_user_id, grantee_email, offerings(name, client_id)";
  const O = "id, offering_id, person_id, investor_user_id, removed_at, merged_into_onboarding_id, commitment_amount_cents, funded_amount_cents, funding_status, offerings(name, client_id)";
  const [memberships, contactsU, contactsP, contactsE, clientInvites, managers, teamU, teamE, grantsU, grantsE, fundInvites, obU, obP] = await Promise.all([
    byIds(db, "client_users", "id, client_id, user_id, client_role, can_approve, revoked_at, clients(name)", "user_id", [userId]),
    byIds(db, "client_contacts", C, "user_id", [userId]),
    byIds(db, "client_contacts", C, "person_id", personIds),
    byEmails(db, "client_contacts", C, "email", emails),
    byEmails(db, "client_invitations", "id, client_id, email, client_role, status, accepted_at, expires_at, invite_sent_at, created_at, clients(name)", "email", emails),
    byIds(db, "fund_managers", "id, offering_id, user_id, offerings(name, client_id)", "user_id", [userId]),
    byIds(db, "fund_team_members", T, "user_id", [userId]),
    byEmails(db, "fund_team_members", T, "email", emails),
    byIds(db, "fund_team_grants", G, "grantee_user_id", [userId]),
    byEmails(db, "fund_team_grants", G, "grantee_email", emails),
    byEmails(db, "fund_invitations", "id, offering_id, email, invite_role, status, accepted_at, offerings(name, client_id)", "email", emails),
    byIds(db, "investor_onboardings", O, "investor_user_id", [userId]),
    byIds(db, "investor_onboardings", O, "person_id", personIds),
  ]);
  return buildPersonConnections(identity, {
    memberships,
    contacts: uniq([...contactsU, ...contactsP, ...contactsE]),
    clientInvites,
    managers,
    team: uniq([...teamU, ...teamE]),
    grants: uniq([...grantsU, ...grantsE]),
    fundInvites,
    onboardings: uniq([...obU, ...obP]),
  });
}
