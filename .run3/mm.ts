import { N, U, step } from "./lib";
const cc = await import("@/lib/capital-calls.server");
await step("call with wrong aggregate confirmation is blocked", () => cc.prepareCapitalCall(U.prep, { offeringId: N, title: "[QA] mismatch", amountBasis: "fund_total", totalAmountCents: 10000000, confirmTotalCents: 9999999, dueDate: "2026-09-30" } as any), true);
