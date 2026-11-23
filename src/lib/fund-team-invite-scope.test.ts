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

describe("contacts created from a fund screen stay on that fund", () => {
  const src = readFileSync("src/lib/fund-signatories.server.ts", "utf8");
  it("marks every new contact made from a fund screen with that fund", () => {
    const inserts = src.split('from("client_contacts").insert(').slice(1).map((s) => s.slice(0, 400));
    expect(inserts.length).toBe(3);
    for (const i of inserts) expect(i).toContain("added_for_offering_id");
  });
});

describe("new initial contacts stay on their fund", () => {
  it("marks a newly added initial contact with that fund", () => {
    const src = readFileSync("src/lib/fund-initial-contact.server.ts", "utf8");
    const ins = src.split('from("client_contacts").insert(').slice(1);
    expect(ins.length).toBe(1);
    expect(ins[0]!.slice(0, 200)).toContain("added_for_offering_id");
  });
});
