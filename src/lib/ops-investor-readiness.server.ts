import { investorCheckRows } from "@/lib/ops-records";

/** Called only after the Operations record/tab gate. Scope rows before loading canonical facts. */
export async function opsInvestorReadiness(s: any, investorUserId: string) {
  const { data, error } = await s.from("investor_onboardings").select("*")
    .eq("investor_user_id", investorUserId).order("created_at", { ascending: false });
  if (error) throw new Error("Investor readiness could not be loaded.");
  const onboardings = (data ?? []) as any[];
  const fundIds = [...new Set(onboardings.map((o) => o.offering_id).filter(Boolean))];
  const funds = fundIds.length
    ? await s.from("offerings").select("id, name").in("id", fundIds)
    : { data: [], error: null };
  if (funds.error) throw new Error("Investor funds could not be loaded.");
  // One shared batched loader, not a live query loop per investment. Never saves summaries or decisions.
  const { readinessForMany } = await import("@/lib/investor-onboarding.server");
  const computed = await readinessForMany(onboardings);
  const names = new Map<string, string>((funds.data ?? []).map((f: any) => [f.id, f.name]));
  const labels = new Map<string, string>();
  for (const { facts } of computed) {
    if (facts?.profile?.id && facts.profile.display_label) labels.set(facts.profile.id, facts.profile.display_label);
  }
  return {
    onboardings,
    checks: investorCheckRows(onboardings, computed.map((c) => c.result), names, labels),
    investmentReadiness: onboardings.map((o, index) => ({
      onboardingId: o.id,
      offeringId: o.offering_id,
      fundName: names.get(o.offering_id) ?? "Fund",
      profileLabel: o.investment_profile_id ? labels.get(o.investment_profile_id) ?? null : null,
      readiness: computed[index]?.result ?? null,
    })),
  };
}