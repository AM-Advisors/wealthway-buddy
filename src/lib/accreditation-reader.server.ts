// Server-only: the one rule for "is this investment's investing party accredited?".
// Same rule as investment readiness: the investing party's accreditation for this fund,
// otherwise its general accreditation, otherwise the investment's own questionnaire record.
// Read-only; callers must already be authorized for the applications they pass.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { pickAccreditation, type AccreditationPick } from "@/lib/accreditation-rule";

const db = () => supabaseAdmin as any;

export type EffectiveAccreditation = AccreditationPick;

export async function effectiveAccreditations(applicationIds: string[]): Promise<Map<string, EffectiveAccreditation | null>> {
  const ids = [...new Set(applicationIds.filter(Boolean))];
  const out = new Map<string, EffectiveAccreditation | null>();
  if (!ids.length) return out;
  const [{ data: apps }, { data: onbs }, { data: recs }] = await Promise.all([
    db().from("investor_applications").select("id, offering_id").in("id", ids),
    db().from("investor_onboardings").select("application_id, investment_profile_id, offering_id").in("application_id", ids),
    db().from("accreditation_records").select("*").in("application_id", ids),
  ]);
  const profileIds = [...new Set(((onbs ?? []) as any[]).map((o) => o.investment_profile_id).filter(Boolean))];
  const { data: profAccs } = profileIds.length
    ? await db().from("profile_accreditations").select("profile_id, offering_id, status, verification_method, verified_at, expires_at").in("profile_id", profileIds)
    : { data: [] };
  for (const id of ids) {
    const app = ((apps ?? []) as any[]).find((a) => a.id === id);
    const onb = ((onbs ?? []) as any[]).find((o) => o.application_id === id);
    const partyRows = onb?.investment_profile_id ? ((profAccs ?? []) as any[]).filter((p) => p.profile_id === onb.investment_profile_id) : [];
    const rec = ((recs ?? []) as any[]).find((r) => r.application_id === id) ?? null;
    out.set(id, pickAccreditation(partyRows, onb?.offering_id ?? app?.offering_id ?? null, rec));
  }
  return out;
}
