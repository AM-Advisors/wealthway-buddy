/**
 * One shared answer to "which clients, funds and investments belong to this
 * person". Pure: the View account page and its access controls read this so
 * a person's login, person record and every address on file connect the same
 * way. Login access (client membership, fund manager, team access grant) is
 * kept separate from descriptive listings (client contact, fund team entry,
 * pending invitation), which never grant access on their own.
 */

export const normalizeEmail = (v: unknown) => String(v ?? "").trim().toLowerCase();

export interface ConnectionIdentity {
  userId: string | null;
  personIds: string[];
  /** Every address tied to this person: login, profile, person primary and secondary. */
  emails: string[];
}

export interface PersonClient {
  id: string;
  name: string;
  access: { membershipId: string; role: string | null; canApprove: boolean } | null;
  contactId: string | null;
  listedAs: string[];
  pendingInvite: { role: string | null; sentAt: string | null } | null;
}

export interface PersonFund {
  id: string;
  name: string;
  clientId: string | null;
  manager: boolean;
  teamRoles: string[];
  teamAccess: string[];
  investor: boolean;
  pendingInvite: string | null;
}

export interface PersonInvestment {
  id: string;
  offeringId: string;
  fund: string;
  committed: number | null;
  funded: number;
  status: string;
}

/**
 * A row belongs to this person when it names their login or person record,
 * or (when it names no other login/person) one of their addresses.
 */
export function belongsTo(
  id: ConnectionIdentity,
  row: { userId?: string | null; personId?: string | null; email?: string | null },
): boolean {
  if (row.userId && id.userId && row.userId === id.userId) return true;
  if (row.personId && id.personIds.includes(row.personId)) return true;
  if (row.userId && row.userId !== id.userId) return false;
  if (row.personId && !id.personIds.includes(row.personId)) return false;
  const e = normalizeEmail(row.email);
  return !!e && id.emails.includes(e);
}

export interface ConnectionRows {
  memberships: any[];
  contacts: any[];
  clientInvites: any[];
  managers: any[];
  team: any[];
  grants: any[];
  fundInvites: any[];
  onboardings: any[];
  now?: Date;
}

const nameOf = (r: any, key: "clients" | "offerings", fallback: string) => String(r?.[key]?.name ?? fallback);

export function buildPersonConnections(id: ConnectionIdentity, rows: ConnectionRows) {
  const now = rows.now ?? new Date();
  const clients = new Map<string, PersonClient>();
  const client = (cid: string, name: string) => {
    let c = clients.get(cid);
    if (!c) { c = { id: cid, name, access: null, contactId: null, listedAs: [], pendingInvite: null }; clients.set(cid, c); }
    if (c.name === "Client" && name !== "Client") c.name = name;
    return c;
  };
  for (const m of rows.memberships) {
    if (m.revoked_at || !id.userId || m.user_id !== id.userId) continue;
    client(m.client_id, nameOf(m, "clients", "Client")).access = { membershipId: m.id, role: m.client_role ?? null, canApprove: !!m.can_approve };
  }
  for (const ct of rows.contacts) {
    if (ct.deactivated_at || ct.invite_cancelled_at || (ct.status && ct.status !== "active")) continue;
    if (!belongsTo(id, { userId: ct.user_id, personId: ct.person_id, email: ct.email })) continue;
    const c = client(ct.client_id, nameOf(ct, "clients", "Client"));
    c.contactId = c.contactId ?? ct.id;
    for (const d of (Array.isArray(ct.designations) ? ct.designations : []) as string[]) if (!c.listedAs.includes(d)) c.listedAs.push(d);
    if (!c.listedAs.length) c.listedAs.push("contact");
  }
  for (const inv of rows.clientInvites) {
    if (inv.status !== "pending" || inv.accepted_at || (inv.expires_at && new Date(inv.expires_at) < now)) continue;
    if (!belongsTo(id, { email: inv.email })) continue;
    const c = client(inv.client_id, nameOf(inv, "clients", "Client"));
    if (!c.access) c.pendingInvite = { role: inv.client_role ?? null, sentAt: inv.invite_sent_at ?? inv.created_at ?? null };
  }

  const funds = new Map<string, PersonFund>();
  const fund = (r: any) => {
    const fid = String(r.offering_id);
    let f = funds.get(fid);
    if (!f) { f = { id: fid, name: nameOf(r, "offerings", "Fund"), clientId: r?.offerings?.client_id ?? null, manager: false, teamRoles: [], teamAccess: [], investor: false, pendingInvite: null }; funds.set(fid, f); }
    return f;
  };
  for (const m of rows.managers) if (id.userId && m.user_id === id.userId) fund(m).manager = true;
  for (const t of rows.team) {
    if (t.removed_at || !belongsTo(id, { userId: t.user_id, email: t.email })) continue;
    const f = fund(t);
    const role = String(t.team_role ?? "team member");
    if (!f.teamRoles.includes(role)) f.teamRoles.push(role);
  }
  for (const g of rows.grants) {
    if (g.revoked_at || (g.status && g.status !== "active") || (g.expires_at && new Date(g.expires_at) < now)) continue;
    if (!belongsTo(id, { userId: g.grantee_user_id, email: g.grantee_email })) continue;
    const f = fund(g);
    const role = String(g.role ?? "team access");
    if (!f.teamAccess.includes(role)) f.teamAccess.push(role);
  }
  const investments: PersonInvestment[] = [];
  for (const o of rows.onboardings) {
    if (o.removed_at || o.merged_into_onboarding_id) continue;
    if (!belongsTo(id, { userId: o.investor_user_id, personId: o.person_id })) continue;
    fund(o).investor = true;
    investments.push({ id: o.id, offeringId: o.offering_id, fund: nameOf(o, "offerings", "Fund"), committed: o.commitment_amount_cents ?? null, funded: Number(o.funded_amount_cents ?? 0), status: String(o.funding_status ?? "") });
  }
  for (const inv of rows.fundInvites) {
    if (inv.status !== "pending" || inv.accepted_at) continue;
    if (!belongsTo(id, { email: inv.email })) continue;
    const f = fund(inv);
    if (!f.manager && !f.investor) f.pendingInvite = String(inv.invite_role ?? "invited");
  }

  const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);
  return {
    clients: [...clients.values()].sort(byName),
    funds: [...funds.values()].sort(byName),
    investments,
  };
}

export type PersonConnections = ReturnType<typeof buildPersonConnections>;
