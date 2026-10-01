import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildFundCapTable, readTerms, type ClassTerms } from "@/lib/fund-cap-table";

const STAFF_ROLES = ["admin", "super_admin", "operations", "fund_administration", "legal", "compliance"];

/** Read-only Fund Cap Table. Re-checks the caller's relationship to the exact Fund every call. */
export const getFundCapTable = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ fundId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const uid = context.userId;
    const [{ data: roles }, { data: mgr }, { data: grant }] = await Promise.all([
      db.from("user_roles").select("role").eq("user_id", uid),
      db.from("fund_managers").select("id").eq("user_id", uid).eq("offering_id", data.fundId).maybeSingle(),
      db.from("fund_team_grants").select("expires_at, granted_by").eq("grantee_user_id", uid)
        .eq("offering_id", data.fundId).eq("status", "active").maybeSingle(),
    ]);
    let allowed = ((roles ?? []) as any[]).some((r) => STAFF_ROLES.includes(r.role)) || !!mgr;
    if (!allowed && grant && (!grant.expires_at || new Date(grant.expires_at) > new Date())) {
      const { data: g } = await db.from("fund_managers").select("id").eq("user_id", grant.granted_by)
        .eq("offering_id", data.fundId).maybeSingle();
      allowed = !!g;
    }
    if (!allowed) throw new Error("You don't have access to this Fund's cap table.");

    const { data: setup } = await db.from("fund_setups").select("id").eq("offering_id", data.fundId).maybeSingle();
    const [{ data: obs }, { data: letters }, { data: econ }] = await Promise.all([
      db.from("investor_onboardings")
        .select("id, stage, funding_status, offering_class_key, commitment_amount_cents, accepted_amount_cents, requested_amount_cents, funded_amount_cents, unit_count, removed_at, persons(legal_first_name, legal_last_name, preferred_name), investment_profiles(display_name, legal_name)")
        .eq("offering_id", data.fundId),
      db.from("side_letters").select("id, onboarding_id, status, mfn_enabled, effective_date, expiry_date, terms").eq("offering_id", data.fundId),
      setup
        ? db.from("fund_economics_versions").select("terms, classes").eq("setup_id", setup.id).eq("status", "approved")
            .order("version", { ascending: false }).limit(1).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const baseTerms = readTerms(econ?.terms);
    const classTerms: Record<string, ClassTerms> = {};
    for (const c of (Array.isArray(econ?.classes) ? econ.classes : []) as any[]) {
      const key = c?.key ?? c?.classKey ?? c?.name;
      if (key) classTerms[String(key)] = { ...baseTerms, ...stripNull(readTerms(c?.terms ?? c)) };
    }

    const table = buildFundCapTable(
      ((obs ?? []) as any[]).map((o) => {
        const p = o.persons;
        const name = p ? p.preferred_name || [p.legal_first_name, p.legal_last_name].filter(Boolean).join(" ") : "";
        return {
          id: o.id,
          investorName: name || "Unnamed investor",
          profileName: o.investment_profiles?.display_name || o.investment_profiles?.legal_name || null,
          classKey: o.offering_class_key,
          stage: o.stage,
          fundingStatus: o.funding_status,
          commitmentCents: o.commitment_amount_cents ?? o.accepted_amount_cents ?? o.requested_amount_cents,
          acceptedCents: o.accepted_amount_cents,
          fundedCents: o.funded_amount_cents,
          units: o.unit_count == null ? null : Number(o.unit_count),
          removed: !!o.removed_at,
        };
      }),
      classTerms,
      baseTerms,
      ((letters ?? []) as any[]).map((l) => ({
        id: l.id, onboardingId: l.onboarding_id, status: l.status, mfnEnabled: l.mfn_enabled,
        effectiveDate: l.effective_date, expiryDate: l.expiry_date, terms: Array.isArray(l.terms) ? l.terms : [],
      })),
    );
    return { ...table, hasApprovedTerms: !!econ };
  });

function stripNull(t: ClassTerms): Partial<ClassTerms> {
  return Object.fromEntries(Object.entries(t).filter(([, v]) => v != null)) as Partial<ClassTerms>;
}
