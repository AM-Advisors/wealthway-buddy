import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { INVITABLE_ROLES, type InvitationRole } from "@/lib/invitation-role";

const invitationRoleSchema = z.enum(INVITABLE_ROLES);

const PORTAL_ORIGIN = "https://app.harmonious.co";

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
        .select("id, offering_id, email, invited_name, invite_role, status, expires_at, last_sent_at, created_at, accepted_at")
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
  offeringIds: z.array(z.string().uuid()).min(1, "Choose at least one fund").max(25),
  email: z.string().trim().email("Enter a valid email address").max(255),
  name: z.string().trim().max(120).optional().or(z.literal("")),
  role: invitationRoleSchema,
  sendEmail: z.boolean().default(true),
});

/** Creates a one-time link where an invited person chooses their own password. */
async function setPasswordLink(supabaseAdmin: any, email: string): Promise<string> {
  const shared = await import("@/lib/account-invite.server");
  return shared.setPasswordLink(supabaseAdmin, email);
}

/** Finds or creates the account for an email address and syncs the profile. */
async function ensureAccount(supabaseAdmin: any, email: string, name: string) {
  const shared = await import("@/lib/account-invite.server");
  return shared.ensureAccount(supabaseAdmin, email, name);
}

type GrantInput = {
  supabase: any;
  supabaseAdmin: any;
  actorId: string;
  targetUserId: string;
  offeringIds: string[];
  role: InvitationRole;
  email: string;
  name: string;
  sendEmail: boolean;
};

async function grantFundAccess(input: GrantInput) {
  const { supabaseAdmin, actorId, targetUserId, offeringIds, role, email, name } = input;
  const authz = await import("@/lib/reviewer-authz.server");
  authz.assertInvitableRole(role);

  for (const offeringId of offeringIds) {
    const table = role === "fund_manager" ? "fund_managers" : "investor_fund_access";
    const { error } = await supabaseAdmin
      .from(table)
      .upsert(
        { user_id: targetUserId, offering_id: offeringId, granted_by: actorId },
        { onConflict: "user_id,offering_id" },
      );
    if (error) throw new Error(error.message);
    await authz.logAccessChange({
      actorId,
      offeringId,
      targetUserId,
      role,
      action: "granted",
      detail: email,
    });
  }

  const { data: roleRow } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", targetUserId)
    .eq("role", role)
    .maybeSingle();
  if (!roleRow) {
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: targetUserId, role: role as any });
    if (roleError) throw new Error(roleError.message);
  }

  const now = new Date().toISOString();
  const { data: invitations, error: inviteError } = await supabaseAdmin
    .from("fund_invitations")
    .insert(
      offeringIds.map((offeringId) => ({
        offering_id: offeringId,
        email,
        invited_name: name || null,
        invite_role: role,
        invited_by: actorId,
        status: "accepted",
        accepted_at: now,
        accepted_by: targetUserId,
        last_sent_at: input.sendEmail ? now : null,
      })),
    )
    .select("id");
  if (inviteError) throw new Error(inviteError.message);

  return ((invitations ?? []) as any[]).map((i) => i.id as string);
}

async function sendInvitationEmail(opts: {
  supabaseAdmin: any;
  email: string;
  name: string;
  role: InvitationRole;
  fundNames: string[];
  invitedByName: string;
}) {
  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
  const { buildOpenPixelUrl } = await import("@/lib/email-tracking.server");
  const portalUrl = await setPasswordLink(opts.supabaseAdmin, opts.email);
  const pixelUrl = await buildOpenPixelUrl({
    recipient: opts.email,
    template: "fund-invitation",
  });
  const result = await sendTemplateEmail("fund-invitation", opts.email, {
    templateData: {
      inviteeName: opts.name || opts.email,
      offeringName: opts.fundNames.join(", ") || "Harmonious",
      role: opts.role,
      invitedByName: opts.invitedByName,
      portalUrl,
      signInUrl: `${PORTAL_ORIGIN}/auth`,
      pixelUrl,
    },
  });
  return result.sent;
}

/**
 * Invite someone to one or more funds as an investor or fund manager.
 * Access is granted immediately (the account is created if needed) and an
 * invitation email with a set-password link is sent. Callers must be an admin
 * or a manager of every fund selected.
 */
export const inviteToFund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inviteSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const ctx = await reviewerContext(supabase, userId);
    for (const id of data.offeringIds) assertFundAllowed(ctx, id);
    (await import("@/lib/reviewer-authz.server")).assertInvitableRole(data.role);

    const email = data.email.toLowerCase();
    const { data: offerings, error: offeringError } = await supabase
      .from("offerings")
      .select("id, name")
      .in("id", data.offeringIds);
    if (offeringError) throw new Error(offeringError.message);
    if (!offerings || (offerings as any[]).length === 0) throw new Error("Fund not found.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { targetUserId, accountCreated } = await ensureAccount(
      supabaseAdmin,
      email,
      data.name || "",
    );

    const invitationIds = await grantFundAccess({
      supabase,
      supabaseAdmin,
      actorId: userId,
      targetUserId,
      offeringIds: data.offeringIds,
      role: data.role,
      email,
      name: data.name || "",
      sendEmail: data.sendEmail,
    });

    let emailSent = false;
    if (data.sendEmail) {
      emailSent = await sendInvitationEmail({
        supabaseAdmin,
        email,
        name: data.name || "",
        role: data.role,
        fundNames: (offerings as any[]).map((o) => o.name as string),
        invitedByName: await actorName(supabase, userId, claims),
      });
    }

    return { invitationIds, invitationId: invitationIds[0], accountCreated, emailSent, email };
  });

const bulkSchema = z.object({
  offeringIds: z.array(z.string().uuid()).min(1, "Choose at least one fund").max(25),
  people: z.string().trim().min(3, "Paste at least one email address").max(20000),
  role: invitationRoleSchema,
  sendEmail: z.boolean().default(true),
});

/** Parses pasted text into { email, name } entries. */
export function parsePeopleList(raw: string) {
  const seen = new Set<string>();
  const entries: { email: string; name: string }[] = [];
  const invalid: string[] = [];

  for (const chunk of raw.split(/[\n,;]+/)) {
    const line = chunk.trim();
    if (!line) continue;
    let name = "";
    let email = line;
    const angled = line.match(/^(.*)<([^>]+)>$/);
    if (angled) {
      name = (angled[1] ?? "").trim().replace(/^["']|["']$/g, "");
      email = (angled[2] ?? "").trim();
    }
    email = email.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      invalid.push(line);
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);
    entries.push({ email, name });
  }

  return { entries, invalid };
}

/** Invite a pasted list of people to one or more funds in a single pass. */
export const inviteManyToFunds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => bulkSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const ctx = await reviewerContext(supabase, userId);
    for (const id of data.offeringIds) assertFundAllowed(ctx, id);
    (await import("@/lib/reviewer-authz.server")).assertInvitableRole(data.role);

    const { entries, invalid } = parsePeopleList(data.people);
    if (entries.length === 0) throw new Error("No valid email addresses found.");
    if (entries.length > 50) throw new Error("Add up to 50 people at a time.");

    const { data: offerings, error: offeringError } = await supabase
      .from("offerings")
      .select("id, name")
      .in("id", data.offeringIds);
    if (offeringError) throw new Error(offeringError.message);
    const fundNames = ((offerings ?? []) as any[]).map((o) => o.name as string);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const invitedBy = await actorName(supabase, userId, claims);

    const results: {
      email: string;
      status: "invited" | "failed";
      accountCreated: boolean;
      emailSent: boolean;
      message?: string;
    }[] = [];

    for (const entry of entries) {
      try {
        const { targetUserId, accountCreated } = await ensureAccount(
          supabaseAdmin,
          entry.email,
          entry.name,
        );
        await grantFundAccess({
          supabase,
          supabaseAdmin,
          actorId: userId,
          targetUserId,
          offeringIds: data.offeringIds,
          role: data.role,
          email: entry.email,
          name: entry.name,
          sendEmail: data.sendEmail,
        });
        let emailSent = false;
        if (data.sendEmail) {
          emailSent = await sendInvitationEmail({
            supabaseAdmin,
            email: entry.email,
            name: entry.name,
            role: data.role,
            fundNames,
            invitedByName: invitedBy,
          });
        }
        results.push({ email: entry.email, status: "invited", accountCreated, emailSent });
      } catch (e: unknown) {
        results.push({
          email: entry.email,
          status: "failed",
          accountCreated: false,
          emailSent: false,
          message: e instanceof Error ? e.message : "Could not invite this person.",
        });
      }
    }

    return { results, invalid };
  });


/** Send the invitation email again for an existing invitation. */
export const resendInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const authz = await import("@/lib/reviewer-authz.server");
    const { invitation, db } = await authz.authorizeInvitation(userId, data.id);

    const { data: offering } = await supabase
      .from("offerings")
      .select("name")
      .eq("id", (invitation as any).offering_id)
      .maybeSingle();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sent = await sendInvitationEmail({
      supabaseAdmin,
      email: (invitation as any).email as string,
      name: ((invitation as any).invited_name as string) || "",
      role: (invitation as any).invite_role as InvitationRole,
      fundNames: [((offering as any)?.name as string) ?? "Harmonious"],
      invitedByName: await actorName(supabase, userId, claims),
    });


    await db
      .from("fund_invitations")
      .update({ last_sent_at: new Date().toISOString() })
      .eq("id", data.id);

    return { sent };
  });

/** Cancel an invitation and remove the access it granted. */
export const revokeInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const authz = await import("@/lib/reviewer-authz.server");
    const { invitation, db } = await authz.authorizeInvitation(userId, data.id);

    const { error: updateError } = await db
      .from("fund_invitations")
      .update({ status: "revoked" })
      .eq("id", data.id);
    if (updateError) throw new Error(updateError.message);

    const grantee = (invitation as any).accepted_by as string | null;
    if (grantee) {
      await removeAccessFor(
        userId,
        grantee,
        (invitation as any).offering_id as string,
        (invitation as any).invite_role as InvitationRole,
      );
    }

    return { ok: true };
  });

/** Removes one person's access to one fund with the privileged client, after the
 *  caller has already been authorized for that fund. Every removal is audited. */
async function removeAccessFor(
  actorId: string,
  targetUserId: string,
  offeringId: string,
  role: InvitationRole,
) {
  const authz = await import("@/lib/reviewer-authz.server");
  authz.assertInvitableRole(role);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  if (role === "fund_manager") {
    await supabaseAdmin
      .from("fund_managers")
      .delete()
      .eq("user_id", targetUserId)
      .eq("offering_id", offeringId);
    const { count } = await supabaseAdmin
      .from("fund_managers")
      .select("id", { count: "exact", head: true })
      .eq("user_id", targetUserId);
    if ((count ?? 0) === 0) {
      await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", targetUserId)
        .eq("role", "fund_manager" as any);
    }
  } else {
    await supabaseAdmin
      .from("investor_fund_access")
      .delete()
      .eq("user_id", targetUserId)
      .eq("offering_id", offeringId);
  }

  await authz.logAccessChange({
    actorId,
    offeringId,
    targetUserId,
    role,
    action: "removed",
  });
}

const removeSchema = z.object({
  userId: z.string().uuid(),
  offeringId: z.string().uuid(),
  role: invitationRoleSchema,
});

/** Remove someone's access to one fund. */
export const removeFundAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => removeSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const authz = await import("@/lib/reviewer-authz.server");
    authz.assertInvitableRole(data.role);
    const { db } = await authz.authorizeOffering(userId, data.offeringId);

    await removeAccessFor(userId, data.userId, data.offeringId, data.role);

    await db
      .from("fund_invitations")
      .update({ status: "revoked" })
      .eq("offering_id", data.offeringId)
      .eq("accepted_by", data.userId)
      .eq("invite_role", data.role)
      .neq("status", "revoked");

    return { ok: true };
  });
