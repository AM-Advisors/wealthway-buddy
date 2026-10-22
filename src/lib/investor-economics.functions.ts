import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const num = (v: unknown) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** What each investor on a fund pays, resolved from recorded rows only. */
export const getInvestorEconomics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ fundId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { classAssignments } = await import("@/lib/fund-setup-phase3.server");
    const ca = await classAssignments(context.userId, data.fundId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const [{ data: fee }, { data: letters }] = await Promise.all([
      db.from("fund_fee_terms").select("management_fee_pct, carry_pct").eq("offering_id", data.fundId).eq("status", "active").maybeSingle(),
      db.from("side_letters").select("id, onboarding_id, status, terms, investor_label").eq("offering_id", data.fundId).in("status", ["active", "proposed"]),
    ]);
    const { letterRates, resolveEconomics } = await import("@/lib/investor-economics-model");
    const classes = ca.classes.map((c: any) => ({ key: c.key, name: c.name, fee: num(c.managementFee?.ratePercent), carry: num(c.carry?.ratePercent) }));
    const defaults = { fee: num(fee?.management_fee_pct), carry: num(fee?.carry_pct) };
    const ls = ((letters ?? []) as any[]).map((l) => ({ id: l.id, onboardingId: l.onboarding_id, status: l.status, label: l.investor_label as string, ...letterRates(l.terms) }));
    return {
      defaults,
      classes,
      rows: resolveEconomics(defaults, classes, ca.investments, ls),
      unlinkedLetters: ls.filter((l) => !l.onboardingId).map((l) => ({ id: l.id, label: l.label, status: l.status, fee: l.fee, carry: l.carry })),
    };
  });

/** Link a side letter created before its investor existed. Staff only; never changes its terms or status. */
export const linkPendingSideLetter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ fundId: z.string().uuid(), sideLetterId: z.string().uuid(), onboardingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { isStaff } = await import("@/lib/fund-tabs.server");
    if (!(await isStaff(context.userId))) throw new Error("Only Harmonious can link a side letter to an investor.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const [{ data: sl }, { data: ob }] = await Promise.all([
      db.from("side_letters").select("id, offering_id, onboarding_id").eq("id", data.sideLetterId).maybeSingle(),
      db.from("investor_onboardings").select("id, offering_id, person_id").eq("id", data.onboardingId).maybeSingle(),
    ]);
    if (!sl || sl.offering_id !== data.fundId) throw new Error("Side letter not found.");
    if (sl.onboarding_id) throw new Error("This side letter is already linked to an investor.");
    if (!ob || ob.offering_id !== data.fundId) throw new Error("That investor is not on this fund.");
    const { error } = await db.from("side_letters").update({ onboarding_id: ob.id, person_id: ob.person_id }).eq("id", sl.id).is("onboarding_id", null);
    if (error) throw new Error("Could not link the side letter.");
    await db.from("side_letter_events").insert({ offering_id: data.fundId, side_letter_id: sl.id, event: "linked_investor", actor_id: context.userId, detail: { onboarding_id: ob.id } });
    return { ok: true };
  });
