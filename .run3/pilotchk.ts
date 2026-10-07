import { N, U, step } from "./lib";
const ds = await import("@/lib/distributions.server");
const fp = await import("@/lib/financial-pilot.server");
await step("posted payout's sent date cannot change", () => ds.setDistributionPaymentSentDate(U.rev, { paymentId: "e50018dd-4ae4-4ebd-a15a-af4ce77b6eab", sentOn: "2026-08-29", reason: "[QA] test" }), true);
const r: any = await step("readiness on QA fund (read-only)", () => fp.pilotReadiness(U.appr, N));
console.log("LEVEL", r?.readiness?.level, JSON.stringify(r?.readiness?.items.filter((i: any) => !i.ok).map((i: any) => i.label)));
const c: any = await step("candidates list (read-only)", () => fp.listPilotCandidates(U.appr));
console.log("CANDS", c?.rows?.length, c?.recommendedOfferingId);
