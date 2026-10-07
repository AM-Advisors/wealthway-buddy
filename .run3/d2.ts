import { U, step } from "./lib";
const ds = await import("@/lib/distributions.server");
const B = "ae61d9aa-7c81-4778-8fa3-e4a167ed574f";
await step("distribution request (preparer)", () => ds.requestDistribution(U.prep, B));
await step("preparer cannot review own distribution", () => ds.reviewDistribution(U.prep, B), true);
await step("distribution review (reviewer)", () => ds.reviewDistribution(U.rev, B));
await step("distribution manager approval (manager)", () => ds.managerApproveDistribution(U.mgr, B));
await step("final approval BLOCKED: stale basis / withholding / destinations", () => ds.finalApproveDistribution(U.appr, B), true);
