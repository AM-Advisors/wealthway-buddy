/** Shared account + set-password-link helpers used by every invitation flow
 *  (fund invitations and client contact invitations).
 *  Server-only: uses the admin client. */

export const PORTAL_ORIGIN = "https://app.harmonious.co";

const INVITE_DAYS = 7;

async function sha256Hex(v: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function newToken() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Raw one-hour sign-in link from the auth service (used only at click time). */
async function rawRecoveryLink(supabaseAdmin: any, email: string): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${PORTAL_ORIGIN}/reset-password` },
    });
    if (error) return null;
    return (data?.properties?.action_link as string) || null;
  } catch {
    return null;
  }
}

/** Creates the person's dedicated invite link: https://app.harmonious.co/invite/<token>.
 *  Single-use, expires after 7 days, and replaces any earlier unused link for that account.
 *  Only a hash of the token is stored. Passwords are never emailed. */
export async function setPasswordLink(supabaseAdmin: any, email: string, createdBy?: string | null): Promise<string> {
  const lower = email.toLowerCase();
  try {
    const { data: prof } = await supabaseAdmin.from("profiles").select("user_id").ilike("email", lower).maybeSingle();
    const userId = (prof as any)?.user_id as string | undefined;
    if (!userId) return (await rawRecoveryLink(supabaseAdmin, lower)) ?? `${PORTAL_ORIGIN}/auth`;
    const now = new Date().toISOString();
    await supabaseAdmin.from("account_invite_links").update({ revoked_at: now }).eq("user_id", userId).is("used_at", null).is("revoked_at", null);
    const token = newToken();
    const { error } = await supabaseAdmin.from("account_invite_links").insert({
      user_id: userId, email: lower, token_hash: await sha256Hex(token),
      expires_at: new Date(Date.now() + INVITE_DAYS * 86400_000).toISOString(), created_by: createdBy ?? null,
    });
    if (error) return (await rawRecoveryLink(supabaseAdmin, lower)) ?? `${PORTAL_ORIGIN}/auth`;
    return `${PORTAL_ORIGIN}/invite/${token}`;
  } catch {
    return `${PORTAL_ORIGIN}/auth`;
  }
}

/** Public preview of an invite link: never reveals the email, only first name. */
export async function previewInviteLink(supabaseAdmin: any, token: string) {
  const row = await findLink(supabaseAdmin, token);
  if (!row) return { ok: false as const };
  const { data: prof } = await supabaseAdmin.from("profiles").select("legal_name").eq("user_id", row.user_id).maybeSingle();
  const first = String((prof as any)?.legal_name ?? "").trim().split(/\s+/)[0] || null;
  return { ok: true as const, firstName: first };
}

async function findLink(supabaseAdmin: any, token: string) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const { data } = await supabaseAdmin.from("account_invite_links").select("id, user_id, email, expires_at, used_at, revoked_at").eq("token_hash", await sha256Hex(token)).maybeSingle();
  const r = data as any;
  if (!r || r.used_at || r.revoked_at || new Date(r.expires_at).getTime() < Date.now()) return null;
  return r as { id: string; user_id: string; email: string };
}

/** Uses the invite link once and returns the auth service's sign-in link for that exact account. */
export async function redeemInviteLink(supabaseAdmin: any, token: string): Promise<string | null> {
  const row = await findLink(supabaseAdmin, token);
  if (!row) return null;
  const { data: claimed } = await supabaseAdmin.from("account_invite_links").update({ used_at: new Date().toISOString() })
    .eq("id", row.id).is("used_at", null).is("revoked_at", null).select("id").maybeSingle();
  if (!claimed) return null;
  const { data: u } = await supabaseAdmin.auth.admin.getUserById(row.user_id);
  const email = (u?.user?.email as string | undefined) ?? row.email;
  return rawRecoveryLink(supabaseAdmin, email.toLowerCase());
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
