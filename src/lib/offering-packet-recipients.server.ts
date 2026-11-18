/**
 * The people a fund's offering packet may be emailed to: investors on the
 * fund (with or without a login) and people with an open or accepted fund
 * invitation. Emailing the packet to any other address is refused so the
 * fund's documents and wire instructions only go to recorded investors.
 * Callers must check fund access before using this.
 */
export type PacketRecipient = { key: string; email: string; name: string };

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

export async function fundPacketRecipients(fundId: string): Promise<PacketRecipient[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  const [{ data: apps }, { data: access }, { data: onboardings }, { data: invites }] = await Promise.all([
    db.from("investor_applications").select("user_id").eq("offering_id", fundId),
    db.from("investor_fund_access").select("user_id").eq("offering_id", fundId),
    db
      .from("investor_onboardings")
      .select("investor_user_id, person_id")
      .eq("offering_id", fundId)
      .is("removed_at", null)
      .is("merged_into_onboarding_id", null),
    db
      .from("fund_invitations")
      .select("email, invited_name, status")
      .eq("offering_id", fundId)
      .in("status", ["pending", "accepted"]),
  ]);

  const userIds = new Set<string>();
  for (const r of [...(apps ?? []), ...(access ?? [])] as any[]) if (r.user_id) userIds.add(r.user_id);
  const personIds = new Set<string>();
  for (const r of (onboardings ?? []) as any[]) {
    if (r.investor_user_id) userIds.add(r.investor_user_id);
    if (r.person_id) personIds.add(r.person_id);
  }

  const [{ data: profiles }, { data: persons }] = await Promise.all([
    userIds.size
      ? db.from("profiles").select("user_id, email, legal_name").in("user_id", [...userIds])
      : Promise.resolve({ data: [] }),
    personIds.size
      ? db
          .from("persons")
          .select("id, email, legal_first_name, legal_last_name, preferred_name, merged_into_person_id")
          .in("id", [...personIds])
      : Promise.resolve({ data: [] }),
  ]);

  const byEmail = new Map<string, PacketRecipient>();
  const add = (key: string, email: unknown, name: unknown) => {
    const e = norm(email);
    if (!e || !e.includes("@") || byEmail.has(e)) return;
    const label = String(name ?? "").trim() || e;
    byEmail.set(e, { key, email: e, name: label });
  };
  for (const p of (profiles ?? []) as any[]) add(`u:${p.user_id}`, p.email, p.legal_name);
  for (const p of (persons ?? []) as any[]) {
    if (p.merged_into_person_id) continue;
    const name = p.preferred_name || [p.legal_first_name, p.legal_last_name].filter(Boolean).join(" ");
    add(`p:${p.id}`, p.email, name);
  }
  for (const i of (invites ?? []) as any[]) add(`i:${norm(i.email)}`, i.email, i.invited_name);

  return [...byEmail.values()].sort((a, b) => a.name.localeCompare(b.name));
}
