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
 * The application the signing and funding pages should read and write. When a
 * fund is named in the address, the person's application in that fund is used
 * so they always act on the fund they opened. Otherwise the active account's
 * application is used, exactly as before.
 */
export async function applicationIdForOffering(
  supabase: any,
  userId: string,
  offeringId?: string | null,
): Promise<string> {
  if (!offeringId) return activeApplicationId(supabase, userId);

  const personaId = await activePersonaId(supabase, userId);
  const base = supabase
    .from("investor_applications")
    .select("id")
    .eq("user_id", userId)
    .eq("offering_id", offeringId)
    .order("created_at", { ascending: true })
    .limit(1);

  // Prefer the account the person is acting as; fall back to any of their
  // applications in that fund so an older record is still reachable.
  if (personaId) {
    const { data: scoped } = await base.eq("persona_id", personaId).maybeSingle();
    if (scoped?.id) return scoped.id as string;
  }

  const { data } = await supabase
    .from("investor_applications")
    .select("id")
    .eq("user_id", userId)
    .eq("offering_id", offeringId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

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

const ENDED_STAGES = new Set(["closed", "declined", "cancelled"]);

/**
 * The application behind one investment. An investment only ever uses its own
 * linked application, never an older same-login/fund one. When it has none yet
 * (for example its identity check was reused from the login), `link: true`
 * creates it through ensure_exact_investment_application: caller-authenticated,
 * audited, and nothing is approved. Reads pass no `link` and get NO_APPLICATION.
 */
export async function linkedApplicationForInvestment(
  supabase: any,
  investment: { id: string; application_id?: string | null },
  opts: { link?: boolean } = {},
): Promise<string> {
  if (investment.application_id) return investment.application_id;
  if (!opts.link) return NO_APPLICATION;
  const { data, error } = await supabase.rpc("ensure_exact_investment_application", { p_onboarding_id: investment.id });
  if (error || typeof data !== "string") {
    throw new Error("We couldn't link this step to your investment. Please contact Harmonious.");
  }
  return data;
}

/**
 * Fund-addressed investor pages (signing, uploads): when the person has exactly
 * one open investment in the fund, that investment's own application is used
 * (linked on save when missing). Otherwise the older per-fund lookup is
 * unchanged, so legacy-only investors keep working.
 */
export async function investmentApplicationForFund(
  supabase: any,
  userId: string,
  offeringId?: string | null,
  opts: { link?: boolean } = {},
): Promise<string> {
  if (!offeringId) return activeApplicationId(supabase, userId);
  const { data: rows } = await supabase
    .from("investor_onboardings")
    .select("id, application_id, stage, closed_at")
    .eq("investor_user_id", userId)
    .eq("offering_id", offeringId)
    .is("removed_at", null)
    .is("merged_into_onboarding_id", null)
    .limit(20);
  const open = ((rows ?? []) as any[]).filter((r) => !r.closed_at && !ENDED_STAGES.has(String(r.stage)));
  if (open.length !== 1) return applicationIdForOffering(supabase, userId, offeringId);
  return linkedApplicationForInvestment(supabase, open[0], opts);
}
