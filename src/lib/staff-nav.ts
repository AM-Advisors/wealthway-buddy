/**
 * The staff sidebar standard: every section and gated entry declares the roles it is for.
 * An entry shows only when the employee holds one of them; empty sections disappear.
 * Display only — every page and action keeps its own server-side check.
 */
export const LEADERS = ["super_admin", "executive"] as const;

export const NAV_ROLES = {
  operations: ["operations", "fund_administration", "admin", ...LEADERS],
  finance: ["finance", "tax", "fund_administration", "admin", ...LEADERS],
  sales: ["sales", "account_executive", "bdr", "sales_management", "cro", "account_manager", "admin", ...LEADERS],
  accountManagement: ["account_manager", "client_success", "cro", "sales_management", ...LEADERS],
  marketing: ["marketing_manager", "marketing_specialist", "marketing_contributor", "compliance_reviewer", "executive_approver", "admin", ...LEADERS],
  marketingPublishing: ["marketing_manager", "marketing_specialist", "admin", ...LEADERS],
  commercial: ["sales", "account_executive", "bdr", "sales_management", "cro", "account_manager", "client_success", "marketing_manager", "marketing_specialist", "finance", "tax", "fund_administration", "admin", "leadership", ...LEADERS],
  leadership: ["leadership", "admin", ...LEADERS],
  /** People & Access → Employees, Test & Demo, Roles, Invites & access. */
  peopleEmployees: ["leadership", "admin", "operations_lead", ...LEADERS],
  /** People & Access → Everyone else (clients, fund managers, founders, investors). */
  peopleOthers: ["leadership", "admin", "operations_lead", "operations", "account_manager", "client_success", ...LEADERS],
  mailboxes: ["admin", "operations_lead", "leadership", ...LEADERS],
  salesLeader: ["cro", "sales_management", ...LEADERS],
} as const satisfies Record<string, readonly string[]>;

export type NavRuleKey = keyof typeof NAV_ROLES;

export function canSee(rule: NavRuleKey, roles: readonly string[]): boolean {
  const allowed = NAV_ROLES[rule] as readonly string[];
  return roles.some((r) => allowed.includes(r));
}

export type PeopleTab = "people" | "roles" | "security";
export const PEOPLE_TABS: { id: PeopleTab; title: string; rule: NavRuleKey }[] = [
  { id: "people", title: "People", rule: "peopleOthers" },
  { id: "roles", title: "Roles & permissions", rule: "peopleEmployees" },
  { id: "security", title: "Security & review", rule: "peopleEmployees" },
];

export function visiblePeopleTabs(roles: readonly string[]) {
  return PEOPLE_TABS.filter((t) => canSee(t.rule, roles));
}

export type PeopleFilter = "employees" | "accounts" | "fund_managers" | "founders" | "wix" | "test" | "records" | "access";
/** Employee-only filters; everyone else sees accounts, fund managers, founders, Wix and records. */
export const EMPLOYEE_FILTERS: readonly PeopleFilter[] = ["employees", "test", "access"];

/** Maps old ?tab=/sub= values (employees, others, test, access, records) onto the 3-tab layout so saved links keep working. */
export function normalizePeopleSearch(tab?: string, sub?: string): { tab: PeopleTab; filter?: PeopleFilter; section?: string } {
  const access: Record<string, PeopleTab> = { people: "people", roles: "roles", matrix: "roles", audit: "security", review: "security" };
  switch (tab) {
    case "roles": return { tab: "roles" };
    case "security": return sub ? { tab: "security", section: sub } : { tab: "security" };
    case "employees": return { tab: "people", filter: "employees" };
    case "test": return { tab: "people", filter: "test" };
    case "records": return { tab: "people", filter: "records" };
    case "others": return { tab: "people", filter: (["accounts", "fund_managers", "founders", "wix"].includes(sub ?? "") ? sub : "accounts") as PeopleFilter };
    case "access": {
      if (sub === "invite") return { tab: "people", filter: "employees", section: "invite" };
      const t = access[sub ?? "people"] ?? "people";
      return t === "people" ? { tab: "people", filter: "access" } : { tab: t, section: sub! };
    }
    case "people": return sub ? { tab: "people", filter: sub as PeopleFilter } : { tab: "people" };
    default: return { tab: "people" };
  }
}
