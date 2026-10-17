import { migrationApplies, type FundOrigin } from "@/lib/fund-origin";
export async function requireMigrationFund(offeringId: string) {
  const db = (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
  const { data, error } = await db.from("offerings").select("fund_origin").eq("id", offeringId).single();
  if (error) throw new Error(error.message);
  if (!migrationApplies(data?.fund_origin)) throw new Error("Mark this fund as Migration in Fund Setup before using migration steps.");
}
export async function saveFundOrigin(userId: string, offeringId: string, origin: FundOrigin, reason: string) {
  await (await import("@/lib/investor-onboarding.server")).assertStaff(userId);
  const db = (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
  const { data: fund, error: readError } = await db.from("offerings").select("fund_origin").eq("id", offeringId).single();
  if (readError) throw new Error(readError.message);
  if (fund.fund_origin === origin) return { ok: true };
  const { error } = await db.from("offerings").update({ fund_origin: origin }).eq("id", offeringId);
  if (error) throw new Error(error.message);
  await (await import("@/lib/fund-audit.server")).logFundAudit(userId, { offeringId, eventType: "fund_origin_changed", summary: `Fund classified as ${origin}: ${reason}`, values: { previousOrigin: fund.fund_origin, fundOrigin: origin, reason } });
  return { ok: true };
}
