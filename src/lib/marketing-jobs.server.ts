/** Scheduler bookkeeping: run each job at most once per slot, record status/stage, detect missed slots. Server-only. */
import { JOBS, missedSlots, shouldRun, slotKey, type JobDef, type JobStatus } from "@/lib/marketing-jobs-model";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;

/** Claims the slot (unique insert = lock + idempotency), runs fn, records the outcome. */
export async function runJob(key: string, now: Date, fn: () => Promise<{ status?: JobStatus; failedStage?: string | null; result?: unknown }>) {
  const job = JOBS.find((j) => j.key === key) as JobDef;
  const db = await admin();
  const slot = slotKey(job, now);
  const { data: prior } = await db.from("marketing_job_runs").select("id, status").eq("job_key", key).eq("slot_key", slot).maybeSingle();
  // A slot previously marked missed can be claimed by catch-up; anything else already ran.
  const ran = !!prior && prior.status !== "missed";
  const d = shouldRun(job, now, ran);
  if (!d.run) return { skipped: true };
  const row = { job_key: key, slot_key: slot, status: "running", started_at: now.toISOString(), catch_up: d.catchUp };
  const claim = prior
    ? await db.from("marketing_job_runs").update(row).eq("id", prior.id).eq("status", "missed").select("id")
    : await db.from("marketing_job_runs").insert(row).select("id");
  if (claim.error || !claim.data?.length) return { skipped: true, reason: "already claimed" };
  const id = claim.data[0].id;
  try {
    const r = await fn();
    await db.from("marketing_job_runs").update({ status: r.status ?? "completed", failed_stage: r.failedStage ?? null, result: (r.result ?? null) as any, finished_at: new Date().toISOString() }).eq("id", id);
    return r.result;
  } catch (e) {
    const msg = String((e as Error).message).slice(0, 500);
    await db.from("marketing_job_runs").update({ status: "failed", failed_stage: "run", error: msg, finished_at: new Date().toISOString() }).eq("id", id);
    console.error(`marketing job ${key}`, e);
    return { error: msg };
  }
}

/** Records missed slots for the last 48 hours (idempotent). */
export async function recordMissed(now: Date) {
  const db = await admin();
  const from = new Date(now.getTime() - 48 * 3600_000);
  const out: Record<string, number> = {};
  for (const job of JOBS) {
    const { data } = await db.from("marketing_job_runs").select("slot_key").eq("job_key", job.key).gte("created_at", new Date(from.getTime() - 86400_000).toISOString()).limit(2000);
    const have = new Set(((data ?? []) as any[]).map((r) => r.slot_key));
    // The scheduler log starts with Phase 0; don't report slots before the first record of any job.
    const { data: first } = await db.from("marketing_job_runs").select("created_at").order("created_at").limit(1);
    const since = first?.[0] ? new Date(Math.max(from.getTime(), new Date(first[0].created_at).getTime())) : now;
    const missed = missedSlots(job, since, now, have);
    if (missed.length) await db.from("marketing_job_runs").upsert(missed.map((s) => ({ job_key: job.key, slot_key: s, status: "missed" })), { onConflict: "job_key,slot_key", ignoreDuplicates: true });
    out[job.key] = missed.length;
  }
  return out;
}

export async function jobHealth() {
  const db = await admin();
  const { data } = await db.from("marketing_job_runs").select("job_key, slot_key, status, started_at, finished_at, failed_stage, error, catch_up").gte("created_at", new Date(Date.now() - 48 * 3600_000).toISOString()).order("slot_key", { ascending: false }).limit(2000);
  const rows = (data ?? []) as any[];
  return JOBS.map((j) => {
    const mine = rows.filter((r) => r.job_key === j.key);
    const last = mine.find((r) => r.status !== "missed");
    return { key: j.key, label: j.label, last: last ?? null, missed: mine.filter((r) => r.status === "missed").length, failed: mine.filter((r) => r.status === "failed" || r.status === "partial").length };
  });
}
