import { U, step, db } from "./lib";
const ds = await import("@/lib/distributions.server");
const B = "ae61d9aa-7c81-4778-8fa3-e4a167ed574f";
await step("preparer cannot override stale basis", () => ds.approveStaleBasis(U.prep, B, "[QA] Ownership unchanged: call 2 was split pro rata by commitment"), true);
await step("stale basis approved with reason (reviewer)", () => ds.approveStaleBasis(U.rev, B, "[QA] Ownership unchanged: call 2 was split pro rata by commitment (40/30/20/10), so July percentages still hold."));
const d = await db();
const { data: lines } = await d.from("distribution_lines").select("id,display_name").eq("batch_id", B);
for (const l of lines ?? []) {
  await step(`preparer cannot decide withholding ${l.display_name}`, () => ds.decideLineWithholding(U.prep, { lineId: l.id, amountCents: 0, reason: "[QA] synthetic decision" }), true);
  await step(`withholding decision $0 ${l.display_name} (reviewer)`, () => ds.decideLineWithholding(U.rev, { lineId: l.id, amountCents: 0, reason: "[QA] Return of capital to synthetic US person; no withholding per test policy (tax adviser sign-off required for real funds)." }));
}
await step("batch withholding review (approver)", () => ds.reviewDistributionWithholding(U.appr, B));
await step("final approval: next blocker", () => ds.finalApproveDistribution(U.appr, B), true);
