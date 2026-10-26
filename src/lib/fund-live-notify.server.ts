/**
 * Emails a fund's managers and team when the fund launches. Best-effort:
 * never throws, never blocks or undoes the launch. Investors are not emailed.
 */
export function fundLiveKey(setupId: string, userId: string) {
  return `fund-live-${setupId}-${userId}`;
}

export function fundLiveRecipients(people: { user_id: string | null; email: string | null; legal_name?: string | null }[]) {
  const seen = new Set<string>();
  const out: { userId: string; email: string; name: string | null }[] = [];
  for (const p of people) {
    const email = (p.email ?? "").trim().toLowerCase();
    if (!p.user_id || !email || seen.has(email)) continue;
    seen.add(email);
    out.push({ userId: p.user_id, email, name: p.legal_name ?? null });
  }
  return out;
}

export async function notifyFundLive(n: { setupId: string; offeringId: string; fundName: string; onboardingUrl: string }) {
  let sent = 0, skipped = 0, failed = 0;
  try {
    const { supabaseAdmin: db } = (await import("@/integrations/supabase/client.server")) as any;
    const { data: mgrs } = await db.from("fund_managers").select("user_id").eq("offering_id", n.offeringId);
    const ids = ((mgrs ?? []) as any[]).map((m) => m.user_id).filter(Boolean);
    if (!ids.length) return { sent, skipped, failed };
    const { data: people } = await db.from("profiles").select("user_id, legal_name, email").in("user_id", ids);
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const launchDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "America/Chicago" });
    for (const r of fundLiveRecipients((people ?? []) as any[])) {
      try {
        const res = await sendTemplateEmail("fund-live", r.email, {
          managed: true,
          idempotencyKey: fundLiveKey(n.setupId, r.userId),
          templateData: {
            name: r.name ?? undefined,
            fundName: n.fundName,
            launchDate,
            onboardingUrl: n.onboardingUrl,
            fundUrl: `https://app.harmonious.co/client/funds/${n.offeringId}`,
          },
        });
        if (res.sent) sent++; else skipped++;
      } catch (e) {
        failed++;
        console.error("[fund-live] send failed", (e as Error)?.message);
      }
    }
  } catch (e) {
    console.error("[fund-live] notify failed", (e as Error)?.message);
  }
  return { sent, skipped, failed };
}
