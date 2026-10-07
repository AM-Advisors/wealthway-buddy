import { U, step } from "./lib";
const a5 = await import("@/lib/accounting-phase5.server");
const rc = await import("@/lib/reconciliation.server");
await step("resolve feed_stale alert: synthetic bank has no live feed (reviewer, reasoned)", () => a5.actOnBankAlert(U.rev, { alertId: "811650b6-0d10-43b6-8cb9-a9caf0d7e96c", action: "resolved" as any, note: "[QA] Synthetic bank account with no live feed; period-end balance recorded and independently reviewed." }));
await step("resolve missing_valuation_methodology exception (reviewer, reasoned, no value change)", () => rc.resolveException(U.rev, "44fa1ddb-c81b-4fbe-9a41-9705c989f58a", "resolved", "[QA] Manager mark inputs documented in attached synthetic evidence; value unchanged."));
