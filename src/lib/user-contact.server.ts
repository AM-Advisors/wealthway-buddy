/**
 * Name and email for a login account, for notices and reminders. Investors who joined
 * through a fund link or manager entry have their details in `persons`, not `profiles`,
 * so both are read, then the login email as a last resort. Server-only, read-only.
 */
type ProfileRow = { legal_name?: string | null; email?: string | null } | null | undefined;
type PersonRow = { legal_first_name?: string | null; legal_middle_name?: string | null; legal_last_name?: string | null; preferred_name?: string | null; email?: string | null } | null | undefined;

export type UserContact = { name: string | null; email: string | null };

const clean = (s: string | null | undefined) => (typeof s === "string" && s.trim() ? s.trim() : null);

/** Pure, for tests. Verified legal name first, then profile name, then preferred name. */
export function pickUserContact(profile: ProfileRow, person: PersonRow, authEmail?: string | null): UserContact {
  const legal = clean([person?.legal_first_name, person?.legal_middle_name, person?.legal_last_name].map(clean).filter(Boolean).join(" "));
  return {
    name: legal ?? clean(profile?.legal_name) ?? clean(person?.preferred_name),
    email: clean(profile?.email) ?? clean(person?.email) ?? clean(authEmail),
  };
}

export async function loadUserContact(db: any, userId: string | null | undefined): Promise<UserContact> {
  if (!userId) return { name: null, email: null };
  const [{ data: profile }, { data: person }] = await Promise.all([
    db.from("profiles").select("legal_name, email").eq("user_id", userId).maybeSingle().then((r: any) => r, () => ({ data: null })),
    db.from("persons").select("legal_first_name, legal_middle_name, legal_last_name, preferred_name, email").eq("user_id", userId).is("merged_into_person_id", null).maybeSingle().then((r: any) => r, () => ({ data: null })),
  ]);
  let authEmail: string | null = null;
  if (!clean(profile?.email) && !clean(person?.email)) {
    const r = await db.auth.admin.getUserById(userId).catch(() => null);
    authEmail = r?.data?.user?.email ?? null;
  }
  return pickUserContact(profile, person, authEmail);
}

/** Batched form of loadUserContact for lists (e.g. support recordings). One query per table, login email only for ids still missing one. */
export async function loadUserContacts(db: any, userIds: (string | null | undefined)[]): Promise<Map<string, UserContact>> {
  const ids = [...new Set(userIds.filter((x): x is string => typeof x === "string" && !!x))];
  const out = new Map<string, UserContact>();
  if (!ids.length) return out;
  const [{ data: profiles }, { data: persons }] = await Promise.all([
    db.from("profiles").select("user_id, legal_name, email").in("user_id", ids).then((r: any) => r, () => ({ data: [] })),
    db.from("persons").select("user_id, legal_first_name, legal_middle_name, legal_last_name, preferred_name, email").in("user_id", ids).is("merged_into_person_id", null).then((r: any) => r, () => ({ data: [] })),
  ]);
  const pm = new Map(((profiles ?? []) as any[]).map((p) => [p.user_id, p]));
  const sm = new Map<string, any>();
  for (const p of (persons ?? []) as any[]) if (!sm.has(p.user_id)) sm.set(p.user_id, p);
  await Promise.all(ids.map(async (id) => {
    const profile = pm.get(id), person = sm.get(id);
    let authEmail: string | null = null;
    if (!clean(profile?.email) && !clean(person?.email)) {
      const r = await db.auth.admin.getUserById(id).catch(() => null);
      authEmail = r?.data?.user?.email ?? null;
    }
    out.set(id, pickUserContact(profile, person, authEmail));
  }));
  return out;
}
