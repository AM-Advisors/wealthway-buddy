/**
 * Controlled client notifications for high-value transitions only (approval required, information required,
 * request completed, material update). Uses the existing notification_events outbox → fund managers' email;
 * bodies carry status wording only, never amounts, investor or bank data. Staff are notified through tasks.
 */
export async function notifyFundManagers(fundId: string, kind: "approval_required" | "information_required" | "request_completed" | "material_update", title: string, portalPath: string, eventRef?: string) {
  const db = (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
  const copy = {
    approval_required: ["Your approval is required", `Harmonious has prepared "${title}" and needs your approval before proceeding.`],
    information_required: ["Information required", `Harmonious needs information from you to continue "${title}".`],
    request_completed: ["Request completed", `"${title}" is complete.`],
    material_update: ["Request update", `There is an update on "${title}".`],
  }[kind];
  await db.from("notification_events").insert({
    event_kind: "client_work_update", offering_id: fundId, field: kind,
    metadata: { audience: "managers", headline: copy[0], intro: copy[1], portal_path: portalPath },
  }).then(() => undefined, () => undefined);
  // In-portal bell notice for each manager of this fund (status wording only).
  try {
    const { data: mgrs } = await db.from("fund_managers").select("user_id").eq("offering_id", fundId);
    const { data: off } = await db.from("offerings").select("client_id").eq("id", fundId).maybeSingle();
    const rows = ((mgrs ?? []) as any[]).filter((m) => m.user_id).map((m) => ({
      user_id: m.user_id, client_id: off?.client_id ?? null, kind, title: copy[0], body: copy[1], path: portalPath,
      dedupe_key: `${kind}:${fundId}:${eventRef ?? `${title}:${new Date().toISOString().slice(0, 13)}`}`,
    }));
    if (rows.length) for (const r of rows) await db.from("client_notifications").insert(r).then(() => undefined, () => undefined);
  } catch { /* best effort */ }
  try { (await import("@/lib/manager-alerts.server")).kickManagerAlerts(); } catch { /* best effort */ }
}
