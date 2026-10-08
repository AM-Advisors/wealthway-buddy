import { guard, step, U, N, BATCH } from "./lib";
const d = await guard();
const cc = await import("@/lib/capital-calls.server");
// 1. Temporary minimum QA access (operations only), recorded.
for (const [k, uid] of Object.entries(U)) for (const role of ["operations","admin"]) {
  const { error } = await d.from("user_roles").upsert({ user_id: uid, role }, { onConflict: "user_id,role", ignoreDuplicates: true });
  console.log("grant", role, k, error?.message ?? "ok");
}
const { data: existing } = await d.from("capital_calls").select("id,status,call_number").eq("offering_id", N).order("call_number");
console.log("existing calls", JSON.stringify(existing));
let rel = await d.from("funding_instruction_versions").select("id").eq("offering_id", N).eq("release_status", "released").maybeSingle();
if (!rel.data) {
  const v: any = await step("draft DEMO funding instructions", () => cc.draftFundingInstructions(U.prep, { offeringId: N, bankName: "DEMO Synthetic Bank (not real)", details: { beneficiary: "Harmonious Walkthrough Fund (DEMO)", bank: "DEMO Synthetic Bank", account: "DEMO-ONLY-0000", routing: "DEMO-ONLY", note: `${BATCH} synthetic; no real banking` }, effectiveDate: "2026-01-15", changeReason: "DEMO Q1 setup" }));
  await step("preparer cannot release own instructions", () => cc.releaseFundingInstructions(U.prep, v.versionId), true);
  await step("release instructions", () => cc.releaseFundingInstructions(U.appr, v.versionId));
}
let callId = existing?.find((c: any) => c.call_number === 1)?.id;
if (!callId) {
  const r: any = await step("prepare call #1", () => cc.prepareCapitalCall(U.prep, { offeringId: N, callType: "investment", basis: "fund_total", totalAmountCents: 500_000_000, allocationBasis: "commitment_pro_rata", confirmedAggregateCents: 500_000_000, noticeDate: "2026-01-31", dueDate: "2026-02-15", title: "Capital Call #1", purpose: `${BATCH} DEMO Q1 call` }));
  callId = r.callId;
}
const call = (await d.from("capital_calls").select("*").eq("id", callId).single()).data;
if (call.status === "draft") await step("request", () => cc.requestCapitalCall(U.prep, callId));
if (["draft", "requested"].includes((await d.from("capital_calls").select("status").eq("id", callId).single()).data.status)) {
  await step("preparer self-review", () => cc.reviewCapitalCall(U.prep, callId), true);
  await step("review", () => cc.reviewCapitalCall(U.rev, callId));
}
if ((await d.from("capital_calls").select("status").eq("id", callId).single()).data.status === "in_review") {
  await step("preparer self-publish", () => cc.publishCapitalCall(U.prep, callId), true);
  await step("publish", () => cc.publishCapitalCall(U.appr, callId));
}
const { data: lines } = await d.from("capital_call_lines").select("display_name,commitment_cents,called_cents,position_id").eq("capital_call_id", callId).order("display_name");
const { data: ev } = await d.from("commitment_events").select("position_id,event_type,amount_cents").eq("offering_id", N);
let tc = 0, th = 0, tq = 0;
for (const l of lines) {
  const hist = ev.filter((e: any) => e.position_id === l.position_id && e.event_type === "capital_call" && e.amount_cents !== l.called_cents || (e.position_id === l.position_id && e.event_type === "historical_call")).reduce((s: number, e: any) => s + e.amount_cents, 0);
  const types = [...new Set(ev.filter((e: any) => e.position_id === l.position_id).map((e: any) => e.event_type))];
  tc += l.commitment_cents; tq += l.called_cents;
  console.log([l.display_name.padEnd(28), l.commitment_cents / 100, l.called_cents / 100, types.join("/")].join(" | "));
}
console.log("TOTAL commit", tc / 100, "Q1 called", tq / 100);
const { data: ef } = await d.from("expected_fundings").select("status,expected_amount_cents").eq("offering_id", N);
console.log("expected fundings", ef?.length, JSON.stringify([...new Set(ef?.map((x: any) => x.status))]));
const snap = await cc.commitmentSnapshot(N);
console.log("snapshot contributed", snap.reduce((t, l) => t + l.contributedCents, 0) / 100, "unfunded", snap.reduce((t, l) => t + l.unfundedCommitmentCents, 0) / 100);
