/**
 * Shared account display names.
 *
 * Screens must never show a bare email address when we know the person:
 * profiles.legal_name is optional, so the display name resolves from
 * 1) profiles.legal_name, 2) the linked person's legal first/last name
 * (matched by user_id, then by email), 3) the caller's fallback.
 */
const adminClient = async (): Promise<any> =>
  (await import("@/integrations/supabase/client.server")).supabaseAdmin;

function personName(p: any): string | null {
  const full = `${p?.legal_first_name ?? ""} ${p?.legal_last_name ?? ""}`.trim();
  return full.length ? full : null;
}

/** Resolve display names for many accounts in one batch. */
export async function loadAccountNames(userIds: (string | null | undefined)[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id): id is string => !!id))];
  const names = new Map<string, string>();
  if (!ids.length) return names;
  const d = await adminClient();
  const [{ data: profileRows }, { data: personRows }] = await Promise.all([
    d.from("profiles").select("user_id, legal_name, email").in("user_id", ids),
    (async () => {
      const { data: emailOwners } = await d.from("profiles").select("email").in("user_id", ids);
      const emails = [...new Set(((emailOwners ?? []) as any[]).map((p) => String(p.email ?? "").toLowerCase()).filter(Boolean))];
      const orParts = [`user_id.in.(${ids.join(",")})`];
      if (emails.length) orParts.push(`email.in.(${emails.join(",")})`);
      return d.from("persons").select("user_id, email, legal_first_name, legal_last_name").or(orParts.join(","));
    })(),
  ]);
  const byEmail = new Map<string, string>();
  for (const p of (personRows ?? []) as any[]) {
    const name = personName(p);
    if (p.user_id && name) names.set(p.user_id, name);
    if (p.email && name) byEmail.set(String(p.email).toLowerCase(), name);
  }
  for (const pr of (profileRows ?? []) as any[]) {
    if (!pr.user_id || names.has(pr.user_id)) continue;
    const name = pr.legal_name || byEmail.get(String(pr.email ?? "").toLowerCase()) || null;
    if (name) names.set(pr.user_id, name);
  }
  return names;
}

/** First name for greetings: splits the resolved display name, else null. */
export async function accountFirstName(userIds: (string | null | undefined)[]): Promise<Map<string, string>> {
  const names = await loadAccountNames(userIds);
  for (const [id, name] of names) {
    const first = name.trim().split(/\s+/)[0];
    if (first) names.set(id, first);
  }
  return names;
}

/** Single-account convenience. */
export async function accountName(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  return (await loadAccountNames([userId])).get(userId) ?? null;
}
