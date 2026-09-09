import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertReviewer(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "fund_manager"]);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Forbidden: reviewer access required.");
  return (data as any[]).map((r) => r.role as string);
}

const schema = z.object({
  offeringId: z.string().uuid().optional(),
  days: z.number().int().min(1).max(365).optional(),
});

export type FunnelStep = {
  key: string;
  label: string;
  count: number;
  ofPrevious: number | null;
  dropped: number;
};

/**
 * Onboarding funnel: invitations sent, links clicked, and how far each investor got.
 * Open tracking is not available from the email platform, so clicks are the first
 * engagement signal we can report honestly.
 */
export const getOnboardingFunnel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => schema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertReviewer(supabase, userId);

    const days = data.days ?? 90;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    let appQuery = supabase
      .from("investor_applications")
      .select(
        "id, user_id, offering_id, status, current_step, kyc_status, aml_status, accreditation_status, documents_status, funding_status, commitment_cents, created_at, updated_at",
      )
      .gte("created_at", since)
      .limit(1000);
    if (data.offeringId) appQuery = appQuery.eq("offering_id", data.offeringId);

    const { data: appRows, error: appError } = await appQuery;
    if (appError) throw new Error(appError.message);
    const applications = (appRows ?? []) as any[];
    const appIds = applications.map((a) => a.id as string);

    const empty = { data: [] as any[] };
    const [{ data: emails }, { data: profiles }, { data: signatures }] = await Promise.all([
      appIds.length
        ? supabase
            .from("investor_emails")
            .select("id, application_id, to_email, status, created_at, delivery_event")
            .in("application_id", appIds)
        : empty,
      applications.length
        ? supabase
            .from("profiles")
            .select("user_id, legal_name, email")
            .in("user_id", [...new Set(applications.map((a) => a.user_id as string))])
        : empty,
      appIds.length
        ? supabase
            .from("document_signatures")
            .select("application_id, signed_at")
            .in("application_id", appIds)
        : empty,
    ]);

    const profileMap = new Map(((profiles ?? []) as any[]).map((p) => [p.user_id, p]));
    const emailRows = (emails ?? []) as any[];

    // Clicks are stored by recipient address, so match on the investor's email.
    const recipients = [
      ...new Set(
        [
          ...emailRows.map((e) => String(e.to_email ?? "").toLowerCase()),
          ...applications.map((a) => String(profileMap.get(a.user_id)?.email ?? "").toLowerCase()),
        ].filter(Boolean),
      ),
    ];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: clickRows }, { data: openRows }] = await Promise.all([
      recipients.length
        ? supabaseAdmin
            .from("email_link_clicks")
            .select("recipient, template, link_label, clicked_at")
            .gte("clicked_at", since)
            .in("recipient", recipients)
        : Promise.resolve({ data: [] as any[] }),
      recipients.length
        ? supabaseAdmin
            .from("email_opens")
            .select("recipient, template, opened_at")
            .gte("opened_at", since)
            .in("recipient", recipients)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const clicks = (clickRows ?? []) as any[];
    const opens = (openRows ?? []) as any[];

    const clickedRecipients = new Set(clicks.map((c) => String(c.recipient).toLowerCase()));
    const openedRecipients = new Set(opens.map((o) => String(o.recipient).toLowerCase()));
    const firstOpenByRecipient = new Map<string, string>();
    for (const o of opens) {
      const key = String(o.recipient).toLowerCase();
      const at = String(o.opened_at);
      const current = firstOpenByRecipient.get(key);
      if (!current || at < current) firstOpenByRecipient.set(key, at);
    }
    const emailedApps = new Set(
      emailRows.filter((e) => e.status === "sent").map((e) => e.application_id as string),
    );

    const signedByApp = new Set(
      ((signatures ?? []) as any[]).filter((s) => s.signed_at).map((s) => s.application_id as string),
    );

    const rowOf = (app: any) => {
      const profile = profileMap.get(app.user_id);
      const email = String(profile?.email ?? "").toLowerCase();
      const invited = emailedApps.has(app.id);
      const opened = openedRecipients.has(email) || clickedRecipients.has(email);
      const clicked = clickedRecipients.has(email);
      const identity = app.kyc_status === "approved" && app.aml_status === "approved";
      const accredited = app.accreditation_status === "approved";
      const startedSigning = signedByApp.has(app.id);
      const signed = app.documents_status === "approved";
      const funded = app.funding_status === "settled";
      const stage = funded
        ? "Funded"
        : signed
          ? "Awaiting funds"
          : startedSigning
            ? "Signing in progress"
            : accredited
              ? "Documents not started"
              : identity
                ? "Accreditation pending"
                : clicked || invited
                  ? "Identity pending"
                  : "Not started";
      return {
        applicationId: app.id as string,
        name: (profile?.legal_name as string) ?? "Investor",
        email: (profile?.email as string) ?? null,
        offeringId: app.offering_id as string,
        invited,
        opened,
        firstOpenedAt: firstOpenByRecipient.get(email) ?? null,
        clicked,
        identity,
        accredited,
        startedSigning,
        signed,
        funded,
        stage,
        updatedAt: app.updated_at as string,
      };
    };

    const rows = applications.map(rowOf);

    const counts = {
      applications: rows.length,
      invited: rows.filter((r) => r.invited).length,
      opened: rows.filter((r) => r.opened).length,
      clicked: rows.filter((r) => r.clicked).length,
      identity: rows.filter((r) => r.identity).length,
      accredited: rows.filter((r) => r.accredited).length,
      startedSigning: rows.filter((r) => r.startedSigning).length,
      signed: rows.filter((r) => r.signed).length,
      funded: rows.filter((r) => r.funded).length,
    };

    const order: Array<{ key: keyof typeof counts; label: string }> = [
      { key: "applications", label: "Investors added" },
      { key: "invited", label: "Onboarding email sent" },
      { key: "opened", label: "Opened the email" },
      { key: "clicked", label: "Clicked a link in the email" },
      { key: "identity", label: "Identity and screening passed" },
      { key: "accredited", label: "Accreditation approved" },
      { key: "startedSigning", label: "Started signing documents" },
      { key: "signed", label: "All documents signed" },
      { key: "funded", label: "Funds received" },
    ];

    const steps: FunnelStep[] = order.map((step, index) => {
      const count = counts[step.key];
      const prev = index === 0 ? null : counts[order[index - 1]!.key];
      return {
        key: step.key,
        label: step.label,
        count,
        ofPrevious: prev && prev > 0 ? Math.round((count / prev) * 100) : null,
        dropped: prev === null ? 0 : Math.max(prev - count, 0),
      };
    });

    // Which email links investors actually click, so you can see which step pulls them in.
    const byLabel = new Map<string, { clicks: number; people: Set<string> }>();
    for (const c of clicks) {
      const label = (c.link_label as string) ?? "Untitled link";
      if (!byLabel.has(label)) byLabel.set(label, { clicks: 0, people: new Set() });
      const entry = byLabel.get(label)!;
      entry.clicks += 1;
      entry.people.add(String(c.recipient).toLowerCase());
    }
    const linkBreakdown = [...byLabel.entries()]
      .map(([label, v]) => ({ label, clicks: v.clicks, people: v.people.size }))
      .sort((a, b) => b.clicks - a.clicks);

    const stalled = rows
      .filter((r) => !r.funded)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : 1))
      .slice(0, 25);

    return {
      days,
      steps,
      counts,
      linkBreakdown,
      totalClicks: clicks.length,
      stalled,
      opensAvailable: false,
    };
  });

/**
 * Box signing funnel: of the investors sent a Box signing invitation, how many
 * opened it, signed everything, confirmed their wire, and had funds received.
 */
export const getBoxSigningFunnel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => schema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertReviewer(supabase, userId);

    const days = data.days ?? 90;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    let appQuery = supabase
      .from("investor_applications")
      .select("id, user_id, offering_id, funding_status, updated_at")
      .limit(1000);
    if (data.offeringId) appQuery = appQuery.eq("offering_id", data.offeringId);
    const { data: appRows, error: appError } = await appQuery;
    if (appError) throw new Error(appError.message);
    const applications = (appRows ?? []) as any[];
    const appIds = applications.map((a) => a.id as string);

    const empty = { data: [] as any[] };
    const [{ data: sigRows }, { data: wireRows }, { data: paymentRows }, { data: profileRows }] =
      await Promise.all([
        appIds.length
          ? supabase
              .from("document_signatures")
              .select(
                "application_id, offering_document_id, provider, provider_status, provider_sent_at, provider_viewed_at, provider_completed_at",
              )
              .eq("provider", "box_sign")
              .in("application_id", appIds)
          : empty,
        appIds.length
          ? supabase
              .from("wire_confirmations")
              .select("application_id, status, created_at")
              .in("application_id", appIds)
          : empty,
        appIds.length
          ? supabase.from("payments").select("application_id, status").in("application_id", appIds)
          : empty,
        applications.length
          ? supabase
              .from("profiles")
              .select("user_id, legal_name, email")
              .in("user_id", [...new Set(applications.map((a) => a.user_id as string))])
          : empty,
      ]);

    const signatures = ((sigRows ?? []) as any[]).filter(
      (s) => !s.provider_sent_at || s.provider_sent_at >= since,
    );
    const profileMap = new Map(((profileRows ?? []) as any[]).map((p) => [p.user_id, p]));
    const wires = (wireRows ?? []) as any[];
    const payments = (paymentRows ?? []) as any[];

    const byApp = new Map<string, any[]>();
    for (const sig of signatures) {
      const list = byApp.get(sig.application_id) ?? [];
      list.push(sig);
      byApp.set(sig.application_id, list);
    }

    const rows = applications
      .filter((app) => byApp.has(app.id))
      .map((app) => {
        const sigs = byApp.get(app.id)!;
        const profile = profileMap.get(app.user_id);
        const requested = sigs.length;
        const completed = sigs.filter((s) => s.provider_status === "completed").length;
        const opened = sigs.some((s) => s.provider_viewed_at);
        const appWires = wires.filter((w) => w.application_id === app.id);
        const wireSubmitted = appWires.length > 0;
        const wireApproved = appWires.some((w) => w.status === "approved");
        const settled =
          payments.some((p) => p.application_id === app.id && p.status === "settled") ||
          app.funding_status === "settled";
        const signedAll = requested > 0 && completed === requested;
        const lastSentAt =
          sigs
            .map((s) => s.provider_sent_at as string | null)
            .filter(Boolean)
            .sort()
            .pop() ?? null;
        const firstOpenedAt =
          sigs
            .map((s) => s.provider_viewed_at as string | null)
            .filter(Boolean)
            .sort()
            .shift() ?? null;
        const stage = settled || wireApproved
          ? "Funds received"
          : wireSubmitted
            ? "Wire confirmed, awaiting funds"
            : signedAll
              ? "Signed, no wire yet"
              : opened
                ? "Opened, not signed"
                : "Invitation not opened";
        return {
          applicationId: app.id as string,
          offeringId: app.offering_id as string,
          name: (profile?.legal_name as string) ?? "Investor",
          email: (profile?.email as string) ?? null,
          requested,
          completed,
          opened,
          signedAll,
          wireSubmitted,
          fundsReceived: settled || wireApproved,
          lastSentAt,
          firstOpenedAt,
          stage,
          updatedAt: app.updated_at as string,
        };
      });

    const counts = {
      invited: rows.length,
      opened: rows.filter((r) => r.opened).length,
      signed: rows.filter((r) => r.signedAll).length,
      wireSubmitted: rows.filter((r) => r.wireSubmitted).length,
      fundsReceived: rows.filter((r) => r.fundsReceived).length,
    };

    const order: Array<{ key: keyof typeof counts; label: string }> = [
      { key: "invited", label: "Sent a signing invitation" },
      { key: "opened", label: "Opened the signing link" },
      { key: "signed", label: "Signed every document" },
      { key: "wireSubmitted", label: "Confirmed their wire" },
      { key: "fundsReceived", label: "Funds received" },
    ];

    const steps: FunnelStep[] = order.map((step, index) => {
      const count = counts[step.key];
      const prev = index === 0 ? null : counts[order[index - 1]!.key];
      return {
        key: step.key,
        label: step.label,
        count,
        ofPrevious: prev && prev > 0 ? Math.round((count / prev) * 100) : null,
        dropped: prev === null ? 0 : Math.max(prev - count, 0),
      };
    });

    const stuck = rows
      .filter((r) => !r.fundsReceived)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : 1))
      .slice(0, 25);

    return { days, steps, counts, rows, stuck };
  });
