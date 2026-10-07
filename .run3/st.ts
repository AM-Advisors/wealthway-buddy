import { U, step, db } from "./lib";
const al = await import("@/lib/allocations.server");
const [rid, label] = [process.argv[2]!, process.argv[3]!];
const d = await db();
const { data: st } = await d.from("investor_statements").select("id").eq("run_id", rid);
for (const s of st ?? []) {
  await step(`${label} statement review ${s.id.slice(0,6)} (reviewer)`, () => al.decideStatement(U.rev, s.id, "review"));
  await step(`${label} statement approve ${s.id.slice(0,6)} (approver)`, () => al.decideStatement(U.appr, s.id, "approve"));
  await step(`${label} statement publish ${s.id.slice(0,6)} (approver)`, () => al.decideStatement(U.appr, s.id, "publish"));
}
const { data: ca } = await d.from("capital_accounts").select("ending_capital_cents,ownership_pct,period_end,status").eq("allocation_run_id", rid);
console.log("CA", JSON.stringify(ca));
