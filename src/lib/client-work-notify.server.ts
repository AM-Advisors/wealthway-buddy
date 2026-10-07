/**
 * Controlled client notifications for high-value transitions only (approval required, information required,
 * request completed, material update). Uses the existing notification_events outbox → fund managers' email;
 * bodies carry status wording only — never amounts, investor or bank data. Staff are notified through tasks.
 */
export async function notifyFundManagers(fundId: string, kind: "approval_required" | "information_required" | "request_completed" | "material_update", title: string, portalPath: string) {
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
  try { (await import("@/lib/manager-alerts.server")).kickManagerAlerts(); } catch { /* best effort */ }
}
