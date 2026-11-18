import { describe, expect, it } from "vitest";
import { emailCorrectionProblem, emailsOnFile, planEmailCorrection, summarizeCorrection, type EmailFootprintRow } from "./email-correction-model";

const rows: EmailFootprintRow[] = [
  { area: "login", id: "u", email: "bonnie@corpscapadvisors.com", where: null },
  { area: "profile", id: "u", email: "bonnie@corpscapadvisors.com", where: null },
  { area: "person", id: "p", email: "bonnie.huggins@corpscapadvisors.com", where: null },
  { area: "client_contact", id: "c", email: "Bonnie.Huggins@corpscapadvisors.com ", where: "Corps" },
  { area: "fund_team_member", id: "t1", email: "bonnie.huggins@corpscapadvisors.com", where: "Erebor" },
  { area: "fund_team_member", id: "t2", email: "bonnie.huggins@corpscapadvisors.com", where: "LaaSy" },
];
const none = { otherLogin: false, otherPerson: false };

describe("connected email correction", () => {
  it("shows every address on file, most used first, ignoring case and spaces", () => {
    expect(emailsOnFile(rows).map((e) => [e.email, e.count])).toEqual([
      ["bonnie.huggins@corpscapadvisors.com", 4],
      ["bonnie@corpscapadvisors.com", 2],
    ]);
  });

  it("changes only the places that still use a different address", () => {
    const changed = planEmailCorrection(rows, "bonnie.huggins@corpscapadvisors.com");
    expect(changed.map((r) => r.area)).toEqual(["login", "profile"]);
  });

  it("updates login, person, client and fund entries together", () => {
    const changed = planEmailCorrection(rows, "bonnie.h@corpscapadvisors.com");
    expect(summarizeCorrection(changed)).toEqual([
      { area: "login", label: "Sign-in email", count: 1 },
      { area: "profile", label: "Account profile", count: 1 },
      { area: "person", label: "Person record", count: 1 },
      { area: "client_contact", label: "Client contacts", count: 1 },
      { area: "fund_team_member", label: "Fund team entries", count: 2 },
    ]);
  });

  it("refuses an email another login already uses, so accounts are never merged", () => {
    expect(emailCorrectionProblem({ newEmail: "x@y.com", rows, conflicts: { ...none, otherLogin: true } })).toMatch(/Another login/);
  });

  it("refuses an email another person record uses", () => {
    expect(emailCorrectionProblem({ newEmail: "x@y.com", rows, conflicts: { ...none, otherPerson: true } })).toMatch(/Another person/);
  });

  it("refuses an incomplete address", () => {
    expect(emailCorrectionProblem({ newEmail: "bonnie@corps", rows, conflicts: none })).toMatch(/full email/);
  });

  it("allows a valid new address", () => {
    expect(emailCorrectionProblem({ newEmail: " Bonnie.H@corpscapadvisors.com ", rows, conflicts: none })).toBeNull();
  });
});
