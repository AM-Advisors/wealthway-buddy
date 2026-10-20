import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth, requireSupabaseAuthUnverified } from "@/lib/require-auth";

const emailSchema = z.object({ email: z.string().trim().email().max(255) });

/**
 * Public check used before an account is created: is this email address one the
 * fund team actually invited (or already gave access to)?
 * Returns a boolean only - never any fund or investor detail.
 */
export const checkInviteEligibility = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => emailSchema.parse(data))
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // The fund team's own staff always keep access.
    if (email.split("@")[1] === "harmonious.co") return { eligible: true };

    const { data: invite } = await supabaseAdmin
      .from("fund_invitations")
      .select("id, status, expires_at")
      .ilike("email", email)
      .limit(5);

    const hasInvite = (invite ?? []).some(
      (row: any) =>
        row.status === "accepted" ||
        (row.status === "pending" && (!row.expires_at || new Date(row.expires_at) > new Date())),
    );
    if (hasInvite) return { eligible: true };

    // Someone who already has a profile with access (added manually by an admin).
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("user_id")
      .ilike("email", email)
      .maybeSingle();
    if (profile?.user_id) {
      const [{ data: roles }, { data: access }] = await Promise.all([
        supabaseAdmin.from("user_roles").select("role").eq("user_id", profile.user_id),
        supabaseAdmin
          .from("investor_fund_access")
          .select("id")
          .eq("user_id", profile.user_id)
          .limit(1),
      ]);
      if ((roles ?? []).length > 0 || (access ?? []).length > 0) return { eligible: true };
    }

    return { eligible: false };
  });

export interface PortalAccess {
  allowed: boolean;
  email: string | null;
  roles: string[];
  /** True when the fund team invited this person but access has not been granted yet. */
  pending_invite: boolean;
  /** Investment just connected on sign-in; the portal opens it. */
  openOnboardingId?: string | null;
}

/**
 * Signed-in gate for the portal. Claims any invitation matching the signed-in
 * email, then reports whether this person is allowed inside.
 */
export const getPortalAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuthUnverified])
  .handler(async ({ context }): Promise<PortalAccess> => {
    const { supabase, userId, claims } = context;
    const email = String((claims as any)?.email ?? "").toLowerCase() || null;

    const { data: roleRows } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    let roles = ((roleRows ?? []) as any[]).map((r) => r.role as string);

    let openOnboardingId: string | null = null;
    if (email) {
      // Every sign-in runs the single connection engine: waiting invitations,
      // records prepared under this verified email and unlinked investments.
      const { connectAccount } = await import("@/lib/account-connect.server");
      try {
        const r = await connectAccount(userId);
        // Only steer into an investment when the account had no access before.
        if (roles.length === 0) openOnboardingId = r.openOnboardingId;
        if (r.invitationsAccepted || r.recordsLinked) {
          const { data: refreshed } = await supabase.from("user_roles").select("role").eq("user_id", userId);
          roles = ((refreshed ?? []) as any[]).map((x) => x.role as string);
        }
      } catch (e) {
        console.error("[portal-access] account connection failed", (e as Error).message);
      }
    }

    if (roles.length > 0 || openOnboardingId) {
      return { allowed: true, email, roles, pending_invite: false, openOnboardingId };
    }

    // No role: allowed only if an admin already gave them fund access or an application exists.
    const [{ data: access }, { data: apps }] = await Promise.all([
      supabase.from("investor_fund_access").select("id").eq("user_id", userId).limit(1),
      supabase.from("investor_applications").select("id").eq("user_id", userId).limit(1),
    ]);
    const allowed = (access ?? []).length > 0 || (apps ?? []).length > 0;

    return { allowed, email, roles, pending_invite: false };
  });
