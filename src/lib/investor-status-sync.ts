import { canonicalizeApplications } from "@/lib/verification-status";

/**
 * Accounts whose investor screens deliberately keep their stored status
 * (owner decision): apoorva@harmonious.co and the walkthrough test investor.
 */
export const STATUS_SYNC_EXCLUDED_USER_IDS = new Set<string>([
  "7ba9caee-11bd-43b4-930c-3650af3d6f78",
  "9bf16b0e-4ead-4ba1-8906-687efed81e99",
]);

/** Display-only: investor screens read the same identity/screening/funding facts as manager views. */
export async function syncInvestorApplications<T extends Record<string, any>>(supabase: any, apps: T[], userId: string): Promise<T[]> {
  if (!apps.length || STATUS_SYNC_EXCLUDED_USER_IDS.has(userId)) return apps;
  return canonicalizeApplications(supabase, apps, userId);
}
