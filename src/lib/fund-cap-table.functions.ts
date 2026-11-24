import { canonicalizeOnboardingFunding } from "@/lib/funding-canonical";
import { investmentAmountCents } from "@/lib/investment-amounts";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";
import { buildFundCapTable, readTerms, type ClassTerms } from "@/lib/fund-cap-table";


/** Read-only Fund Cap Table. Re-checks the caller's relationship to the exact Fund every call. */
export const getFundCapTable = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ fundId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const uid = context.userId;
    // Shared fund check ("manage": fund operations staff, this fund's managers, active client members),
    // plus the older per-fund team grant whose granting manager is still on this fund.
    const { fundAccessAllows, fundMembershipAllows, fundAccessDb } = await import("@/lib/fund-access.server");
    let allowed = await fundAccessAllows(await fundAccessDb(), uid, data.fundId, "manage");
    if (!allowed) {
      const { data: grant } = await db.from("fund_team_grants").select("expires_at, granted_by").eq("grantee_user_id", uid)
        .eq("offering_id", data.fundId).eq("status", "active").maybeSingle();
      if (grant && (!grant.expires_at || new Date(grant.expires_at) > new Date())) {
        allowed = await fundMembershipAllows(await fundAccessDb(), grant.granted_by, data.fundId, "manager");
      }
    }
    if (!allowed) throw new Error("You don't have access to this Fund's cap table.");

    const { data: setup } = await db.from("fund_setups").select("id").eq("offering_id", data.fundId).maybeSingle();
    const [{ data: obs }, { data: letters }, { data: econ }] = await Promise.all([
      db.from("investor_onboardings")
        .select("id, stage, funding_status, offering_class_key, commitment_amount_cents, accepted_amount_cents, requested_amount_cents, funded_amount_cents, unit_count, removed_at, person_id, investment_profile_id, application_id")
        .eq("offering_id", data.fundId).eq("is_test_investor", false), // test investors are never holders
      db.from("side_letters").select("id, onboarding_id, status, mfn_enabled, effective_date, expiry_date, terms").eq("offering_id", data.fundId),
      setup
        ? db.from("fund_economics_versions").select("terms, classes").eq("setup_id", setup.id).eq("status", "approved")
            .order("version", { ascending: false }).limit(1).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    // No declared FK from onboardings to persons/profiles, so names are joined here.
    const pIds = [...new Set(((obs ?? []) as any[]).map((o) => o.person_id).filter(Boolean))];
    const prIds = [...new Set(((obs ?? []) as any[]).map((o) => o.investment_profile_id).filter(Boolean))];
    const [{ data: ppl }, { data: profs }] = await Promise.all([
      pIds.length ? db.from("persons").select("id, legal_first_name, legal_last_name, preferred_name").in("id", pIds) : { data: [] },
      prIds.length ? db.from("investment_profiles").select("id, legal_name").in("id", prIds) : { data: [] },
    ]);
    const pMap = new Map(((ppl ?? []) as any[]).map((x) => [x.id, x]));
    const prMap = new Map(((profs ?? []) as any[]).map((x) => [x.id, x]));
    for (const o of (obs ?? []) as any[]) { o.persons = pMap.get(o.person_id) ?? null; o.investment_profiles = prMap.get(o.investment_profile_id) ?? null; }
    const baseTerms = readTerms(econ?.terms);
    const classTerms: Record<string, ClassTerms> = {};
    for (const c of (Array.isArray(econ?.classes) ? econ.classes : []) as any[]) {
      const key = c?.key ?? c?.classKey ?? c?.name;
      if (key) classTerms[String(key)] = { ...baseTerms, ...stripNull(readTerms(c?.terms ?? c)) };
    }

    const table = buildFundCapTable(
      (await canonicalizeOnboardingFunding(db, (obs ?? []) as any[])).map((o: any) => {
        const p = o.persons;
        const name = p ? p.preferred_name || [p.legal_first_name, p.legal_last_name].filter(Boolean).join(" ") : "";
        return {
          id: o.id,
          investorName: name || "Unnamed investor",
          profileName: o.investment_profiles?.legal_name || null,
          classKey: o.offering_class_key,
          stage: o.stage,
          fundingStatus: o.funding_status,
          commitmentCents: investmentAmountCents(o),
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

/** True when the user belongs to the Client that owns this Fund, or manages it (client portal access). */
export async function isClientMemberOfFund(db: any, uid: string, fundId: string): Promise<boolean> {
  // One reader for client membership of a fund, shared with the fund access check.
  const { clientMemberOfFund } = await import("@/lib/fund-access.server");
  return clientMemberOfFund(db, uid, fundId);
}

/** Client-portal Fund page: details, setup progress, Harmonious steps and side letter summary. */
export const getClientFund = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ fundId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const uid = context.userId;
    // Shared fund check: fund operations staff or a member of the fund's client.
    const { fundAccessFor, fundAccessDb } = await import("@/lib/fund-access.server");
    const access = await fundAccessFor(await fundAccessDb(), uid, data.fundId, "manage");
    if (!access.staff && !access.clientMember) throw new Error("You don't have access to this Fund.");

    const { data: f } = await db
      .from("offerings")
      .select("id, name, legal_entity_name, reg_type, is_open, fund_type, fund_type_other, entity_type, state_formed, date_formed, target_raise_cents, fund_origin")
      .eq("id", data.fundId)
      .maybeSingle();
    if (!f) throw new Error("Fund not found.");
    const { data: setup } = await db.from("fund_setups").select("id, stage, launch_state").eq("offering_id", data.fundId).maybeSingle();
    const [{ data: tasks }, { data: letters }] = await Promise.all([
      setup
        ? db.from("fund_setup_tasks").select("id, label, description, section, status, responsible_party, response, notes, due_date, sort_order, blocking").eq("setup_id", setup.id).eq("blocking", true).order("sort_order")
        : Promise.resolve({ data: [] }),
      db.from("side_letters").select("status").eq("offering_id", data.fundId),
    ]);
    // Optional (non-blocking) tasks such as naming outside service providers never affect setup %.
    const all = (tasks ?? []) as any[];
    const done = (t: any) => ["complete", "completed", "done", "not_applicable", "waived"].includes(String(t.status));
    const percent = all.length ? Math.round((all.filter(done).length / all.length) * 100) : null;
    const steps = all.map((t) => ({
      id: String(t.id),
      label: String(t.label),
      description: t.description ? String(t.description) : null,
      section: t.section ? String(t.section) : null,
      status: String(t.status),
      dueDate: t.due_date ? String(t.due_date) : null,
      answer: typeof t.response?.answer === "string" ? String(t.response.answer) : "",
      done: done(t),
      owner: String(t.responsible_party ?? "").toLowerCase().includes("client") ? "You" : "Harmonious",
    }));
    const ls = (letters ?? []) as any[];
    return {
      fund: f as Record<string, any>,
      setup: { percent, stage: setup?.stage ?? null, launchState: setup?.launch_state ?? null },
      steps,
      sideLetters: { active: ls.filter((l) => l.status === "active").length, proposed: ls.filter((l) => l.status === "proposed").length },
    };
  });
