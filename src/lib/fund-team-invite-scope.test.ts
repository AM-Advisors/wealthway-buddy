import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Adding someone to one fund's Team page must never make them a company contact:
// company contacts auto-link to view every fund of that company.
describe("fund team invitations stay on that fund", () => {
  const src = readFileSync("src/lib/fund-signatories.server.ts", "utf8");
  const body = src.slice(src.indexOf("export async function inviteTeamMember"));
  const helper = src.slice(src.indexOf("async function sendFundTeamInvite"), src.indexOf("export async function inviteTeamMember"));
  it("sends the team invite without the company-contact invite", () => {
    expect(body).toContain("sendFundTeamInvite(");
    expect(body).not.toContain("inviteFundPerson(");
  });
  it("never inserts a company contact when inviting a team member", () => {
    expect(helper.length).toBeGreaterThan(0);
    expect(helper).not.toContain('from("client_contacts")');
  });
});
