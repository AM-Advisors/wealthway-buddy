// Server-only: emails each investor in a fund their share percentage and
// ownership whenever a commitment or a wire changes the cap table. The last
// figures we told each investor are kept on their cap position row, so nobody
// is emailed twice about the same numbers.

const PORTAL_ORIGIN = "https://onboard.harmonious.co";

function money(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return undefined;
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

function pctLabel(value: number) {
  return `${value < 0.01 && value > 0 ? value.toFixed(4) : value.toFixed(2)}%`;
}

const EXCLUDED_STATUSES = new Set(["withdrawn", "declined", "rejected", "cancelled"]);

interface Row {
  application_id: string;
  user_id: string;
  email: string | null;
  name: string;
  ownership_pct: number;
  shares: number | null;
  share_class: string;
  commitment_cents: number;
  funded_cents: number;
  notified_pct: number | null;
  notified_committed: number | null;
  notified_received: number | null;
}

/**
 * Recalculates the fund's cap table and emails every investor whose ownership,
 * commitment or received amount moved since the last message we sent them.
 * Never throws — notification failures must not break the action that caused
 * them.
 */
export async function notifyOwnershipChange(
  offeringId: string,
  reason: string,
): Promise<{ sent: number }> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: offering } = await supabaseAdmin
      .from("offerings")
      .select("id, name")
      .eq("id", offeringId)
      .maybeSingle();
    if (!offering) return { sent: 0 };

    const { data: appsRaw } = await supabaseAdmin
      .from("investor_applications")
      .select("id, user_id, status, commitment_cents")
      .eq("offering_id", offeringId);
    const apps = ((appsRaw ?? []) as any[]).filter((a) => !EXCLUDED_STATUSES.has(a.status));
    if (apps.length === 0) return { sent: 0 };
    const appIds = apps.map((a) => a.id as string);

    const [{ data: subs }, { data: pays }, { data: profiles }, { data: positions }] =
      await Promise.all([
        supabaseAdmin
          .from("subscriptions")
          .select("application_id, commitment_cents")
          .in("application_id", appIds),
        supabaseAdmin
          .from("payments")
          .select("application_id, amount_cents, status")
          .in("application_id", appIds),
        supabaseAdmin
          .from("profiles")
          .select("user_id, legal_name, entity_name, email")
          .in("user_id", Array.from(new Set(apps.map((a) => a.user_id as string)))),
        supabaseAdmin
          .from("investor_cap_positions")
          .select(
            "application_id, shares, share_class, ownership_pct_override, notified_ownership_pct, notified_committed_cents, notified_received_cents",
          )
          .eq("offering_id", offeringId),
      ]);

    const subByApp = new Map<string, number>();
    for (const s of (subs ?? []) as any[]) {
      if (s.commitment_cents != null) subByApp.set(s.application_id, Number(s.commitment_cents));
    }
    const fundedByApp = new Map<string, number>();
    for (const p of (pays ?? []) as any[]) {
      if (p.status !== "settled") continue;
      fundedByApp.set(
        p.application_id,
        (fundedByApp.get(p.application_id) ?? 0) + Number(p.amount_cents ?? 0),
      );
    }
    const profileByUser = new Map<string, any>();
    for (const p of (profiles ?? []) as any[]) profileByUser.set(p.user_id, p);
    const posByApp = new Map<string, any>();
    for (const p of (positions ?? []) as any[]) posByApp.set(p.application_id, p);

    const base = apps.map((a) => {
      const pos = posByApp.get(a.id);
      return {
        app: a,
        commitment: subByApp.get(a.id) ?? Number(a.commitment_cents ?? 0),
        funded: fundedByApp.get(a.id) ?? 0,
        shares: pos?.shares != null ? Number(pos.shares) : null,
        share_class: (pos?.share_class as string) ?? "LP interest",
        override: pos?.ownership_pct_override != null ? Number(pos.ownership_pct_override) : null,
        notified_pct:
          pos?.notified_ownership_pct != null ? Number(pos.notified_ownership_pct) : null,
        notified_committed:
          pos?.notified_committed_cents != null ? Number(pos.notified_committed_cents) : null,
        notified_received:
          pos?.notified_received_cents != null ? Number(pos.notified_received_cents) : null,
      };
    });

    const totalCommitted = base.reduce((s, r) => s + r.commitment, 0);
    const totalFunded = base.reduce((s, r) => s + r.funded, 0);
    const totalShares = base.reduce((s, r) => s + (r.shares ?? 0), 0);
    const pct = (part: number, whole: number) =>
      !whole || whole <= 0 ? 0 : Math.round((part / whole) * 1_000_000) / 10_000;

    const rows: Row[] = base.map((r) => {
      const profile = profileByUser.get(r.app.user_id);
      const byShares = totalShares > 0 && r.shares != null ? pct(r.shares, totalShares) : 0;
      const byMoney = pct(r.commitment, totalCommitted);
      return {
        application_id: r.app.id as string,
        user_id: r.app.user_id as string,
        email: profile?.email ?? null,
        name: profile?.legal_name || profile?.entity_name || "Investor",
        ownership_pct: r.override ?? (byShares || byMoney),
        shares: r.shares,
        share_class: r.share_class,
        commitment_cents: r.commitment,
        funded_cents: r.funded,
        notified_pct: r.notified_pct,
        notified_committed: r.notified_committed,
        notified_received: r.notified_received,
      };
    });

    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    let sent = 0;

    for (const row of rows) {
      if (!row.email) continue;
      const changed =
        row.notified_pct === null ||
        Math.abs(row.notified_pct - row.ownership_pct) >= 0.0001 ||
        row.notified_committed !== row.commitment_cents ||
        row.notified_received !== row.funded_cents;
      if (!changed) continue;
      // Nothing to report to someone with no money and no shares recorded.
      if (row.commitment_cents === 0 && row.funded_cents === 0 && !row.shares) continue;

      const fingerprint = `${row.ownership_pct}-${row.commitment_cents}-${row.funded_cents}`;
      try {
        await sendTemplateEmail("ownership-update", row.email, {
          idempotencyKey: `ownership-${row.application_id}-${fingerprint}`,
          templateData: {
            investorName: row.name,
            offeringName: offering.name,
            ownershipPct: pctLabel(row.ownership_pct),
            previousOwnershipPct:
              row.notified_pct === null ? undefined : pctLabel(row.notified_pct),
            shares: row.shares == null ? undefined : row.shares.toLocaleString("en-US"),
            shareClass: row.share_class,
            committed: money(row.commitment_cents),
            received: money(row.funded_cents),
            fundCommitted: money(totalCommitted),
            fundReceived: money(totalFunded),
            reason,
            portalUrl: `${PORTAL_ORIGIN}/portal`,
          },
        });
        sent += 1;
      } catch {
        // A single failed send should not stop the others.
        continue;
      }

      // Remember what we told them so the next change is the only trigger.
      await supabaseAdmin
        .from("investor_cap_positions")
        .upsert(
          {
            offering_id: offeringId,
            application_id: row.application_id,
            notified_ownership_pct: row.ownership_pct,
            notified_committed_cents: row.commitment_cents,
            notified_received_cents: row.funded_cents,
            notified_at: new Date().toISOString(),
          },
          { onConflict: "application_id" },
        );
    }

    return { sent };
  } catch {
    return { sent: 0 };
  }
}
