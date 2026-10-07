import { N, U, step } from "./lib";
const cc = await import("@/lib/capital-calls.server");
await step("call with wrong aggregate confirmation is blocked", () => cc.prepareCapitalCall(U.prep, { offeringId: N, callType: "capital" as any, basis: "fund_total" as any, totalAmountCents: 10000000, allocationBasis: "commitment_pro_rata", confirmedAggregateCents: 9999999, dueDate: "2026-09-30" } as any), true);
