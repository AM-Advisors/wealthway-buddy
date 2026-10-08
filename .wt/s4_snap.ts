import { guard, N } from "./lib"; await guard();
const cc = await import("@/lib/capital-calls.server");
const s = await cc.commitmentSnapshot(N);
console.log(s.length, s.reduce((t, l) => t + l.commitmentCents, 0) / 100, s.reduce((t, l) => t + l.contributedCents, 0) / 100, s.reduce((t, l) => t + l.unfundedCommitmentCents, 0) / 100);
