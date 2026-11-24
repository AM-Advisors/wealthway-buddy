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

describe("one fund access check", () => {
  // Files that may still read someone's manager rows directly, because they are not "may this login use this fund" checks:
  // the shared reader itself, access administration and invitations (adding/removing managers), signer and W-9 signer
  // resolution, company-level (client) membership, session facts, compliance roles and profile display.
  const ALLOWED = [
    "src/lib/access-admin.functions.ts",
    "src/lib/access.functions.ts",
    "src/lib/client-dashboard.functions.ts",
    "src/lib/client-membership.ts",
    "src/lib/client-portal.functions.ts",
    "src/lib/fund-access.server.ts",
    "src/lib/fund-manager-auto-invite.server.ts",
    "src/lib/fund-manager-profile.server.ts",
    "src/lib/fund-signatories.server.ts",
    "src/lib/fund-signing-email.server.ts",
    "src/lib/fund-signing-tracker.functions.ts",
    "src/lib/fund-w9.server.ts",
    "src/lib/invitations.functions.ts",
    "src/lib/manager-profile.functions.ts",
    "src/lib/onboarding-compliance.server.ts",
    "src/lib/saas-orders.server.ts",
    "src/lib/session-facts.server.ts",
  ];
  it("fund screens ask the shared fund access check instead of reading the manager list themselves", () => {
    const readers = files
      .filter((f) => /from\(\s*["']fund_managers["']\s*\)(?:(?!\.from\()[^;]){0,200}\.eq\(\s*["']user_id["']/s.test(f.s))
      .map((f) => f.p.replace(/\\/g, "/"))
      .filter((p) => !ALLOWED.includes(p));
    expect(readers).toEqual([]);
  });
  it("client membership of a fund has one reader", () => {
    const own = files.filter((f) => /export async function isClientMemberOfFund/.test(f.s));
    expect(own.map((f) => f.p.replace(/\\/g, "/"))).toEqual(["src/lib/fund-cap-table.functions.ts"]);
    expect(own[0]?.s).toMatch(/clientMemberOfFund\(db, uid, fundId\)/);
  });
});
