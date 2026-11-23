/**
 * Shared account display names.
 *
 * Screens must never show a bare email address when we know the person:
 * profiles.legal_name is optional, so the display name resolves from
 * 1) profiles.legal_name, 2) the linked person's legal first/last name
 * (matched by user_id, then by email), 3) the caller's fallback.
 * Activity/owner/sender screens use loadAccountLabels, which adds the
 * account email and sign-in record before any generic wording.
 */
const adminClient = async (): Promise<any> =>
  (await import("@/integrations/supabase/client.server")).supabaseAdmin;

function personName(p: any): string | null {
  const full = `${p?.legal_first_name ?? ""} ${p?.legal_last_name ?? ""}`.trim();
  return full.length ? full : null;
}

/** Names and known emails for many accounts in one batch. */
async function resolveAccounts(ids: string[]) {
  const names = new Map<string, string>();
  const emails = new Map<string, string>();
  if (!ids.length) return { names, emails };
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
    if (p.user_id && p.email && !emails.has(p.user_id)) emails.set(p.user_id, String(p.email));
    if (p.email && name) byEmail.set(String(p.email).toLowerCase(), name);
  }
  for (const pr of (profileRows ?? []) as any[]) {
    if (!pr.user_id) continue;
    if (pr.email) emails.set(pr.user_id, String(pr.email));
    if (names.has(pr.user_id)) continue;
    const name = pr.legal_name || byEmail.get(String(pr.email ?? "").toLowerCase()) || null;
    if (name) names.set(pr.user_id, name);
  }
  return { names, emails };
}

/** Resolve display names for many accounts in one batch. */
export async function loadAccountNames(userIds: (string | null | undefined)[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id): id is string => !!id))];
  return (await resolveAccounts(ids)).names;
}

/**
 * Display labels for activity, owners and senders: the resolved name, else
 * the account's email, else the sign-in record's name/email when no profile
 * or person row exists yet. Accounts with nothing on file are left out so
 * callers keep their own fallback wording.
 */
export async function loadAccountLabels(userIds: (string | null | undefined)[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id): id is string => !!id && UUID.test(id)))];
  const { names, emails } = await resolveAccounts(ids);
  const labels = new Map<string, string>(names);
  for (const [id, email] of emails) if (!labels.has(id)) labels.set(id, email);
  const missing = ids.filter((id) => !labels.has(id)).slice(0, 50);
  if (missing.length) {
    const d = await adminClient();
    await Promise.all(missing.map(async (id) => {
      try {
        const { data } = await d.auth.admin.getUserById(id);
        const u = data?.user;
        const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
        const label = String(meta["full_name"] ?? meta["name"] ?? "").trim() || String(u?.email ?? "").trim();
        if (label) labels.set(id, label);
      } catch { /* leave unresolved */ }
    }));
  }
  return labels;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/**
 * Investing-party names for older applications, read from the current
 * investment linked to each one. Callers have already limited the
 * applications to funds the reviewer may see; managers cannot read person or
 * profile rows directly, so this server-only read returns names only.
 */
export async function applicationPartyNames(appIds: string[]): Promise<Map<string, string>> {
  if (appIds.length === 0) return new Map();
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const rows: any[] = [];
    for (let i = 0; i < appIds.length; i += 300) {
      const { data } = await admin
        .from("investor_onboardings")
        .select("application_id, person_id, investment_profiles(legal_name, display_label)")
        .in("application_id", appIds.slice(i, i + 300))
        .is("removed_at", null)
        .is("merged_into_onboarding_id", null);
      rows.push(...((data ?? []) as any[]));
    }
    const personIds = [...new Set(rows.map((r) => r.person_id).filter(Boolean))] as string[];
    const { data: people } = personIds.length
      ? await admin.from("persons").select("id, preferred_name, legal_first_name, legal_last_name").in("id", personIds)
      : { data: [] as any[] };
    const personName = new Map(
      ((people ?? []) as any[]).map((p) => [
        p.id as string,
        (p.preferred_name as string) || [p.legal_first_name, p.legal_last_name].filter(Boolean).join(" "),
      ]),
    );
    const { canonicalApplicationNames } = await import("@/lib/manager-panel-model");
    return canonicalApplicationNames(
      rows.map((r) => ({
        application_id: r.application_id as string,
        profileName: (r.investment_profiles?.legal_name as string) || (r.investment_profiles?.display_label as string) || null,
        personName: personName.get(r.person_id as string) ?? null,
      })),
    );
  } catch {
    return new Map();
  }
}

/**
 * Display name for current investment records: the investing party's legal
 * name, then the person's name. Callers must already have authorized the
 * funds these records belong to.
 */
export async function onboardingPartyNames(onboardingIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (onboardingIds.length === 0) return out;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const rows: any[] = [];
    for (let i = 0; i < onboardingIds.length; i += 300) {
      const { data } = await admin
        .from("investor_onboardings")
        .select("id, person_id, investment_profiles(legal_name, display_label)")
        .in("id", onboardingIds.slice(i, i + 300));
      rows.push(...((data ?? []) as any[]));
    }
    const personIds = [...new Set(rows.map((r) => r.person_id).filter(Boolean))] as string[];
    const { data: people } = personIds.length
      ? await admin.from("persons").select("id, preferred_name, legal_first_name, legal_last_name").in("id", personIds)
      : { data: [] as any[] };
    const personName = new Map(
      ((people ?? []) as any[]).map((p) => [p.id as string, (p.preferred_name as string) || [p.legal_first_name, p.legal_last_name].filter(Boolean).join(" ")]),
    );
    for (const r of rows) {
      const name = String(r.investment_profiles?.legal_name || r.investment_profiles?.display_label || personName.get(r.person_id) || "").trim();
      if (name) out.set(r.id as string, name);
    }
  } catch {
    // Names are display-only; rows fall back to "Investor".
  }
  return out;
}
