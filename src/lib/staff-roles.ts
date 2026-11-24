/**
 * The one place that says who counts as Harmonious staff. Pure and browser-safe.
 *
 * - STAFF_ROLES: everyone who works in Operations. The database's is_any_staff() uses this same list.
 * - FUND_OPERATIONS_ROLES: the smaller group that may act on fund and client records
 *   (fund pages, side letters, cap tables, closes). The database's is_fund_operations_staff() matches it.
 * - SALES_ROLES / MARKETING_ROLES: staff outside Operations; screens that serve them add these explicitly.
 *
 * Purpose-specific permissions (money, banking, tax, contracts, Super Admin) keep their own named lists
 * next to the action they protect; they are permissions, not a second definition of staff.
 */

export const OPS_STAFF_ROLES = [
  "admin",
  "super_admin",
  "operations",
  "legal",
  "compliance",
  "fund_administration",
  "tax",
  "finance",
  "client_success",
  "executive",
  "leadership",
] as const;

export const STAFF_ROLES: readonly string[] = OPS_STAFF_ROLES;

export const FUND_OPERATIONS_ROLES: readonly string[] = [
  "admin",
  "super_admin",
  "operations",
  "fund_administration",
  "legal",
  "compliance",
];

export const SALES_ROLES: readonly string[] = ["sales", "sales_management", "cro", "account_manager", "account_executive", "bdr"];

export const MARKETING_ROLES: readonly string[] = ["marketing_manager", "marketing_specialist"];

/** Operations staff plus Sales: for commercial screens (agreements, engagements). */
export const STAFF_AND_SALES_ROLES: readonly string[] = [...STAFF_ROLES, ...SALES_ROLES];

/** Every Harmonious employee role, for "is this person an employee" questions (identity check exemption, delegates). */
export const EVERY_STAFF_ROLE: readonly string[] = [...STAFF_ROLES, ...SALES_ROLES, ...MARKETING_ROLES];

const hasAny = (roles: readonly (string | null | undefined)[], list: readonly string[]) =>
  roles.some((r) => !!r && list.includes(String(r)));

export const isStaffRole = (roles: readonly (string | null | undefined)[]) => hasAny(roles, STAFF_ROLES);
export const isFundOperationsRole = (roles: readonly (string | null | undefined)[]) => hasAny(roles, FUND_OPERATIONS_ROLES);
