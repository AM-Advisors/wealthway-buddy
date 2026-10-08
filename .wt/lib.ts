import { appendFileSync } from "node:fs";
export const BATCH = "WALKTHROUGH-Q1-2026";
export const N = "4014f341-8d38-4afc-9c18-ee21f8ae9224";
export const U = { prep: "f5bc5e2b-3a60-478c-86ba-43a1746b8e93", rev: "a8ec5dd2-8441-40c4-93b4-5e2f31930c87", appr: "241ec1fe-0df1-46b4-a607-a9804bcb7872" };
export const LOG = "/tmp/wt/log.jsonl";
export async function db() { const { supabaseAdmin } = await import("@/integrations/supabase/client.server"); return supabaseAdmin as any; }
/** Hard guard: refuse to run against anything but the TEST/DEMO Walkthrough fund. */
export async function guard() {
  const d = await db();
  const { data } = await d.from("offerings").select("id,name,client_id,clients(is_test_demo)").eq("id", N).single();
  if (!data || data.name !== "Harmonious Walkthrough Fund" || data.clients?.is_test_demo !== true) throw new Error("GUARD: target is not the TEST/DEMO Walkthrough fund - refusing");
  return d;
}
export async function step<T>(name: string, fn: () => Promise<T>, expectFail = false): Promise<T | undefined> {
  try { const r = await fn(); const s = JSON.stringify(r ?? null); console.log(`${expectFail ? "UNEXPECTED-OK" : "OK"} ${name}: ${s.slice(0, 300)}`); appendFileSync(LOG, JSON.stringify({ name, ok: true, at: new Date().toISOString() }) + "\n"); return r; }
  catch (e: any) { const m = e?.message ?? String(e); console.log(`${expectFail ? "BLOCKED-AS-EXPECTED" : "FAIL"} ${name}: ${m}`); appendFileSync(LOG, JSON.stringify({ name, ok: false, err: m }) + "\n"); if (!expectFail) throw e; }
}
