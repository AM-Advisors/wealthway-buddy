import { appendFileSync } from "node:fs";
export const N = "85b6aae4-df2e-4f44-bd9b-c899b4f0104e";
export const U = { prep: "f5bc5e2b-3a60-478c-86ba-43a1746b8e93", rev: "a8ec5dd2-8441-40c4-93b4-5e2f31930c87", appr: "241ec1fe-0df1-46b4-a607-a9804bcb7872", mgr: "e2398bf5-2899-46eb-b059-5f5e863b3b93" };
export const LOG = "/tmp/run3/log.jsonl";
export async function step<T>(name: string, fn: () => Promise<T>, expectFail = false): Promise<T | undefined> {
  try {
    const r = await fn();
    const s = JSON.stringify(r ?? null);
    console.log(`${expectFail ? "UNEXPECTED-OK" : "OK"} ${name}: ${s.slice(0, 300)}`);
    appendFileSync(LOG, JSON.stringify({ name, ok: true, expectFail, at: new Date().toISOString(), result: s.slice(0, 2000) }) + "\n");
    return r;
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    console.log(`${expectFail ? "BLOCKED-AS-EXPECTED" : "FAIL"} ${name}: ${msg}`);
    appendFileSync(LOG, JSON.stringify({ name, ok: false, expectFail, at: new Date().toISOString(), error: msg }) + "\n");
    if (!expectFail) throw e;
  }
}
export async function db() { const { supabaseAdmin } = await import("@/integrations/supabase/client.server"); return supabaseAdmin as any; }
