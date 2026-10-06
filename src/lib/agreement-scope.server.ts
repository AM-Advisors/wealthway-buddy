/** Staff visibility of MSAs/SOWs: who sees which client's agreements. Sales owns them; others see assigned ones only. */
const SEE_ALL = ["admin", "super_admin", "executive", "legal", "finance", "leadership", "cro", "compliance"];
const STAFFISH = ["operations", "account_manager", "sales", "account_executive", "bdr", "sales_management", "client_success", "fund_administration", "tax"];

/** Throws when a scoped staff member opens an agreement outside their clients/funds. Non-staff (clients) pass through. */
export async function assertAgreementVisibleToStaff(userId: string, roles: string[], clientId: string, sowId: string) {
  if (roles.some((r) => SEE_ALL.includes(r))) return;
  if (!roles.some((r) => STAFFISH.includes(r))) return;
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  let people = [userId];
  if (roles.includes("sales_management")) {
    try { const { viewerScope } = await import("./staff-directory.server"); people = [...(await viewerScope(userId)).visible]; } catch { /* self only */ }
  }
  const [{ data: ca }, { data: sow }, { data: fo }] = await Promise.all([
    db.from("client_team_assignments").select("client_id").eq("client_id", clientId).in("user_id", people).limit(1),
    db.from("client_sows").select("id").eq("id", sowId).in("created_by", people).limit(1),
    db.from("fund_team_overrides").select("offering_id, offerings!inner(client_id)").in("user_id", people).eq("offerings.client_id", clientId).limit(1),
  ]);
  if ((ca ?? []).length || (sow ?? []).length || (fo ?? []).length) return;
  throw new Error("This agreement isn't for a client or fund you're assigned to.");
}
