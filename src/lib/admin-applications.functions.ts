import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertFullAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Forbidden: admin access required.");
}

/** Funds an admin can start an application against. */
export const listFundsForApplication = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFullAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("offerings")
      .select("id, name, reg_type, min_investment_cents, is_open")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return { offerings: data ?? [] };
  });

const applicationSchema = z.object({
  email: z.string().trim().email("Enter a valid email address").max(255),
  legal_name: z.string().trim().min(2, "Enter the investor's full legal name").max(120),
  investor_type: z.enum(["individual", "joint", "entity", "trust", "ira"]),
  entity_name: z.string().trim().max(160).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  offering_id: z.string().uuid("Choose a fund"),
  commitment_cents: z.number().int().min(0).nullable().default(null),
  send_invitation: z.boolean().default(true),
});

export type AdminApplicationInput = z.infer<typeof applicationSchema>;

/**
 * Admin creates a real investor application against a live fund.
 * Creates (or reuses) the investor's account, profile and fund access,
 * then opens the application so it appears in the review queue and in the
 * investor's own portal with live status tracking.
 */
export const createInvestorApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => applicationSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertFullAdmin(supabase, userId);

    const email = data.email.toLowerCase();

    const { data: offering, error: offeringError } = await supabase
      .from("offerings")
      .select("id, name, min_investment_cents, is_open")
      .eq("id", data.offering_id)
      .maybeSingle();
    if (offeringError) throw new Error(offeringError.message);
    if (!offering) throw new Error("That fund no longer exists.");
    if (!offering.is_open) throw new Error("That fund is closed to new investors.");

    if (
      data.commitment_cents !== null &&
      data.commitment_cents > 0 &&
      data.commitment_cents < offering.min_investment_cents
    ) {
      throw new Error(
        `The commitment is below the fund minimum of $${(offering.min_investment_cents / 100).toLocaleString("en-US")}.`,
      );
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Find an existing account for this email, otherwise create one.
    let investorId: string | null = null;
    let accountCreated = false;

    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("user_id")
      .ilike("email", email)
      .maybeSingle();
    if (existingProfile?.user_id) investorId = existingProfile.user_id as string;

    if (!investorId) {
      for (let page = 1; page <= 10 && !investorId; page += 1) {
        const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
        if (error) throw new Error(error.message);
        const match = (list?.users ?? []).find((u: any) => (u.email ?? "").toLowerCase() === email);
        if (match) investorId = match.id;
        if (!list || list.users.length < 200) break;
      }
    }

    if (!investorId) {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { legal_name: data.legal_name },
      });
      if (error || !created?.user) throw new Error(error?.message ?? "Could not create the investor account.");
      investorId = created.user.id;
      accountCreated = true;
    }

    // Profile
    const { data: profileRow } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", investorId)
      .maybeSingle();

    const profileFields = {
      email,
      legal_name: data.legal_name,
      investor_type: data.investor_type,
      entity_name: data.entity_name || null,
      phone: data.phone || null,
      updated_at: new Date().toISOString(),
    };

    if (profileRow) {
      const { error } = await supabaseAdmin.from("profiles").update(profileFields).eq("id", profileRow.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("profiles")
        .insert({ user_id: investorId, ...profileFields });
      if (error) throw new Error(error.message);
    }

    // One application per investor per fund.
    const { data: existingApp } = await supabaseAdmin
      .from("investor_applications")
      .select("id")
      .eq("user_id", investorId)
      .eq("offering_id", offering.id)
      .maybeSingle();

    if (existingApp) {
      return {
        ok: false as const,
        applicationId: existingApp.id as string,
        message: `${data.legal_name} already has an application in ${offering.name}.`,
      };
    }

    const { data: application, error: appError } = await supabaseAdmin
      .from("investor_applications")
      .insert({
        user_id: investorId,
        offering_id: offering.id,
        status: "in_progress",
        current_step: "kyc",
        commitment_cents: data.commitment_cents && data.commitment_cents > 0 ? data.commitment_cents : null,
      })
      .select("id")
      .single();
    if (appError || !application) throw new Error(appError?.message ?? "Could not create the application.");

    // Make sure the investor can see this fund in their portal.
    await supabaseAdmin
      .from("investor_fund_access")
      .upsert(
        { user_id: investorId, offering_id: offering.id, granted_by: userId },
        { onConflict: "user_id,offering_id" },
      );

    await supabaseAdmin.from("admin_notes").insert({
      application_id: application.id,
      author_id: userId,
      body: `Application opened by an administrator for ${data.legal_name} (${email}) in ${offering.name}.`,
    });

    let invitation: string | null = null;
    if (data.send_invitation) {
      try {
        const { buildTrackedUrl } = await import("@/lib/email-tracking.server");
        const portalUrl = await buildTrackedUrl({
          url: "https://onboard.harmonious.co/dashboard",
          recipient: email,
          template: "investor-invitation",
          label: "Begin onboarding",
        });
        const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
        const result = await sendTemplateEmail("investor-invitation", email, {
          templateData: {
            investorName: data.legal_name,
            offeringName: offering.name,
            portalUrl,
            contactEmail: "operations@harmonious.co",
          },
          idempotencyKey: `invitation-${email}-${application.id}`,
        });
        invitation = result.sent
          ? `Invitation sent to ${email}.`
          : "The invitation was not sent — that address has opted out or previously bounced.";
      } catch {
        invitation = "The application was created, but the invitation email could not be sent.";
      }
    }

    return {
      ok: true as const,
      applicationId: application.id as string,
      accountCreated,
      invitation,
      message: `Application opened for ${data.legal_name} in ${offering.name}.`,
    };
  });
