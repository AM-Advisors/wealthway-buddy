import { describe, expect, it } from "vitest";
import { filterDirectory, type DirectoryRow } from "./client-directory-model";

const row = (o: Partial<DirectoryRow>): DirectoryRow => ({ key: "a@x.co", email: "a@x.co", name: "Ann", companies: [], clientIds: [], assignments: [], invite: "not_invited", verified: false, ...o });

describe("filterDirectory", () => {
  const rows = [
    row({}),
    row({ key: "b@y.co", email: "b@y.co", name: "Bo", companies: ["Storybook"], clientIds: ["c1"], invite: "active", assignments: [{ id: "f", name: "Chapter 2", role: "member" }] }),
  ];
  it("searches name, email, company and assignment", () => {
    expect(filterDirectory(rows, "story", "all", "all").map((r) => r.name)).toEqual(["Bo"]);
    expect(filterDirectory(rows, "chapter", "all", "all")).toHaveLength(1);
    expect(filterDirectory(rows, "a@x", "all", "all").map((r) => r.name)).toEqual(["Ann"]);
  });
  it("filters by client and status", () => {
    expect(filterDirectory(rows, "", "c1", "all")).toHaveLength(1);
    expect(filterDirectory(rows, "", "all", "not_invited").map((r) => r.name)).toEqual(["Ann"]);
  });
});
