import { describe, expect, it } from "vitest";
import { matchFundOptions, matchesInvite, matchesPerson } from "@/lib/people-search";

const funds = ["ROAS Hedge LP", "Eradivir Investment Fund"];

describe("people directory search", () => {
  it("matches people by fund name", () => {
    expect(matchesPerson({ name: "Jane Doe", email: "jane@x.com", funds }, "roas hedge")).toBe(true);
    expect(matchesPerson({ name: "Jane Doe", email: "jane@x.com", funds }, "eradivir")).toBe(true);
    expect(matchesPerson({ name: "Jane Doe", email: "jane@x.com", funds }, "monarch")).toBe(false);
  });

  it("matches people connected to all funds only when the query names a fund", () => {
    const allFunds = { name: "Ops Staff", email: "ops@x.com", funds: ["All funds"] };
    expect(matchesPerson(allFunds, "roas", { matchAllFundsMarker: true })).toBe(true);
    expect(matchesPerson(allFunds, "roas")).toBe(false);
    expect(matchesPerson(allFunds, "ops@x.com", { matchAllFundsMarker: true })).toBe(true);
    expect(matchesPerson(allFunds, "nonsense", { matchAllFundsMarker: true })).toBe(true);
  });

  it("still matches by name and email", () => {
    expect(matchesPerson({ name: "Jane Doe", email: "jane@x.com" }, "jane")).toBe(true);
    expect(matchesPerson({ name: "Jane Doe", email: "jane@x.com" }, "x.com")).toBe(true);
  });

  it("matches invitations by fund name", () => {
    expect(matchesInvite({ name: null, email: "kiran@x.com", fundName: "ROAS Hedge LP" }, "roas")).toBe(true);
    expect(matchesInvite({ name: null, email: "kiran@x.com", fundName: null }, "roas")).toBe(false);
  });

  it("lists matching fund options only when there is a query", () => {
    const options = [{ id: "a", name: "ROAS Hedge LP" }, { id: "b", name: "Long Live Monarch LLC" }];
    expect(matchFundOptions(options, "")).toEqual([]);
    expect(matchFundOptions(options, "monarch")).toEqual([{ id: "b", name: "Long Live Monarch LLC" }]);
  });
});
