import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EVERY_STAFF_ROLE, FUND_OPERATIONS_ROLES, STAFF_AND_SALES_ROLES, STAFF_ROLES, isFundOperationsRole, isStaffRole } from "./staff-roles";
import { OPS_STAFF_ROLES } from "./ops-capabilities";

const sqlList = (sql: string, fn: string) => {
  const m = sql.match(new RegExp(`FUNCTION public\\.${fn}\\([^)]*\\)[\\s\\S]*?role::text IN \\(([^)]*)\\)`));
  return m ? [...m[1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort() : null;
};
const migration = readFileSync(join(__dirname, "../../drizzle/migrations/0442_one_shared_staff_list.sql"), "utf8");

describe("one staff list", () => {
  it("staff are the eleven Operations roles", () =>
    expect([...STAFF_ROLES].sort()).toEqual(["admin", "client_success", "compliance", "executive", "finance", "fund_administration", "leadership", "legal", "operations", "super_admin", "tax"]));
  it("Leadership counts as staff", () => expect(isStaffRole(["leadership"])).toBe(true));
  it("Sales alone is not Operations staff", () => expect(isStaffRole(["sales"])).toBe(false));
  it("Tax staff cannot act on fund records", () => expect(isFundOperationsRole(["tax"])).toBe(false));
  it("Operations staff can act on fund records", () => expect(isFundOperationsRole(["operations"])).toBe(true));
  it("fund operations staff are all staff", () => expect(FUND_OPERATIONS_ROLES.every((r) => STAFF_ROLES.includes(r))).toBe(true));
  it("the Operations permission list is the same list", () => expect([...OPS_STAFF_ROLES]).toEqual([...STAFF_ROLES]));
  it("commercial screens add Sales to staff", () => expect(STAFF_AND_SALES_ROLES.includes("account_manager")).toBe(true));
  it("marketing staff count as employees", () => expect(EVERY_STAFF_ROLE.includes("marketing_specialist")).toBe(true));
  it("the database staff check matches", () => expect(sqlList(migration, "is_any_staff")).toEqual([...STAFF_ROLES].sort()));
  it("the database fund operations check matches", () => expect(sqlList(migration, "is_fund_operations_staff")).toEqual([...FUND_OPERATIONS_ROLES].sort()));
  it("no screen writes its own staff list", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name) && !e.name.includes(".test.") && e.name !== "staff-roles.ts") {
          if (/const (OPS_)?STAFF_ROLES\s*(:[^=]+)?=\s*\[\s*["']/.test(readFileSync(p, "utf8"))) offenders.push(p);
        }
      }
    };
    walk(join(__dirname, ".."));
    expect(offenders).toEqual([]);
  });
});
