import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Harmonious CapTable — investor onboarding.
 *
 * Bringing an investor into the portal is four plain steps: put their email on
 * the record, send the invitation, decide what they are allowed to see, then
 * look at the portal exactly as they will see it before telling them it is
 * ready. Harmonious staff working a migration can do all four from the
 * concierge case; the company's own signatories can do the same from their
 * Investors tab.
 */

const INVESTOR_TYPES = ["investor", "entity", "fund", "spv", "other"];

const DEFAULT_PERMISSIONS = {
  canViewHoldings: true,
  canViewVesting: true,
  canViewDocuments: true,
  canViewTransactions: true,
  canViewCompanySummary: false,
  canViewValuations: false,
  canViewTaxDocuments: false,
  canRequestExercise: true,
};

function mapPermissions(row: any) {
  if (!row) return { ...DEFAULT_PERMISSIONS, isDefault: true, notes: null as string | null };
  return {
    canViewHoldings: Boolean(row.can_view_holdings),
    canViewVesting: Boolean(row.can_view_vesting),
    canViewDocuments: Boolean(row.can_view_documents),
    canViewTransactions: Boolean(row.can_view_transactions),
    canViewCompanySummary: Boolean(row.can_view_company_summary),
    canViewValuations: Boolean(row.can_view_valuations),
    canViewTaxDocuments: Boolean(row.can_view_tax_documents),
    canRequestExercise: Boolean(row.can_request_exercise),
    notes: (row.notes as string | null) ?? null,
    isDefault: false,
  };
}

function n(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function recordEvent(
  context: any,
  entry: {
    companyId: string;
    action: string;
    entityId?: string | null;
    next?: unknown;
    reason?: string | null;
  },
) {
  await context.supabase.from("ct_events").insert({
    company_id: entry.companyId,
    actor_id: context.userId,
    action: entry.action,
    entity_type: "stakeholder",
    entity_id: entry.entityId ?? null,
    new_state: (entry.next ?? null) as any,
    reason: entry.reason ?? null,
  });
}

async function assertManage(context: any, companyId: string) {
  const { data } = await context.supabase.rpc("ct_can_manage", { _company_id: companyId });
  if (!data) throw new Error("You do not have authority to change this cap table.");
}

/** Where one investor has got to, in the order the steps actually happen. */
function stageOf(input: {
  email: string | null;
  invitedAt: string | null;
  linked: boolean;
  permissionsSet: boolean;
}) {
  if (!input.email) return "needs_email" as const;
  if (!input.invitedAt) return "needs_invite" as const;
  if (!input.linked) return "awaiting_sign_in" as const;
  if (!input.permissionsSet) return "needs_permissions" as const;
  return "live" as const;
}

/* ------------------------------------------------------------------ reading */

export const getInvestorOnboarding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ companyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const [
      { data: stakeholders },
      { data: securities },
      { data: permissions },
      { data: invites },
      { data: company },
    ] = await Promise.all([
      supabase
        .from("ct_stakeholders")
        .select("*")
        .eq("company_id", data.companyId)
        .in("stakeholder_type", INVESTOR_TYPES)
        .order("name"),
      supabase
        .from("ct_securities")
        .select("id, stakeholder_id, quantity, security_type, status")
        .eq("company_id", data.companyId),
      supabase.from("ct_holder_permissions").select("*").eq("company_id", data.companyId),
      supabase
        .from("ct_events")
        .select("entity_id, created_at, action")
        .eq("company_id", data.companyId)
        .eq("action", "investor.invited")
        .order("created_at", { ascending: false }),
      supabase
        .from("ct_companies")
        .select("id, name, is_demo")
        .eq("id", data.companyId)
        .maybeSingle(),
    ]);

    const { data: canManage } = await supabase.rpc("ct_can_manage", {
      _company_id: data.companyId,
    });

    const permByStakeholder = new Map(
      ((permissions ?? []) as any[]).map((p) => [String(p.stakeholder_id), p]),
    );
    const invitedAt = new Map<string, string>();
    for (const row of (invites ?? []) as any[]) {
      const key = String(row.entity_id ?? "");
      if (key && !invitedAt.has(key)) invitedAt.set(key, row.created_at as string);
    }

    const investors = ((stakeholders ?? []) as any[]).map((holder) => {
      const mine = ((securities ?? []) as any[]).filter(
        (s) => String(s.stakeholder_id) === String(holder.id) && s.status !== "cancelled",
      );
      const permRow = permByStakeholder.get(String(holder.id));
      const email = (holder.email as string | null) ?? null;
      const invited = invitedAt.get(String(holder.id)) ?? null;
      const linked = Boolean(holder.user_id);
      const permissionsSet = Boolean(permRow);
      return {
        id: holder.id as string,
        name: holder.name as string,
        email,
        entityName: (holder.entity_name as string | null) ?? null,
        stakeholderType: holder.stakeholder_type as string,
        linked,
        invitedAt: invited,
        permissions: mapPermissions(permRow),
        holdings: mine.length,
        shares: mine.reduce((sum, s) => sum + n(s.quantity), 0),
        stage: stageOf({ email, invitedAt: invited, linked, permissionsSet }),
      };
    });

    return {
      canManage: Boolean(canManage),
      isDemo: Boolean(company?.is_demo),
      companyName: (company?.name as string | null) ?? "Company",
      investors,
    };
  });

/* ----------------------------------------------------------------- inviting */

/**
 * Put the investor's email on the record, make sure they have an account, and
 * email them a link to set their own password. Passwords are never emailed.
 */
export const inviteCapInvestor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        stakeholderId: z.string().uuid(),
        email: z.string().trim().email().max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertManage(context, data.companyId);
    const email = data.email.trim().toLowerCase();

    const { data: holder } = await context.supabase
      .from("ct_stakeholders")
      .select("id, name, company_id")
      .eq("id", data.stakeholderId)
      .eq("company_id", data.companyId)
      .maybeSingle();
    if (!holder) throw new Error("That investor is no longer on this cap table.");

    const { data: company } = await context.supabase
      .from("ct_companies")
      .select("name, is_demo")
      .eq("id", data.companyId)
      .maybeSingle();
    if (company?.is_demo) throw new Error("The demo company is read-only.");

    const { error: updateError } = await context.supabase
      .from("ct_stakeholders")
      .update({ email })
      .eq("id", data.stakeholderId)
      .eq("company_id", data.companyId);
    if (updateError) throw new Error(updateError.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ensureAccount, setPasswordLink, PORTAL_ORIGIN } = await import(
      "@/lib/account-invite.server"
    );
    await ensureAccount(supabaseAdmin, email, String((holder as any).name ?? ""));
    const passwordUrl = await setPasswordLink(supabaseAdmin, email);

    let delivery: "sent" | "suppressed" | "failed" = "sent";
    try {
      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      const sent = await sendTemplateEmail("shareholder-invitation", email, {
        idempotencyKey: `cap-investor-invite-${data.stakeholderId}-${Date.now()}`,
        templateData: {
          holderName: String((holder as any).name ?? email),
          companyName: (company?.name as string | null) ?? "the company",
          passwordUrl,
          signInUrl: `${PORTAL_ORIGIN}/my-equity`,
        },
      });
      if (!sent.sent) delivery = "suppressed";
    } catch {
      delivery = "failed";
    }

    await recordEvent(context, {
      companyId: data.companyId,
      action: "investor.invited",
      entityId: data.stakeholderId,
      next: { email, delivery },
      reason: "Investor invited to the portal",
    });

    return { ok: true, delivery };
  });

/* ---------------------------------------------------------- portal preview */

/**
 * The investor's own portal, rendered from their permissions, so whoever is
 * onboarding them can check what they will see before saying it is ready.
 * Nothing here is written; it is a read of the same records the investor gets.
 */
export const previewInvestorPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ companyId: z.string().uuid(), stakeholderId: z.string().uuid() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertManage(context, data.companyId);
    const { supabase } = context;

    const [{ data: holder }, { data: permRow }, { data: securities }, { data: company }] =
      await Promise.all([
        supabase
          .from("ct_stakeholders")
          .select("id, name, email, entity_name, stakeholder_type, user_id")
          .eq("id", data.stakeholderId)
          .eq("company_id", data.companyId)
          .maybeSingle(),
        supabase
          .from("ct_holder_permissions")
          .select("*")
          .eq("stakeholder_id", data.stakeholderId)
          .maybeSingle(),
        supabase
          .from("ct_securities")
          .select("*")
          .eq("company_id", data.companyId)
          .eq("stakeholder_id", data.stakeholderId),
        supabase
          .from("ct_companies")
          .select("id, name")
          .eq("id", data.companyId)
          .maybeSingle(),
      ]);
    if (!holder) throw new Error("That investor is no longer on this cap table.");

    const permissions = mapPermissions(permRow);
    const mine = ((securities ?? []) as any[]).filter((s) => s.status !== "cancelled");

    const [{ data: documents }, { data: transactions }, { data: valuations }, { data: allSecurities }] =
      await Promise.all([
        permissions.canViewDocuments
          ? supabase
              .from("ct_documents")
              .select("id, title, doc_type, created_at")
              .eq("company_id", data.companyId)
              .order("created_at", { ascending: false })
              .limit(20)
          : Promise.resolve({ data: [] as any[] }),
        permissions.canViewTransactions
          ? supabase
              .from("ct_transactions")
              .select("id, kind, quantity, effective_date, security_id")
              .eq("company_id", data.companyId)
              .in(
                "security_id",
                mine.length ? mine.map((s) => String(s.id)) : ["00000000-0000-0000-0000-000000000000"],
              )
              .order("effective_date", { ascending: false })
              .limit(25)
          : Promise.resolve({ data: [] as any[] }),
        permissions.canViewValuations
          ? supabase
              .from("ct_rounds")
              .select("id, name, close_date, pre_money, price_per_share")
              .eq("company_id", data.companyId)
              .order("close_date", { ascending: false })
              .limit(10)
          : Promise.resolve({ data: [] as any[] }),
        permissions.canViewCompanySummary
          ? supabase
              .from("ct_securities")
              .select("quantity, status")
              .eq("company_id", data.companyId)
          : Promise.resolve({ data: [] as any[] }),
      ]);

    const companyOutstanding = ((allSecurities ?? []) as any[])
      .filter((s) => s.status !== "cancelled")
      .reduce((sum, s) => sum + n(s.quantity), 0);
    const myShares = mine.reduce((sum, s) => sum + n(s.quantity), 0);

    return {
      holder: {
        id: holder.id as string,
        name: holder.name as string,
        email: (holder.email as string | null) ?? null,
        entityName: (holder.entity_name as string | null) ?? null,
        linked: Boolean((holder as any).user_id),
      },
      companyName: (company?.name as string | null) ?? "Company",
      permissions,
      holdings: permissions.canViewHoldings
        ? mine.map((s) => ({
            id: s.id as string,
            label: (s.label as string | null) ?? null,
            securityType: s.security_type as string,
            quantity: n(s.quantity),
            issueDate: (s.issue_date as string | null) ?? null,
            status: s.status as string,
          }))
        : [],
      myShares: permissions.canViewHoldings ? myShares : 0,
      ownership:
        permissions.canViewCompanySummary && companyOutstanding > 0
          ? (myShares / companyOutstanding) * 100
          : null,
      companyOutstanding: permissions.canViewCompanySummary ? companyOutstanding : null,
      documents: ((documents ?? []) as any[]).map((d) => ({
        id: d.id as string,
        title: (d.title as string | null) ?? "Document",
        docType: (d.doc_type as string | null) ?? null,
        createdAt: d.created_at as string,
      })),
      transactions: ((transactions ?? []) as any[]).map((t) => ({
        id: t.id as string,
        type: t.kind as string,
        quantity: n(t.quantity),
        effectiveDate: (t.effective_date as string | null) ?? null,
      })),
      valuations: ((valuations ?? []) as any[]).map((r) => ({
        id: r.id as string,
        name: (r.name as string | null) ?? "Round",
        closedOn: (r.close_date as string | null) ?? null,
        pricePerShare: r.price_per_share === null ? null : n(r.price_per_share),
        preMoney: r.pre_money === null ? null : n(r.pre_money),
      })),
    };
  });
