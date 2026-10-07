import { U, step } from "./lib";
const ds = await import("@/lib/distributions.server");
await step("cancel auto-created replacement draft of superseded batch 1", () => ds.cancelDistribution(U.rev, "05174bb0-b3b3-4c62-915a-340bc9e5a0e9", "[QA] Replaced by Distribution 1b"));
