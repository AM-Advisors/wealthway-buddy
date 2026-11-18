/**
 * The login account's own contact details (email and name), used when signing
 * and preparing documents. Newer invited investors may have no legacy
 * `profiles` row, so this falls back to the confirmed login email and the
 * person linked to that login. This is the login's contact, never the
 * investing party's name.
 */
type Db = { from: (t: string) => any; auth: { admin: { getUserById: (id: string) => Promise<any> } } };

export type AccountContact = { email: string | null; legalName: string | null; source: "profile" | "login" | "person" | null };

export function pickAccountContact(input: {
  profileEmail?: string | null; profileName?: string | null;
  loginEmail?: string | null; loginConfirmed?: boolean;
  personEmail?: string | null; personFirst?: string | null; personLast?: string | null;
}): AccountContact {
  const clean = (v: unknown) => String(v ?? "").trim();
  const personName = [clean(input.personFirst), clean(input.personLast)].filter(Boolean).join(" ") || null;
  const legalName = clean(input.profileName) || personName;
  const profileEmail = clean(input.profileEmail).toLowerCase();
  if (profileEmail) return { email: profileEmail, legalName, source: "profile" };
  const loginEmail = input.loginConfirmed ? clean(input.loginEmail).toLowerCase() : "";
  if (loginEmail) return { email: loginEmail, legalName, source: "login" };
  const personEmail = clean(input.personEmail).toLowerCase();
  if (personEmail) return { email: personEmail, legalName, source: "person" };
  return { email: null, legalName, source: null };
}

export async function accountContactFor(db: Db, userId: string): Promise<AccountContact> {
  const [{ data: profile }, { data: person }, login] = await Promise.all([
    db.from("profiles").select("legal_name, email").eq("user_id", userId).maybeSingle(),
    db.from("persons").select("email, legal_first_name, legal_last_name").eq("user_id", userId).order("created_at", { ascending: true }).limit(1).maybeSingle(),
    db.auth.admin.getUserById(userId).catch(() => ({ data: null })),
  ]);
  const user = login?.data?.user ?? null;
  return pickAccountContact({
    profileEmail: profile?.email, profileName: profile?.legal_name,
    loginEmail: user?.email, loginConfirmed: !!user?.email_confirmed_at,
    personEmail: person?.email, personFirst: person?.legal_first_name, personLast: person?.legal_last_name,
  });
}
