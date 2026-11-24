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

describe("buildInvestorDirectory", () => {
  const base = {
    offerings: [{ id: "f1", name: "Alpha Fund I", client_id: "c1" }, { id: "f2", name: "Beta SPV", client_id: "c2" }],
    clients: [{ id: "c1", name: "Storybook Ventures" }, { id: "c2", name: "Northwind Capital" }],
    isStaffEmail: (e: string | null | undefined) => !!e && e.endsWith("@harmonious.co"),
  };

  it("lists investors without a login and opens their fund investor page", async () => {
    const { buildInvestorDirectory } = await import("@/lib/ops-records");
    const rows = buildInvestorDirectory({
      ...base,
      persons: [{ id: "p1", user_id: null, legal_first_name: "Jo", legal_last_name: "Buckman", preferred_name: null, email: "jo@example.com" }],
      logins: [],
      onboardings: [{ id: "o1", person_id: "p1", investor_user_id: null, offering_id: "f1", investment_profile_id: "ip1", stage: "funded" }],
      profiles: [{ id: "ip1", person_id: "p1", owner_user_id: null, legal_name: "The Buckman Family Trust", display_label: null, profile_type: "trust" }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe("Jo Buckman");
    expect(rows[0]!.hasLogin).toBe(false);
    expect(rows[0]!.parties).toEqual(["The Buckman Family Trust"]);
    expect(rows[0]!.openPath).toBe("/ops/fund/f1/investor/o1");
    expect(rows[0]!.stage).toBe("Funded");
  });

  it("opens Investor 360 for investors with a login and merges their funds into one row", async () => {
    const { buildInvestorDirectory } = await import("@/lib/ops-records");
    const rows = buildInvestorDirectory({
      ...base,
      persons: [{ id: "p2", user_id: "u2", legal_first_name: "Doug", legal_last_name: "Mangrum", preferred_name: null, email: "doug@example.com" }],
      logins: [{ user_id: "u2", legal_name: "Doug Mangrum", email: "doug@example.com", investor_type: null }],
      onboardings: [
        { id: "o2", person_id: "p2", investor_user_id: "u2", offering_id: "f1", investment_profile_id: null, stage: "signature" },
        { id: "o3", person_id: "p2", investor_user_id: "u2", offering_id: "f2", investment_profile_id: null, stage: "closed" },
      ],
      profiles: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.openPath).toBe("/ops/investors/u2");
    expect(rows[0]!.funds.map((f) => f.fundName)).toEqual(["Alpha Fund I", "Beta SPV"]);
    expect(rows[0]!.stage).toBe("Closed / admitted");
  });

  it("leaves out Harmonious staff and logins with no investing party or investment", async () => {
    const { buildInvestorDirectory } = await import("@/lib/ops-records");
    const rows = buildInvestorDirectory({
      ...base,
      persons: [{ id: "p3", user_id: "u3", legal_first_name: "Staff", legal_last_name: "Person", preferred_name: null, email: "staff@harmonious.co" }],
      logins: [
        { user_id: "u3", legal_name: "Staff Person", email: "staff@harmonious.co", investor_type: null },
        { user_id: "u4", legal_name: "Manager Only", email: "mgr@example.com", investor_type: null },
      ],
      onboardings: [{ id: "o4", person_id: "p3", investor_user_id: "u3", offering_id: "f1", investment_profile_id: null, stage: "started" }],
      profiles: [],
    });
    expect(rows).toEqual([]);
  });

  it("groups investors by fund, then by name, with fundless investors last", async () => {
    const { buildInvestorDirectory } = await import("@/lib/ops-records");
    const rows = buildInvestorDirectory({
      ...base,
      persons: [
        { id: "pa", user_id: null, legal_first_name: "Zoe", legal_last_name: "Adler", preferred_name: null, email: null },
        { id: "pb", user_id: null, legal_first_name: "Amy", legal_last_name: "Baker", preferred_name: null, email: null },
        { id: "pc", user_id: null, legal_first_name: "Bob", legal_last_name: "Clark", preferred_name: null, email: null },
        { id: "pd", user_id: "u5", legal_first_name: "Ann", legal_last_name: "Dunn", preferred_name: null, email: "ann@example.com" },
      ],
      logins: [{ user_id: "u5", legal_name: "Ann Dunn", email: "ann@example.com", investor_type: null }],
      onboardings: [
        { id: "oa", person_id: "pa", investor_user_id: null, offering_id: "f2", investment_profile_id: null, stage: "funded" },
        { id: "ob", person_id: "pb", investor_user_id: null, offering_id: "f1", investment_profile_id: null, stage: "funded" },
        { id: "oc", person_id: "pc", investor_user_id: null, offering_id: "f1", investment_profile_id: null, stage: "funded" },
      ],
      profiles: [{ id: "ip5", person_id: "pd", owner_user_id: "u5", legal_name: "Ann Dunn", display_label: null, profile_type: "individual" }],
    });
    // Beta SPV investors before Alpha Fund I would be alphabetical by person;
    // fund grouping puts Alpha Fund I (Amy, Bob) first, then Beta SPV (Zoe),
    // then the fundless investor (Ann).
    expect(rows.map((r) => r.title)).toEqual(["Amy Baker", "Bob Clark", "Zoe Adler", "Ann Dunn"]);
  });

  it("search matches the investing party name", async () => {
    const { buildInvestorDirectory } = await import("@/lib/ops-records");
    const [row] = buildInvestorDirectory({
      ...base,
      persons: [{ id: "p1", user_id: null, legal_first_name: "Jo", legal_last_name: "Buckman", preferred_name: null, email: null }],
      logins: [],
      onboardings: [{ id: "o1", person_id: "p1", investor_user_id: null, offering_id: "f1", investment_profile_id: "ip1", stage: "funded" }],
      profiles: [{ id: "ip1", person_id: "p1", owner_user_id: null, legal_name: "The Buckman Family Trust", display_label: null, profile_type: "trust" }],
    });
    expect(investorListMatches(row!, "family trust")).toBe(true);
  });
});
