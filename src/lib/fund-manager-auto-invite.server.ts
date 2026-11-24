/**
 * Server-only: invites a person named on a fund (Manager/GP on its team, or a signer)
 * as that fund's manager, using the same account, access grant and invitation email as
 * the manual "Invite to fund". Only that one fund; never client-wide roles.
 * Callers save the person first. Never throws: the result says what happened.
 */
import { autoInviteDecision, skipNote, type AutoInviteResult, type AutoInviteSource } from "@/lib/fund-manager-auto-invite";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

/** Same authority as the manual invitation: an administrator or a manager of this exact fund. */
async function actorMayInvite(db: any, actorId: string, offeringId: string) {
  const { fundMembershipAllows, fundAccessDb } = await import("@/lib/fund-access.server");
  const [{ data: roles }, mgr] = await Promise.all([
    db.from("user_roles").select("role").eq("user_id", actorId).eq("role", "admin"),
    fundMembershipAllows(await fundAccessDb(), actorId, offeringId, "manager"),
  ]);
  return (roles ?? []).length > 0 || Boolean(mgr);
}

export async function autoInviteFundManager(input: {
  actorId: string;
  offeringId: string;
  email: string | null | undefined;
  name: string | null | undefined;
  source: AutoInviteSource;
  teamRole?: string | null | undefined;
  /** Set only by callers that already authorized the action (a submitted or converted fund request). */
  callerAuthorized?: boolean;
}): Promise<AutoInviteResult> {
  const name = (input.name ?? "").trim() || "This person";
  try {
    const db = await admin();
    const email = (input.email ?? "").trim().toLowerCase();
    const [authorized, { data: prof }, { data: removed }] = await Promise.all([
      input.callerAuthorized ? Promise.resolve(true) : actorMayInvite(db, input.actorId, input.offeringId),
      email ? db.from("profiles").select("user_id").ilike("email", email).maybeSingle() : Promise.resolve({ data: null }),
      email
        ? db.from("fund_invitations").select("id").eq("offering_id", input.offeringId).eq("invite_role", "fund_manager").eq("status", "revoked").ilike("email", email).limit(1)
        : Promise.resolve({ data: [] }),
    ]);
    const uid = (prof as any)?.user_id as string | undefined;
    const { data: mgr } = uid
      ? await db.from("fund_managers").select("id").eq("user_id", uid).eq("offering_id", input.offeringId).maybeSingle()
      : { data: null };
    const decision = autoInviteDecision({
      source: input.source, teamRole: input.teamRole, email,
      actorAuthorized: authorized, alreadyManager: Boolean(mgr), accessRemoved: ((removed ?? []) as any[]).length > 0,
    });
    if (!decision.invite) return { status: "skipped", reason: decision.reason, note: skipNote(decision.reason, name) };

    const { data: offering } = await db.from("offerings").select("name").eq("id", input.offeringId).maybeSingle();
    const { ensureAccount } = await import("@/lib/account-invite.server");
    const { targetUserId } = await ensureAccount(db, decision.email, (input.name ?? "").trim());
    const inv = await import("@/lib/invitations.functions");
    const invitationIds = await inv.grantFundAccess({
      supabase: db, supabaseAdmin: db, actorId: input.actorId, targetUserId, offeringIds: [input.offeringId],
      role: "fund_manager", email: decision.email, name: (input.name ?? "").trim(), sendEmail: true,
    });
    const { data: actor } = await db.from("profiles").select("legal_name, email").eq("user_id", input.actorId).maybeSingle();
    let sent = false;
    try {
      sent = await inv.sendInvitationEmail({
        supabaseAdmin: db, email: decision.email, name: (input.name ?? "").trim(), role: "fund_manager",
        fundNames: [String((offering as any)?.name ?? "your fund")],
        invitedByName: (actor as any)?.legal_name || "The Harmonious team",
        actorId: input.actorId, invitationIds,
      });
    } catch (e) {
      console.warn("[fund-manager-auto-invite] email not sent", (e as Error).message);
    }
    await db.from("offering_audit_events").insert({
      offering_id: input.offeringId, actor_id: input.actorId, event_type: "fund_manager_auto_invited",
      summary: sent ? "Fund manager access given and invitation emailed automatically" : "Fund manager access given automatically; invitation email not sent",
      changes: { source: input.source, targetUserId, invitationIds, emailSent: sent },
    }).then(() => null, () => null);
    return sent
      ? { status: "invited", note: `${name} now has fund manager access and was emailed an invitation to sign in.` }
      : { status: "access_given", note: `${name} now has fund manager access, but the invitation email didn't send. Send it again from the fund's invitations.` };
  } catch (e) {
    console.error("[fund-manager-auto-invite]", (e as Error).message);
    return { status: "failed", note: `${name} was saved, but their fund manager invitation didn't go out: ${(e as Error).message.replace(/^Forbidden:\s*/i, "")}` };
  }
}
