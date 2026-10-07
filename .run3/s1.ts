import { N, U, step } from "./lib";
const cc = await import("@/lib/capital-calls.server");
const a5 = await import("@/lib/accounting-phase5.server");
await step("open ledger book", () => a5.openBook(U.prep, N));
const call = await step("call 1 prepare: fund total $2.5M pro rata (manager)", () => cc.prepareCapitalCall(U.mgr, { offeringId: N, callType: "whole_fund" as any, basis: "fund_total" as any, totalAmountCents: 250_000_000, allocationBasis: "commitment_pro_rata", confirmedAggregateCents: 250_000_000, noticeDate: "2026-07-01", dueDate: "2026-07-15", title: "[QA] Capital call 1", purpose: "[QA] Opening capital call" }));
console.log(JSON.stringify(call).slice(0, 800));
