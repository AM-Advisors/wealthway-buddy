/**
 * Server-only: resolves the countersigner chosen on a fund document. They must still be
 * allowed to sign for that exact fund (assigned manager or active Fund Signatory with a
 * login); their email and name come from their profile, their Person record or their login.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isFundSignerUser } from "@/lib/fund-signatories.server";

export async function resolveFundCountersigner(
  offeringId: string,
  userId: string,
): Promise<{ email: string; name: string } | null> {
  if (!(await isFundSignerUser(offeringId, userId))) return null;
  const db = supabaseAdmin as any;
  const [{ data: profile }, { data: person }, account] = await Promise.all([
    db.from("profiles").select("legal_name, email").eq("user_id", userId).maybeSingle(),
    db.from("persons").select("*").eq("user_id", userId).limit(1).maybeSingle(),
    db.auth.admin.getUserById(userId).catch(() => ({ data: null })),
  ]);
  const email = String(profile?.email ?? person?.email ?? account?.data?.user?.email ?? "").trim().toLowerCase();
  if (!email) return null;
  const personName = [person?.legal_first_name, person?.legal_last_name].filter(Boolean).join(" ").trim();
  const name = String(profile?.legal_name ?? "").trim() || personName || String(person?.preferred_name ?? "").trim() || email;
  return { email, name };
}
