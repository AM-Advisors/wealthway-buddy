import { guard, step, U, N, BATCH } from "./lib";
const d = await guard();
const al = await import("@/lib/allocations.server");
const { data: pos } = await d.from("investor_positions").select("id,display_name,status").eq("offering_id", N);
const { data: ev } = await d.from("commitment_events").select("position_id,event_type,amount_cents,source").eq("offering_id", N);
let tot = 0, called = 0;
for (const p of pos) {
  const mine = ev.filter((e: any) => e.position_id === p.id);
  const commit = mine.filter((e: any) => e.event_type === "original_commitment").reduce((s: number, e: any) => s + Number(e.amount_cents), 0);
  tot += commit;
  const amt = Math.round(commit * 0.4);
  for (const t of ["capital_call", "contribution"] as const) {
    if (mine.some((e: any) => e.event_type === t && e.source === BATCH)) continue;
    await step(`${t} history ${p.display_name}`, () => al.recordCommitmentEvent(U.prep, { positionId: p.id, eventType: t, amountCents: amt, effectiveDate: "2025-12-31", source: BATCH, reason: "Pre-takeover history: 40% called and paid before 2025-12-31 (synthetic source package)" }));
  }
  called += amt;
}
console.log("positions", pos.length, "statuses", [...new Set(pos.map((p: any) => p.status))], "commitments", tot, "historical called/contributed", called);
