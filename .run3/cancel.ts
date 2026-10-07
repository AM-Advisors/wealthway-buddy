import { U, step } from "./lib";
const cc = await import("@/lib/capital-calls.server");
await step("cancel stray draft call created by mismatched-aggregate test", () => cc.cancelCapitalCall(U.rev, "c3032b77-0e07-488a-a939-05431a0c4420", "[QA] test draft, mismatched confirmation"));
