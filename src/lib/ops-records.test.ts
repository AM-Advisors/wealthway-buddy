import { describe, expect, it } from "vitest";

import { attachInvestorRelations, investorListMatches } from "@/lib/ops-records";

const profiles = [
  { user_id: "u1", legal_name: "Ada Investor", email: "ada@example.com", investor_type: "individual" },
  { user_id: "u2", legal_name: "Bob Capital LLC", email: "bob@example.com", investor_type: "entity" },
  { user_id: "u3", legal_name: "Cara New", email: "cara@example.com", investor_type: "individual" },
];

const offerings = [
  { id: "f1", name: "Alpha Fund I", client_id: "c1" },
  { id: "f2", name: "Beta SPV", client_id: "c2" },
];

const clients = [
  { id: "c1", name: "Storybook Ventures" },
  { id: "c2", name: "Northwind Capital" },
];

describe("attachInvestorRelations", () => {
  it("attaches clients and funds, and picks the furthest stage", () => {
    const rows = attachInvestorRelations(
      profiles,
      [
        { investor_user_id: "u1", offering_id: "f1", stage: "signature" },
        { investor_user_id: "u1", offering_id: "f2", stage: "funded" },
        { investor_user_id: "u2", offering_id: "f1", stage: "closed" },
      ],
      offerings,
      clients,
    );

    const ada = rows.find((r) => r.id === "u1")!;
    expect(ada.funds.map((f) => f.fundName)).toEqual(["Alpha Fund I", "Beta SPV"]);
    expect(ada.clients.map((c) => c.name)).toEqual(["Northwind Capital", "Storybook Ventures"]);
    expect(ada.stage).toBe("Funded");

    const bob = rows.find((r) => r.id === "u2")!;
    expect(bob.funds).toHaveLength(1);
    expect(bob.clients).toEqual([{ id: "c1", name: "Storybook Ventures" }]);
    expect(bob.stage).toBe("Closed / admitted");
  });

  it("keeps investors with no funds, with empty client and fund lists", () => {
    const rows = attachInvestorRelations(profiles, [], offerings, clients);
    const cara = rows.find((r) => r.id === "u3")!;
    expect(cara.funds).toEqual([]);
    expect(cara.clients).toEqual([]);
    expect(cara.stage).toBeNull();
    expect(cara.title).toBe("Cara New");
  });

  it("dedupes repeat onboardings in the same fund and ignores unknown offerings", () => {
    const rows = attachInvestorRelations(
      profiles,
      [
        { investor_user_id: "u1", offering_id: "f1", stage: "started" },
        { investor_user_id: "u1", offering_id: "f1", stage: "verification" },
        { investor_user_id: "u1", offering_id: "missing", stage: "funded" },
      ],
      offerings,
      clients,
    );
    const ada = rows.find((r) => r.id === "u1")!;
    expect(ada.funds).toHaveLength(1);
    expect(ada.stage).toBe("Verification");
  });
});

describe("investorListMatches", () => {
  const row = attachInvestorRelations(
    [profiles[0]!],
    [{ investor_user_id: "u1", offering_id: "f1", stage: "funded" }],
    offerings,
    clients,
  )[0]!;

  it("matches investor name, client name and fund name", () => {
    expect(investorListMatches(row, "ada")).toBe(true);
    expect(investorListMatches(row, "storybook")).toBe(true);
    expect(investorListMatches(row, "alpha fund")).toBe(true);
    expect(investorListMatches(row, "unrelated")).toBe(false);
    expect(investorListMatches(row, "")).toBe(true);
  });
});
