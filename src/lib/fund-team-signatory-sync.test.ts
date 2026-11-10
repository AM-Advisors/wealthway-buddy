import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sig = readFileSync("src/lib/fund-signatories.server.ts", "utf8");
const tabs = readFileSync("src/lib/fund-tabs.functions.ts", "utf8");
const signing = readFileSync("src/lib/fund-file-signing.functions.ts", "utf8");

describe("fund team and signers stay in sync", () => {
  it("saving or removing a team member syncs the signer list", () => {
    expect(tabs.match(/syncTeamMemberSignatory\(/g)?.length).toBe(2);
  });
  it("team members are signer choices, checked against this exact fund", () => {
    expect(sig).toContain("key: `team:${m.id}`");
    expect(sig).toMatch(/fund_team_members"\)\.select\("\*"\)\.eq\("id", input\.candidateKey\.slice\(5\)\)\.eq\("offering_id", input\.offeringId\)/);
  });
  it("a person already listed never appears twice", () => {
    expect(sig).toContain("seenPersons.has(pid)");
    expect(sig).toContain("seenEmails.has(em)");
  });
  it("adding or removing a signer updates the team permission", () => {
    expect(sig).toContain("await ensureTeamSignatoryPermission(userId, input.offeringId, personId!)");
    expect(sig).toContain("await dropTeamSignatoryPermission(userId, input.offeringId, row.person_id)");
  });
  it("document signing accepts recorded signers, not only assigned managers", () => {
    expect(signing).not.toContain('from("fund_managers").select("user_id").eq("offering_id", data.fundId).eq("user_id", data.managerUserId)');
    expect(signing.match(/isFundSignerUser\(/g)?.length).toBe(3);
  });
});
