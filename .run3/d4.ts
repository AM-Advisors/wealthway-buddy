import { U, step } from "./lib";
const ds = await import("@/lib/distributions.server");
const B = "ae61d9aa-7c81-4778-8fa3-e4a167ed574f";
await step("batch withholding review (approver)", () => ds.reviewDistributionWithholding(U.appr, B));
await step("final approval: next blocker", () => ds.finalApproveDistribution(U.appr, B), true);
