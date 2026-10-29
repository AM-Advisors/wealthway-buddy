import { effectiveFundingStatus } from "@/lib/funding-status";

/**
 * Display-only: give application and investment rows the same funding value
 * from both stored copies, so every page shows one funded state. Nothing is
 * written; money posting, admission and reconciliation keep reading their own
 * record. Unreadable lookups fall back to the row's own value.
 */
export async function canonicalizeApplicationFunding<T extends Record<string, any>>(supabase: any, apps: T[]): Promise<T[]> {
  const list = apps.filter((a) => a && "funding_status" in a && a["id"]);
  if (!list.length) return apps;
  try {
    const { data } = await supabase.from("investor_onboardings").select("application_id, funding_status").in("application_id", list.map((a) => a["id"]));
    const by = new Map(((data ?? []) as any[]).map((o) => [o.application_id, o.funding_status as string | null]));
    return apps.map((a) => (a && by.has(a["id"]) ? { ...a, funding_status: effectiveFundingStatus(by.get(a["id"]), a["funding_status"]) } : a));
  } catch {
    return apps;
  }
}

export async function canonicalizeOnboardingFunding<T extends Record<string, any>>(supabase: any, rows: T[]): Promise<T[]> {
  const ids = [...new Set(rows.map((r) => r?.["application_id"]).filter(Boolean))] as string[];
  if (!ids.length) return rows;
  try {
    const { data } = await supabase.from("investor_applications").select("id, funding_status").in("id", ids);
    const by = new Map(((data ?? []) as any[]).map((a) => [a.id, a.funding_status as string | null]));
    return rows.map((r) => (r && "funding_status" in r && by.has(r["application_id"]) ? { ...r, funding_status: effectiveFundingStatus(r["funding_status"], by.get(r["application_id"])) } : r));
  } catch {
    return rows;
  }
}
