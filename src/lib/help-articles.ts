/**
 * Help center model: types and pure filters. The article catalog itself lives in
 * help-catalog.ts and is only loaded on the server, so staff procedures never
 * ship to client browsers.
 */

export type HelpAudience = "client" | "staff";

export const CLIENT_HELP_ROLES = [
  { id: "investor", title: "Investor" },
  { id: "fund_manager", title: "Fund manager" },
  { id: "company", title: "Company / cap table admin" },
  { id: "professional", title: "Professional (CPA / attorney)" },
] as const;

export const STAFF_HELP_ROLES = [
  { id: "operations", title: "Operations" },
  { id: "account_manager", title: "Account Manager" },
  { id: "finance", title: "Finance" },
  { id: "compliance", title: "Compliance" },
  { id: "sales", title: "Sales" },
  { id: "tax", title: "Tax" },
  { id: "super_admin", title: "Super Admin" },
] as const;

export const HELP_SERVICES = [
  { id: "funds", title: "Funds & SPVs" },
  { id: "cap_table", title: "Cap Table" },
  { id: "fund_admin", title: "Fund Administration" },
  { id: "tax", title: "Tax & K-1s" },
  { id: "banking", title: "Banking & wires" },
  { id: "signing", title: "Signing documents" },
  { id: "identity", title: "Identity verification" },
  { id: "billing", title: "Billing & your plan" },
] as const;

export type HelpService = (typeof HELP_SERVICES)[number]["id"];

export type HelpSection = { heading?: string; paragraphs?: string[]; steps?: string[] };

export type HelpArticle = {
  slug: string;
  title: string;
  summary: string;
  audience: HelpAudience;
  /** Empty = general, shown to every role in the audience. */
  roles: string[];
  services: HelpService[];
  /** Bump when the content changes; approval is per version. */
  version: number;
  updated: string;
  sections: HelpSection[];
  /** Rich guide component rendered instead of sections. */
  guide?: "fund-manager-first-login" | "sign-operating-agreement";
  download?: { href: string; filename: string };
};

export type HelpArticleView = HelpArticle & { approved: boolean };

/** Map platform roles to client help roles. */
export function clientHelpRolesFor(platformRoles: readonly string[], workspaceKind?: string | null): string[] {
  const out = new Set<string>();
  if (workspaceKind) out.add(workspaceKind);
  for (const r of platformRoles) {
    if (r === "investor" || r === "entity_representative" || r === "beneficial_owner") out.add("investor");
    if (r === "fund_manager" || r === "client_gp" || r === "client_signatory") out.add("fund_manager");
    if (r.startsWith("client_")) out.add("company");
  }
  return [...out];
}

/** Map platform roles to staff help roles. */
export function staffHelpRolesFor(platformRoles: readonly string[]): string[] {
  const out = new Set<string>();
  for (const r of platformRoles) {
    if (r === "super_admin" || r === "admin") out.add("super_admin");
    if (r === "operations" || r === "fund_administration") out.add("operations");
    if (r === "account_manager" || r === "client_success") out.add("account_manager");
    if (r === "finance") out.add("finance");
    if (r === "compliance" || r === "legal" || r.startsWith("security_compliance") || r === "compliance_reviewer") out.add("compliance");
    if (["sales", "sales_management", "cro", "account_executive", "bdr"].includes(r)) out.add("sales");
    if (r === "tax") out.add("tax");
  }
  return [...out];
}

/**
 * Articles a reader may see. Clients get only approved client articles for their
 * roles (or general ones). Staff get every staff and client article, drafts included.
 */
export function articlesFor(
  catalog: readonly HelpArticle[],
  reader: { audience: HelpAudience; roles: readonly string[] },
  approvedVersions: ReadonlyMap<string, number>,
): HelpArticleView[] {
  const view = (a: HelpArticle): HelpArticleView => ({ ...a, approved: (approvedVersions.get(a.slug) ?? 0) >= a.version });
  if (reader.audience === "staff") return catalog.map(view);
  return catalog
    .filter((a) => a.audience === "client")
    .filter((a) => a.roles.length === 0 || a.roles.some((r) => reader.roles.includes(r)))
    .map(view)
    .filter((a) => a.approved);
}
