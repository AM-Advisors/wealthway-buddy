import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PORTAL_ORIGIN = "https://onboard.harmonious.co";

type Roles = { isAdmin: boolean; managedOfferingIds: string[] };

async function reviewerContext(supabase: any, userId: string): Promise<Roles> {
  const { data: roles, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "fund_manager"]);
  if (error) throw new Error(error.message);

  const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");
  const { data: assignments } = await supabase
    .from("fund_managers")
    .select("offering_id")
    .eq("user_id", userId);
  const managedOfferingIds = [
    ...new Set(((assignments ?? []) as any[]).map((a) => a.offering_id as string)),
  ] as string[];


  if (!isAdmin && managedOfferingIds.length === 0) {
    throw new Error("Forbidden: you do not manage any funds.");
  }
  return { isAdmin, managedOfferingIds };
}

function assertFundAllowed(ctx: Roles, offeringId: string) {
  if (!ctx.isAdmin && !ctx.managedOfferingIds.includes(offeringId)) {
    throw new Error("Forbidden: you do not manage that fund.");
  }
}

async function actorName(supabase: any, userId: string, claims: Record<string, unknown>) {
  const { data } = await supabase
    .from("profiles")
    .select("legal_name, email")
    .eq("user_id", userId)
    .maybeSingle();
  return (
    ((data as any)?.legal_name as string | null) ||
    ((data as any)?.email as string | null) ||
    ((claims["email"] as string) ?? "The Harmonious team")
  );
}

/** Funds the caller can manage, with their invitations and current access. */
export const listFundInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const ctx = await reviewerContext(supabase, userId);

    let fundQuery = supabase.from("offerings").select("id, name, reg_type, is_open").order("name");
    if (!ctx.isAdmin) fundQuery = fundQuery.in("id", ctx.managedOfferingIds);
    const { data: funds, error } = await fundQuery;
    if (error) throw new Error(error.message);

    const fundIds = (funds ?? []).map((f: any) => f.id as string);
    if (fundIds.length === 0) {
      return { isAdmin: ctx.isAdmin, funds: [], invitations: [], managers: [], investors: [] };
    }

    const [invitations, managers, investors] = await Promise.all([
      supabase
        .from("fund_invitations")
        .select("id, offering_id, email, invited_name, role, status, expires_at, last_sent_at, created_at, accepted_at")
        .in("offering_id", fundIds)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase.from("fund_managers").select("id, user_id, offering_id, created_at").in("offering_id", fundIds),
      supabase
        .from("investor_fund_access")
        .select("id, user_id, offering_id, created_at")
        .in("offering_id", fundIds),
    ]);

    const userIds = [
      ...new Set([
        ...((managers.data ?? []) as any[]).map((m) => m.user_id as string),
        ...((investors.data ?? []) as any[]).map((i) => i.user_id as string),
      ]),
    ];
    const { data: profiles } = userIds.length
      ? await supabase.from("profiles").select("user_id, email, legal_name").in("user_id", userIds)
      : { data: [] as any[] };
    const profileMap = new Map(((profiles ?? []) as any[]).map((p) => [p.user_id, p]));

    const decorate = (rows: any[] | null) =>
      (rows ?? []).map((r: any) => ({
        id: r.id as string,
        userId: r.user_id as string,
        offeringId: r.offering_id as string,
        createdAt: r.created_at as string,
        email: (profileMap.get(r.user_id)?.email as string | null) ?? "(unknown)",
        legalName: (profileMap.get(r.user_id)?.legal_name as string | null) ?? null,
      }));

    return {
      isAdmin: ctx.isAdmin,
      funds: funds ?? [],
      invitations: (invitations.data ?? []) as any[],
      managers: decorate(managers.data as any[]),
      investors: decorate(investors.data as any[]),
    };
  });

const inviteSchema = z.object({
  offeringId: z.string().uuid("Choose a fund"),
  email: z.string().trim().email("Enter a valid email address").max(255),
  name: z.string().trim().max(120).optional().or(z.literal("")),
  role: z.enum(["investor", "fund_manager"]),
  sendEmail: z.boolean().default(true),
});

/**
 * Invite someone to a specific fund as an investor or fund manager.
 * Access is granted immediately (the account is created if needed) and an
 * invitation email is sent. Callers must be an admin or a manager of the fund.
 */
export const inviteToFund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inviteSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const ctx = await reviewerContext(supabase, userId);
    assertFundAllowed(ctx, data.offeringId);

    const email = data.email.toLowerCase();
    const { data: offering, error: offeringError } = await supabase
      .from("offerings")
      .select("id, name")
      .eq("id", data.offeringId)
      .maybeSingle();
    if (offeringError) throw new Error(offeringError.message);
    if (!offering) throw new Error("Fund not found.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let targetUserId: string | null = null;
    const { data: profileRow } = await supabaseAdmin
      .from("profiles")
      .select("user_id")
      .ilike("email", email)
      .maybeSingle();
    if (profileRow) targetUserId = (profileRow as any).user_id as string;

    if (!targetUserId) {
      const { data: listed } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const match = (listed?.users ?? []).find((u) => (u.email ?? "").toLowerCase() === email);
      if (match) targetUserId = match.id;
    }

    let accountCreated = false;
    if (!targetUserId) {
      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: data.name ? { legal_name: data.name } : {},
      });
      if (createError || !created?.user) {
        throw new Error(createError?.message ?? "Could not create that account.");
      }
      targetUserId = created.user.id;
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
        .update({ email, legal_name: data.name || (existingProfile as any).legal_name || null })
        .eq("id", (existingProfile as any).id);
    } else {
      await supabaseAdmin
        .from("profiles")
        .insert({ user_id: targetUserId, email, legal_name: data.name || null });
    }

    // Grant access straight away so the person can simply sign in.
    if (data.role === "fund_manager") {
      const { error: assignError } = await supabase
        .from("fund_managers")
        .upsert(
          { user_id: targetUserId, offering_id: data.offeringId, granted_by: userId },
          { onConflict: "user_id,offering_id" },
        );
      if (assignError) throw new Error(assignError.message);
    } else {
      const { error: assignError } = await supabase
        .from("investor_fund_access")
        .upsert(
          { user_id: targetUserId, offering_id: data.offeringId, granted_by: userId },
          { onConflict: "user_id,offering_id" },
        );
      if (assignError) throw new Error(assignError.message);
    }

    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", targetUserId)
      .eq("role", data.role)
      .maybeSingle();
    if (!roleRow) {
      const { error: roleError } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: targetUserId, role: data.role as any });
      if (roleError) throw new Error(roleError.message);
    }

    const { data: invitation, error: inviteError } = await supabase
      .from("fund_invitations")
      .insert({
        offering_id: data.offeringId,
        email,
        invited_name: data.name || null,
        role: data.role as any,
        invited_by: userId,
        status: "accepted",
        accepted_at: new Date().toISOString(),
        accepted_by: targetUserId,
        last_sent_at: data.sendEmail ? new Date().toISOString() : null,
      })
      .select("id")
      .single();
    if (inviteError) throw new Error(inviteError.message);

    let emailSent = false;
    if (data.sendEmail) {
      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      const result = await sendTemplateEmail("fund-invitation", email, {
        templateData: {
          inviteeName: data.name || email,
          offeringName: (offering as any).name,
          role: data.role,
          invitedByName: await actorName(supabase, userId, claims),
          portalUrl: `${PORTAL_ORIGIN}/auth`,
        },
      });
      emailSent = result.sent;
    }

    return { invitationId: (invitation as any).id as string, accountCreated, emailSent, email };
  });

/** Send the invitation email again for an existing invitation. */
export const resendInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const ctx = await reviewerContext(supabase, userId);

    const { data: invitation, error } = await supabase
      .from("fund_invitations")
      .select("id, offering_id, email, invited_name, role")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!invitation) throw new Error("Invitation not found.");
    assertFundAllowed(ctx, (invitation as any).offering_id as string);

    const { data: offering } = await supabase
      .from("offerings")
      .select("name")
      .eq("id", (invitation as any).offering_id)
      .maybeSingle();

    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const result = await sendTemplateEmail("fund-invitation", (invitation as any).email, {
      templateData: {
        inviteeName: (invitation as any).invited_name || (invitation as any).email,
        offeringName: (offering as any)?.name ?? "Harmonious",
        role: (invitation as any).role,
        invitedByName: await actorName(supabase, userId, claims),
        portalUrl: `${PORTAL_ORIGIN}/auth`,
      },
    });

    await supabase
      .from("fund_invitations")
      .update({ last_sent_at: new Date().toISOString() })
      .eq("id", data.id);

    return { sent: result.sent };
  });

/** Cancel an invitation and remove the access it granted. */
export const revokeInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ctx = await reviewerContext(supabase, userId);

    const { data: invitation, error } = await supabase
      .from("fund_invitations")
      .select("id, offering_id, email, role, accepted_by")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!invitation) throw new Error("Invitation not found.");
    assertFundAllowed(ctx, (invitation as any).offering_id as string);

    const { error: updateError } = await supabase
      .from("fund_invitations")
      .update({ status: "revoked" })
      .eq("id", data.id);
    if (updateError) throw new Error(updateError.message);

    const grantee = (invitation as any).accepted_by as string | null;
    if (grantee) {
      await removeAccessFor(
        supabase,
        grantee,
        (invitation as any).offering_id as string,
        (invitation as any).role as "investor" | "fund_manager",
      );
    }

    return { ok: true };
  });

async function removeAccessFor(
  supabase: any,
  targetUserId: string,
  offeringId: string,
  role: "investor" | "fund_manager",
) {
  if (role === "fund_manager") {
    await supabase
      .from("fund_managers")
      .delete()
      .eq("user_id", targetUserId)
      .eq("offering_id", offeringId);
    const { count } = await supabase
      .from("fund_managers")
      .select("id", { count: "exact", head: true })
      .eq("user_id", targetUserId);
    if ((count ?? 0) === 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", targetUserId)
        .eq("role", "fund_manager" as any);
    }
    return;
  }

  await supabase
    .from("investor_fund_access")
    .delete()
    .eq("user_id", targetUserId)
    .eq("offering_id", offeringId);
}

const removeSchema = z.object({
  userId: z.string().uuid(),
  offeringId: z.string().uuid(),
  role: z.enum(["investor", "fund_manager"]),
});

/** Remove someone's access to one fund. */
export const removeFundAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => removeSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ctx = await reviewerContext(supabase, userId);
    assertFundAllowed(ctx, data.offeringId);

    await removeAccessFor(supabase, data.userId, data.offeringId, data.role);

    await supabase
      .from("fund_invitations")
      .update({ status: "revoked" })
      .eq("offering_id", data.offeringId)
      .eq("accepted_by", data.userId)
      .eq("role", data.role as any)
      .neq("status", "revoked");

    return { ok: true };
  });
