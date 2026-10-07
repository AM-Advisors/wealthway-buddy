/**
 * The staff sidebar standard: every section and gated entry declares the roles it is for.
 * An entry shows only when the employee holds one of them; empty sections disappear.
 * Display only — every page and action keeps its own server-side check.
 */
export const LEADERS = ["super_admin", "executive"] as const;

export const NAV_ROLES = {
  operations: ["operations", "fund_administration", "admin", ...LEADERS],
  finance: ["finance", "tax", "fund_administration", "admin", ...LEADERS],
  sales: ["sales", "account_executive", "bdr", "sales_management", "cro", ...LEADERS],
  accountManagement: ["account_manager", "client_success", "cro", "sales_management", ...LEADERS],
  marketing: ["marketing_manager", "marketing_specialist", "admin", ...LEADERS],
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

export type PeopleTab = "employees" | "others" | "test" | "roles" | "access";
export const PEOPLE_TABS: { id: PeopleTab; title: string; rule: NavRuleKey }[] = [
  { id: "employees", title: "Employees", rule: "peopleEmployees" },
  { id: "others", title: "Everyone else", rule: "peopleOthers" },
  { id: "test", title: "Test & Demo users", rule: "peopleEmployees" },
  { id: "roles", title: "Roles", rule: "peopleEmployees" },
  { id: "access", title: "Invites & access", rule: "peopleEmployees" },
];

export function visiblePeopleTabs(roles: readonly string[]) {
  return PEOPLE_TABS.filter((t) => canSee(t.rule, roles));
}
