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
 * belonging to the active account, falling back to the person's oldest
 * application when the active account has not applied anywhere yet.
 */
export async function activeApplicationId(supabase: any, userId: string): Promise<string> {
  const personaId = await activePersonaId(supabase, userId);

  if (personaId) {
    const { data } = await supabase
      .from("investor_applications")
      .select("id")
      .eq("user_id", userId)
      .eq("persona_id", personaId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id as string;
  }

  const { data } = await supabase
    .from("investor_applications")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (data?.id as string | undefined) ?? NO_APPLICATION;
}
