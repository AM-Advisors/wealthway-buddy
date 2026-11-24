import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pickAccreditation } from "@/lib/accreditation-rule";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return p.includes("integrations") ? [] : sources(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [p] : [];
  });
}
const files = sources("src").map((p) => ({ p, s: readFileSync(p, "utf8") }));

describe("one list per question", () => {
  it("no screen reads or writes the retired client staff list", () => {
    expect(files.filter((f) => /from\(\s*["']client_assignments["']\s*\)/.test(f.s)).map((f) => f.p)).toEqual([]);
  });

  it("no screen creates entries on the retired staff role list", () => {
    expect(files.filter((f) => /from\(\s*["']access_role_assignments["']\s*\)\s*\.insert/.test(f.s)).map((f) => f.p)).toEqual([]);
  });

  it("client team assignments are only saved through changeClientTeamMember or the new-client seed", () => {
    const writers = files.filter((f) => /from\(\s*["']client_team_assignments["']\s*\)\s*\.(insert|upsert|update|delete)/.test(f.s)).map((f) => f.p).sort();
    expect(writers).toEqual(["src/lib/harmonious-team.server.ts"]);
  });

  it("older ID forms skip a second check when the account check is approved", () => {
    for (const p of ["src/lib/onboarding.functions.ts", "src/lib/room-kyc.functions.ts"]) {
      const s = files.find((f) => f.p === p)!.s;
      const guard = s.indexOf('accountCheck?.status !== "approved"');
      expect(guard).toBeGreaterThan(-1);
      const manualWrites = [...s.matchAll(/provider: "manual"/g)].map((m) => m.index ?? 0);
      expect(manualWrites.length).toBeGreaterThan(0);
      for (const at of manualWrites) expect(at).toBeGreaterThan(guard);
    }
  });
});

describe("one accreditation rule", () => {
  const appRecord = { status: "review", method: "questionnaire" };
  it("the investing party's accreditation for this fund counts first", () => {
    const pick = pickAccreditation([{ offering_id: null, status: "review" }, { offering_id: "f1", status: "approved" }], "f1", appRecord);
    expect(pick?.source).toBe("investing_party");
    expect(pick?.status).toBe("approved");
  });
  it("a general investing party accreditation counts when none is fund-specific", () => {
    expect(pickAccreditation([{ offering_id: null, status: "approved" }], "f1", appRecord)?.status).toBe("approved");
  });
  it("another fund's accreditation does not count; the investment record is used", () => {
    const pick = pickAccreditation([{ offering_id: "f2", status: "approved" }], "f1", appRecord);
    expect(pick?.source).toBe("investment");
    expect(pick?.status).toBe("review");
  });
});
