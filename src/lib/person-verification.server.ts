// Server-only: the one place screens read a person's identity check result.
// The person's account (login) check is their single ID check and counts for every
// investment. Older per-investment checks are history; they never decide a status on
// their own once the person has a decided account check. Display-only, nothing is written.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadPersonStatuses, toStored, canonicalVerificationStatus } from "@/lib/verification-status";

const db = () => supabaseAdmin as any;

/** Current ID and screening result per login account, in the stored vocabulary. */
export async function personVerificationByUser(userIds: string[]) {
  const ids = [...new Set(userIds.filter(Boolean))];
  const map = await loadPersonStatuses(db(), ids);
  const out = new Map<string, { kyc: string | null; aml: string | null }>();
  for (const id of ids) {
    const r = map.get(id);
    out.set(id, {
      kyc: r?.kyc ? toStored(canonicalVerificationStatus(r.kyc)) : null,
      aml: r?.aml ? toStored(canonicalVerificationStatus(r.aml)) : null,
    });
  }
  return out;
}

/** Persons whose ID is already approved through their account check or person record. */
export async function identityApprovedPersons(personIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(personIds.filter(Boolean))];
  if (!ids.length) return new Set();
  const { data: people } = await db().from("persons").select("id, user_id, kyc_status").in("id", ids);
  const rows = (people ?? []) as { id: string; user_id: string | null; kyc_status: string | null }[];
  const byUser = await personVerificationByUser(rows.map((p) => p.user_id ?? "").filter(Boolean));
  const out = new Set<string>();
  for (const p of rows) {
    const k = (p.user_id && byUser.get(p.user_id)?.kyc) || p.kyc_status;
    if (k === "approved") out.add(p.id);
  }
  return out;
}
