/** Shared account + set-password-link helpers used by every invitation flow
 *  (fund invitations and client contact invitations).
 *  Server-only: uses the admin client. */

export const PORTAL_ORIGIN = "https://app.harmonious.co";

/** Creates a one-time link where an invited person chooses their own password.
 *  Passwords are never emailed; the link expires and only works once. */
export async function setPasswordLink(supabaseAdmin: any, email: string): Promise<string> {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${PORTAL_ORIGIN}/reset-password` },
    });
    if (error) return `${PORTAL_ORIGIN}/auth`;
    return (data?.properties?.action_link as string) || `${PORTAL_ORIGIN}/auth`;
  } catch {
    return `${PORTAL_ORIGIN}/auth`;
  }
}

/** Finds or creates the account for an email address and syncs the profile. */
export async function ensureAccount(supabaseAdmin: any, email: string, name: string) {
  let targetUserId: string | null = null;
  const { data: profileRow } = await supabaseAdmin
    .from("profiles")
    .select("user_id")
    .ilike("email", email)
    .maybeSingle();
  if (profileRow) targetUserId = (profileRow as any).user_id as string;

  if (!targetUserId) {
    const { data: listed } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const match = (listed?.users ?? []).find((u: any) => (u.email ?? "").toLowerCase() === email);
    if (match) targetUserId = match.id as string;
  }

  let accountCreated = false;
  if (!targetUserId) {
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: name ? { legal_name: name } : {},
    });
    if (createError || !created?.user) {
      throw new Error(createError?.message ?? "Could not create that account.");
    }
    targetUserId = created.user.id as string;
    accountCreated = true;
  }

  const { data: existingProfile } = await supabaseAdmin
    .from("profiles")
    .select("id, legal_name")
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (existingProfile) {
    await supabaseAdmin
      .from("profiles")
      .update({ email, legal_name: name || (existingProfile as any).legal_name || null })
      .eq("id", (existingProfile as any).id);
  } else {
    await supabaseAdmin
      .from("profiles")
      .insert({ user_id: targetUserId, email, legal_name: name || null });
  }

  return { targetUserId: targetUserId as string, accountCreated };
}
