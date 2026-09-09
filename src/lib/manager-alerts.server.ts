// Server-only: drains the notification_events outbox and emails the fund's
// managers (plus admins) about application status changes, new applications
// and submitted wire confirmations.
//
// The outbox rows are written by database triggers, so every code path —
// investor actions, admin actions, provider webhooks — is captured. This
// worker only decides who to tell and sends the email once.

const SITE = "https://onboard.harmonious.co";

type Row = {
  id: string;
  event_kind: string;
  offering_id: string;
  application_id: string | null;
  investor_user_id: string | null;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  amount_cents: number | null;
  metadata: Record<string, any> | null;
};

const FIELD_LABELS: Record<string, string> = {
  kyc_status: "Identity verification",
  aml_status: "Background screening",
  accreditation_status: "Accreditation",
  documents_status: "Documents",
  funding_status: "Funding",
  status: "Application",
};

const VALUE_LABELS: Record<string, string> = {
  not_started: "Not started",
  pending: "Pending",
  review: "In review",
  approved: "Approved",
  declined: "Declined",
  awaiting_wire: "Awaiting wire",
  processing: "Processing",
  settled: "Settled",
  failed: "Failed",
  returned: "Returned",
  cancelled: "Cancelled",
};

function label(value: string | null | undefined) {
  if (!value) return "—";
  return VALUE_LABELS[value] ?? value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

function money(cents: number | null | undefined) {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

async function recipientsForOffering(supabaseAdmin: any, offeringId: string) {
  const [{ data: assignments }, { data: adminRoles }] = await Promise.all([
    supabaseAdmin.from("fund_managers").select("user_id").eq("offering_id", offeringId),
    supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin"),
  ]);

  const ids = Array.from(
    new Set([
      ...((assignments ?? []) as any[]).map((a) => a.user_id as string),
      ...((adminRoles ?? []) as any[]).map((a) => a.user_id as string),
    ]),
  );

  if (ids.length === 0) {
    return [{ user_id: null as string | null, legal_name: "Harmonious operations", email: "operations@harmonious.co" }];
  }

  const [{ data: profiles }, { data: prefs }] = await Promise.all([
    supabaseAdmin.from("profiles").select("user_id, legal_name, email").in("user_id", ids),
    supabaseAdmin.from("notification_preferences").select("user_id, alerts_enabled").in("user_id", ids),
  ]);

  const optedOut = new Set(
    ((prefs ?? []) as any[]).filter((p) => p.alerts_enabled === false).map((p) => p.user_id as string),
  );

  const list = ((profiles ?? []) as any[])
    .filter((p) => p.email && !optedOut.has(p.user_id))
    .map((p) => ({ user_id: p.user_id as string | null, legal_name: p.legal_name as string | null, email: p.email as string }));

  return list;
}

function buildEmail(
  row: Row,
  offeringName: string,
  investorName: string,
): { headline: string; intro: string; details: { label: string; value: string }[] } {
  const base = [
    { label: "Investor", value: investorName },
    { label: "Fund", value: offeringName },
  ];

  if (row.event_kind === "application_created") {
    return {
      headline: `New application — ${offeringName}`,
      intro: `${investorName} has started an application for ${offeringName}.`,
      details: [...base, { label: "Commitment", value: money(row.amount_cents) }],
    };
  }

  if (row.event_kind === "wire_confirmation_submitted") {
    const meta = row.metadata ?? {};
    const bank = [meta["sending_bank_name"], meta["sending_account_last4"] ? `****${meta["sending_account_last4"]}` : null]
      .filter(Boolean)
      .join(" — ");
    return {
      headline: `Wire confirmation submitted — ${offeringName}`,
      intro: `${investorName} has submitted a wire confirmation for ${offeringName}. It is waiting for your review.`,
      details: [
        ...base,
        { label: "Amount", value: money(row.amount_cents) },
        ...(bank ? [{ label: "Sending bank", value: bank }] : []),
        ...(meta["sent_on"] ? [{ label: "Sent on", value: String(meta["sent_on"]) }] : []),
      ],
    };
  }

  const fieldLabel = FIELD_LABELS[row.field ?? ""] ?? "Status";
  return {
    headline: `${fieldLabel}: ${label(row.new_value)} — ${investorName}`,
    intro: `${fieldLabel.toLowerCase()} for ${investorName} on ${offeringName} changed from ${label(
      row.old_value,
    )} to ${label(row.new_value)}.`,
    details: [
      ...base,
      { label: fieldLabel, value: `${label(row.old_value)} → ${label(row.new_value)}` },
      { label: "Commitment", value: money(row.amount_cents) },
    ],
  };
}

/**
 * Sends any pending alert emails. Safe to call concurrently: each row is
 * claimed before sending and stamped when done.
 */
export async function drainManagerAlerts(limit = 25): Promise<{ processed: number; sent: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");

  const claimCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data: pending } = await supabaseAdmin
    .from("notification_events")
    .select("id, event_kind, offering_id, application_id, investor_user_id, field, old_value, new_value, amount_cents, metadata, claimed_at")
    .is("sent_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  const rows = ((pending ?? []) as any[]).filter((r) => !r.claimed_at || r.claimed_at < claimCutoff) as Row[];
  if (rows.length === 0) return { processed: 0, sent: 0 };

  const now = new Date().toISOString();
  await supabaseAdmin
    .from("notification_events")
    .update({ claimed_at: now })
    .in("id", rows.map((r) => r.id));

  let sent = 0;

  for (const row of rows) {
    try {
      const [{ data: offering }, { data: investor }] = await Promise.all([
        supabaseAdmin.from("offerings").select("name").eq("id", row.offering_id).maybeSingle(),
        row.investor_user_id
          ? supabaseAdmin.from("profiles").select("legal_name, email").eq("user_id", row.investor_user_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const offeringName = (offering as any)?.name ?? "your fund";
      const investorName = (investor as any)?.legal_name ?? (investor as any)?.email ?? "An investor";
      const content = buildEmail(row, offeringName, investorName);
      const portalUrl = row.application_id ? `${SITE}/manager/${row.application_id}` : `${SITE}/manager`;

      const recipients = await recipientsForOffering(supabaseAdmin, row.offering_id);

      for (const recipient of recipients) {
        await sendTemplateEmail("manager-alert", recipient.email, {
          templateData: {
            managerName: recipient.legal_name ?? "there",
            headline: content.headline,
            intro: content.intro,
            offeringName,
            details: content.details,
            portalUrl,
          },
          idempotencyKey: `fund-alert-${row.id}-${recipient.email}`,
        });
        sent += 1;
      }

      await supabaseAdmin
        .from("notification_events")
        .update({ sent_at: new Date().toISOString(), error: null })
        .eq("id", row.id);
    } catch (e: any) {
      console.error("[manager-alerts] send failed", row.id, e);
      await supabaseAdmin
        .from("notification_events")
        .update({ claimed_at: null, error: String(e?.message ?? e).slice(0, 500) })
        .eq("id", row.id);
    }
  }

  return { processed: rows.length, sent };
}

/** Fire-and-forget drain used right after a status-changing action. */
export function kickManagerAlerts() {
  try {
    void drainManagerAlerts().catch((e) => console.error("[manager-alerts] drain failed", e));
  } catch (e) {
    console.error("[manager-alerts] drain kick failed", e);
  }
}
