const { supabaseAdmin } = await import("./src/integrations/supabase/client.server");
const db: any = supabaseAdmin;
const m: any = await import("./src/lib/investor-onboarding.server");
const { data: onbs } = await db.from("investor_onboardings").select("*").not("stage", "in", "(declined,cancelled)").limit(5000);
let ok = 0, bad = 0;
for (let i = 0; i < onbs.length; i += 10) {
  await Promise.all(onbs.slice(i, i + 10).map(async (r: any) => { try { const { result } = await m.computeReadinessFor(r); await m.saveReadinessSummary(r, result); ok++; } catch { bad++; } }));
}
console.log("saved", ok, "failed", bad);
process.exit(0);
