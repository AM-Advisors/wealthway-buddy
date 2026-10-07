import { N, U, step, db } from "./lib";
const nav = await import("@/lib/nav.server");
const al = await import("@/lib/allocations.server");
const asOf = process.argv[2]!, label = process.argv[3]!;
const d = await db();
const n: any = process.argv[4] ? { nav: { id: process.argv[4] } } : await step(`${label} NAV calculate (preparer)`, () => nav.calculateNAV(U.prep, { offeringId: N, asOfDate: asOf, frequency: "monthly" as any }));
const nid = n?.nav?.id ?? n?.navVersionId ?? n?.id;
const nv = (await d.from("nav_versions").select("*").eq("id", nid).single()).data;
console.log("NAV", JSON.stringify({ nav: nv.nav_cents ?? nv.net_asset_value_cents, keys: Object.keys(nv).filter((k) => /cents|status|unexpl/.test(k)).map((k) => [k, nv[k]]) }));
const { data: checks } = await d.from("nav_checks").select("check_key,status,severity,override_reason").eq("nav_version_id", nid);
console.log("CHECKS", JSON.stringify(checks));
if (!process.argv[5]) {
await step(`${label} NAV submit (preparer)`, () => nav.submitNavForReview(U.prep, nid));
await step(`${label} preparer cannot review own NAV`, () => nav.reviewNav(U.prep, nid), true);
await step(`${label} NAV review (reviewer)`, () => nav.reviewNav(U.rev, nid));
await step(`${label} NAV approve (approver)`, () => nav.approveNav(U.appr, nid));
await step(`${label} NAV publish (approver)`, () => nav.publishNav(U.appr, nid));
}
const run: any = process.argv[5] ? { run: { id: process.argv[5] } } : await step(`${label} allocations calculate (preparer)`, () => al.calculateAllocations(U.prep, { navId: nid }));
const rid = run?.run?.id ?? run?.runId ?? run?.id;
if (process.argv[6] === "fixup") await step(`${label} return run from manager_review (no reviewer recorded)`, () => al.decideAllocationRun(U.rev, rid, "return", "[QA] reached manager review without a recorded reviewer"));
await step(`${label} allocations review (reviewer)`, () => al.decideAllocationRun(U.rev, rid, "review"));
await step(`${label} manager acknowledges allocations`, () => al.managerRespondToAllocations(U.mgr, rid, "acknowledge", "[QA] reviewed"));
await step(`${label} allocations approve (approver)`, () => al.decideAllocationRun(U.appr, rid, "approve"));
await step(`${label} allocations finalize (approver)`, () => al.finalizeAllocationRun(U.appr, rid));
const { data: lines } = await d.from("allocation_lines").select("display_name:position_id, ownership_pct, ending_capital_cents").eq("run_id", rid);
const sum = (lines ?? []).reduce((t: number, l: any) => t + Number(l.ending_capital_cents), 0);
console.log("ALLOC", JSON.stringify({ sum, lines: lines?.map((l: any) => [Number(l.ownership_pct), Number(l.ending_capital_cents)]) }));
await step(`${label} statements generate (preparer)`, () => al.generateStatements(U.prep, rid));
const { data: st } = await d.from("investor_statements").select("id").eq("run_id", rid);
for (const s of st ?? []) {
  await step(`${label} statement review ${s.id.slice(0,6)} (reviewer)`, () => al.decideStatement(U.rev, s.id, "review"));
  await step(`${label} statement approve ${s.id.slice(0,6)} (approver)`, () => al.decideStatement(U.appr, s.id, "approve"));
  await step(`${label} statement publish ${s.id.slice(0,6)} (approver)`, () => al.decideStatement(U.appr, s.id, "publish"));
}
console.log("IDS", nid, rid);
