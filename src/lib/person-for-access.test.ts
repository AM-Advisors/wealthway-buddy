import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

const migration = readdirSync("drizzle/migrations").find((f) => f.includes("person_for_every_access_login"));
const sql = migration ? readFileSync(`drizzle/migrations/${migration}`, "utf8") : "";

describe("every login with access has a person record", () => {
  it.each(["fund_managers", "client_users", "fund_team_grants"])("adding access on %s makes a person record", (table) => {
    expect(sql).toMatch(new RegExp(`AFTER INSERT[^;]*ON public\\.${table}[^;]*person_for_access_row`));
  });
  it("never merges: only inserts when no person record exists", () => {
    expect(sql).toMatch(/IF _uid IS NULL OR EXISTS \(SELECT 1 FROM public\.persons WHERE user_id = _uid\) THEN RETURN/);
    expect(sql).not.toMatch(/UPDATE public\.persons/);
  });
});
