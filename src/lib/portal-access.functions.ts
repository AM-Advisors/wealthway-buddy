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
  .validator((data: unknown) => emailSchema.parse(data))
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

    // Listed on a fund team, as a client contact, or invited to a client: a login with this
    // email connects to those entries automatically (connect_listed_entries), so no separate
    // fund invitation is needed. Exact match only; ilike alone treats "_" as a wildcard.
    const exact = (rows: any[] | null, col = "email") => (rows ?? []).some((r) => String(r[col] ?? "").trim().toLowerCase() === email);
    const pattern = email.replace(/[\\%_]/g, (m) => `\\${m}`);
    // Already connected to a login under another address: creating a second account would split
    // their records. Staff correct the email on View account instead.
    const { data: linkedPeople } = await supabaseAdmin
      .from("persons").select("email, user_id, merged_into_person_id").ilike("email", pattern).not("user_id", "is", null).limit(5);
    const linkedIds = (linkedPeople ?? []).filter((r: any) => !r.merged_into_person_id && String(r.email).trim().toLowerCase() === email).map((r: any) => r.user_id);
    if (linkedIds.length) {
      const { data: logins } = await supabaseAdmin.from("profiles").select("email").in("user_id", linkedIds);
      if ((logins ?? []).some((l: any) => String(l.email ?? "").trim().toLowerCase() !== email)) return { eligible: false, reason: "different_login" as const };
    }
    const [team, contacts, clientInv] = await Promise.all([
      supabaseAdmin.from("fund_team_members").select("email").ilike("email", pattern).is("removed_at", null).limit(5),
      supabaseAdmin.from("client_contacts").select("email").ilike("email", pattern).eq("status", "active").is("invite_cancelled_at", null).limit(5),
      supabaseAdmin.from("client_invitations").select("email, expires_at").ilike("email", pattern).eq("status", "pending").limit(5),
    ]);
    if (exact(team.data as any[]) || exact(contacts.data as any[])) return { eligible: true };
    if ((clientInv.data ?? []).some((r: any) => String(r.email).toLowerCase() === email && (!r.expires_at || new Date(r.expires_at) > new Date()))) return { eligible: true };

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

    return { eligible: false, reason: "no_invitation" as const };
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

    // No role: allowed with exact relationship rows only: fund access, an application,
    // an active client membership, a linked fund Team entry or a live team-access grant.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const [{ data: access }, { data: apps }, { data: members }, { data: team }, { data: grants }] = await Promise.all([
      supabase.from("investor_fund_access").select("id").eq("user_id", userId).limit(1),
      supabase.from("investor_applications").select("id").eq("user_id", userId).limit(1),
      db.from("client_users").select("id").eq("user_id", userId).is("revoked_at", null).limit(1),
      db.from("fund_team_members").select("id").eq("user_id", userId).is("removed_at", null).limit(1),
      db.from("fund_team_grants").select("id").eq("grantee_user_id", userId).eq("status", "active").limit(1),
    ]);
    const { portalAllowed } = await import("@/lib/portal-access-model");
    const allowed = portalAllowed({
      roles, fundAccessRows: (access ?? []).length, applications: (apps ?? []).length,
      clientMemberships: (members ?? []).length, fundTeamEntries: (team ?? []).length, sharedFundGrants: (grants ?? []).length,
    });

    return { allowed, email, roles, pending_invite: false };
  });
