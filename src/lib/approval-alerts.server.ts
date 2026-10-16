/**
 * Sweep: posts one #operations Slack notice per item newly waiting on a
 * Harmonious review/approval (any workflow in the Operations work queue).
 * Best-effort, once per item; the first run records the existing backlog
 * silently so Slack isn't flooded.
 */
export type AlertableItem = { id: string; title: string; requiredAction: string; fundId?: string | null; clientId?: string | null; recordType?: string };

/** Pure, for tests. */
export function alertTitle(i: Pick<AlertableItem, "title" | "requiredAction">) {
  return `${i.requiredAction === "approve" ? "Approval needed" : "Review needed"}: ${i.title}`;
}

export async function runApprovalAlerts(): Promise<{ checked: number; sent: number; baseline: boolean }> {
  const db = (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
  const { pendingApprovalItemsForAlerts } = await import("@/lib/ops-work-queue.server");
  const { destinationFor } = await import("@/lib/ops-work-items");
  const items = await pendingApprovalItemsForAlerts(db);
  const keys = items.map((i) => `approval_needed:${i.id}`);
  const { count } = await db.from("ops_slack_notifications").select("dedupe_key", { count: "exact", head: true }).eq("kind", "approval_needed");
  if (!count) {
    // First run: remember today's backlog without posting.
    const rows = keys.map((k) => ({ dedupe_key: k, kind: "approval_needed", status: "baseline" }));
    if (rows.length) await db.from("ops_slack_notifications").upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true });
    else await db.from("ops_slack_notifications").upsert([{ dedupe_key: "approval_needed:__start", kind: "approval_needed", status: "baseline" }], { onConflict: "dedupe_key", ignoreDuplicates: true });
    return { checked: items.length, sent: 0, baseline: true };
  }
  const seen = new Set<string>();
  for (let i = 0; i < keys.length; i += 200) {
    const { data } = await db.from("ops_slack_notifications").select("dedupe_key").in("dedupe_key", keys.slice(i, i + 200));
    for (const r of data ?? []) seen.add(r.dedupe_key);
  }
  const { notifySubmission } = await import("@/lib/ops-slack-notify.server");
  let sent = 0;
  for (const item of items) {
    if (seen.has(`approval_needed:${item.id}`) || sent >= 25) continue;
    let path: string | null = null;
    try { const d = destinationFor(item as any) as any; path = typeof d === "string" ? d : null; } catch { path = null; }
    await notifySubmission({ kind: "approval_needed", once: true, ref: item.id, title: alertTitle(item), offeringId: item.fundId ?? null, clientId: item.clientId ?? null, path: path && path.startsWith("/") ? path : "/ops/queue" });
    sent += 1;
  }
  return { checked: items.length, sent, baseline: false };
}
