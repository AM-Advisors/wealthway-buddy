/**
 * Investors can hold several investing accounts (individual, LLC, trust, IRA,
 * joint). Each account can run its own application, in the same fund or in
 * different funds, so "the investor's application" is always resolved through
 * the account they are currently acting as.
 */

/** Used when nothing matches, so a filter never receives null. */
export const NO_APPLICATION = "00000000-0000-0000-0000-000000000000";

/** The investing account the person is currently acting as, if any. */
export async function activePersonaId(supabase: any, userId: string): Promise<string | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("active_persona_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (profile?.active_persona_id) return profile.active_persona_id as string;

  const { data: fallback } = await supabase
    .from("investor_personas")
    .select("id")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (fallback?.id as string | undefined) ?? null;
}

/**
 * The application the onboarding steps should read and write: the oldest one
 * belonging to the active account. Accounts never borrow each other's
 * applications, so a brand new account starts from a clean slate.
 */
export async function activeApplicationId(supabase: any, userId: string): Promise<string> {
  const personaId = await activePersonaId(supabase, userId);

  const query = supabase
    .from("investor_applications")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  const { data } = await (personaId ? query.eq("persona_id", personaId) : query).maybeSingle();

  return (data?.id as string | undefined) ?? NO_APPLICATION;
}

/**
 * Makes sure the person has at least one investing account and that one of
 * them is selected. Older investors are carried over from their profile.
 */
export async function ensureActivePersona(
  supabase: any,
  userId: string,
  profile?: { email?: string | null; legal_name?: string | null; entity_name?: string | null; investor_type?: string | null } | null,
): Promise<string | null> {
  const existing = await activePersonaId(supabase, userId);
  if (existing) {
    await supabase
      .from("profiles")
      .update({ active_persona_id: existing })
      .eq("user_id", userId)
      .is("active_persona_id", null);
    return existing;
  }

  const { data: created } = await supabase
    .from("investor_personas")
    .insert({
      user_id: userId,
      kind: (profile?.investor_type as string | null) ?? "individual",
      label: profile?.entity_name || profile?.legal_name || "Primary account",
      legal_name: profile?.legal_name ?? null,
      entity_name: profile?.entity_name ?? null,
      email: profile?.email ?? null,
      is_default: true,
    })
    .select("id")
    .maybeSingle();

  const personaId = (created?.id as string | undefined) ?? null;
  if (personaId) {
    await supabase.from("profiles").update({ active_persona_id: personaId }).eq("user_id", userId);
  }
  return personaId;
}
