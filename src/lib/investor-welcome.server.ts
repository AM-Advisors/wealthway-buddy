// Server-only: sends the investor their welcome message once their
// application is approved, with the fund's due diligence room link and the
// next steps. Recorded on the application so it never sends twice.

const PORTAL_ORIGIN = "https://app.harmonious.co";

function money(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return undefined;
  return `$${(cents / 100).toLocaleString("en-US")}`;
}

export async function sendInvestorWelcome(
  applicationId: string,
  reviewerId?: string,
): Promise<{ sent: boolean; reason?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: app } = await supabaseAdmin
    .from("investor_applications")
    .select("id, user_id, offering_id, commitment_cents, welcome_email_sent_at")
    .eq("id", applicationId)
    .maybeSingle();
  if (!app) return { sent: false, reason: "application_not_found" };
  if ((app as any).welcome_email_sent_at) return { sent: false, reason: "already_sent" };

  const [{ data: profile }, { data: offering }, { data: room }, reviewerResult] =
    await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("legal_name, email")
        .eq("user_id", app.user_id as string)
        .maybeSingle(),
      supabaseAdmin
        .from("offerings")
        .select("name")
        .eq("id", app.offering_id as string)
        .maybeSingle(),
      supabaseAdmin
        .from("diligence_rooms")
        .select("id")
        .eq("offering_id", app.offering_id as string)
        .maybeSingle(),
      reviewerId
        ? supabaseAdmin
            .from("profiles")
            .select("legal_name, email")
            .eq("user_id", reviewerId)
            .maybeSingle()
        : Promise.resolve({ data: null as any }),
    ]);

  const email = (profile?.email as string | null) ?? null;
  if (!email) return { sent: false, reason: "no_email_on_file" };

  const offeringName = (offering?.name as string | null) ?? "your fund";
  const diligenceUrl = room ? `${PORTAL_ORIGIN}/diligence/${app.offering_id}` : undefined;

  const nextSteps = [
    diligenceUrl
      ? "Open the due diligence room to read the fund materials and answer any questions assigned to you."
      : "Review the fund materials in your portal and answer any questions assigned to you.",
    "Confirm your commitment amount and how your subscription is titled.",
    "Send your funds using the instructions in your portal, then submit the wire confirmation so the team can match your payment.",
  ];

  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
  const result = await sendTemplateEmail("investor-welcome", email, {
    idempotencyKey: `investor-welcome-${app.id}`,
    templateData: {
      investorName: (profile?.legal_name as string | null) || "Investor",
      offeringName,
      portalUrl: `${PORTAL_ORIGIN}/portal`,
      ...(diligenceUrl ? { diligenceUrl } : {}),
      ...(money(app.commitment_cents as number | null)
        ? { commitment: money(app.commitment_cents as number | null) }
        : {}),
      ...((reviewerResult as any)?.data
        ? {
            reviewerName:
              ((reviewerResult as any).data.legal_name as string | null) ||
              ((reviewerResult as any).data.email as string | null) ||
              "the fund team",
          }
        : {}),
      nextSteps,
    },
  });

  if (result.sent) {
    await supabaseAdmin
      .from("investor_applications")
      .update({ welcome_email_sent_at: new Date().toISOString() } as never)
      .eq("id", app.id as string);
    return { sent: true };
  }
  return { sent: false, reason: result.reason };
}
