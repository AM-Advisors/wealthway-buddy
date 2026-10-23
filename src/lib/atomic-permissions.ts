/**
 * RBAC Stage 2.6 - atomic Client and Fund permissions (canonical vocabulary only).
 *
 * Summary matrix actions (view/edit/…) stay as they are; each Clients/Funds
 * cell expands into atomic permissions. Broad permissions imply only
 * non-destructive atomics; archive/restore/close/reopen/delete_draft are never
 * implied and must be granted explicitly (Super Administrator receives them).
 * None of these imply money execution, posting, tax/identity evidence,
 * compliance exceptions, regulatory approval or legal signing.
 */
export type AtomicDef = { key: string; label: string; area: "clients" | "funds" | "administration"; summary: "view" | "edit" | "review" | "approve" | "manage_access" | "export"; destructive?: boolean };

const C = (key: string, label: string, summary: AtomicDef["summary"] = "edit", destructive = false): AtomicDef => ({ key: `clients.${key}`, label, area: "clients", summary, destructive });
const Fd = (key: string, label: string, summary: AtomicDef["summary"] = "edit", destructive = false): AtomicDef => ({ key: `funds.${key}`, label, area: "funds", summary, destructive });

export const ATOMIC_PERMISSIONS: AtomicDef[] = [
  C("view", "View client", "view"),
  C("create", "Create client"),
  C("edit_profile", "Edit profile"),
  C("edit_entity", "Edit entity details"),
  C("manage_contacts", "Manage contacts"),
  C("manage_companies", "Manage companies"),
  C("manage_funds", "Manage funds"),
  C("manage_services", "Manage services"),
  C("manage_engagements", "Manage engagements"),
  C("manage_pricing", "Manage pricing"),
  C("manage_documents", "Manage documents"),
  C("manage_access", "Manage access", "manage_access"),
  C("archive", "Archive client", "edit", true),
  C("restore", "Restore client", "edit", true),
  C("delete_draft", "Delete unused draft", "edit", true),
  C("export", "Export", "export"),
  C("contacts.view", "Contacts - view", "view"),
  C("contacts.add", "Contacts - add"),
  C("contacts.edit", "Contacts - edit"),
  C("contacts.remove", "Contacts - remove"),
  Fd("view", "View fund", "view"),
  Fd("create", "Create fund"),
  Fd("edit_profile", "Edit profile"),
  Fd("edit_setup", "Edit setup"),
  Fd("edit_offering", "Edit offering"),
  Fd("manage_entities", "Manage entities"),
  Fd("manage_investors", "Manage investors"),
  Fd("manage_team", "Manage team"),
  Fd("manage_documents", "Manage documents"),
  Fd("manage_services", "Manage services"),
  Fd("manage_terms", "Manage terms"),
  Fd("manage_access", "Manage access", "manage_access"),
  Fd("archive", "Archive", "edit", true),
  Fd("restore", "Restore", "edit", true),
  Fd("close", "Close", "edit", true),
  Fd("reopen", "Reopen", "edit", true),
  Fd("delete_draft", "Delete unused draft", "edit", true),
  Fd("export", "Export", "export"),
  Fd("investors.view", "Investors - view", "view"),
  Fd("investors.add", "Investors - add"),
  Fd("investors.edit", "Investors - edit"),
  Fd("investors.remove", "Investors - remove"),
  Fd("investors.invite", "Investors - invite"),
  Fd("team.view", "Team - view", "view"),
  Fd("team.add", "Team - add"),
  Fd("team.edit", "Team - edit"),
  Fd("team.remove", "Team - remove"),
  Fd("team.manage_access", "Team - manage access", "manage_access"),
  // Stage 2.7 - Compliance & Controls (Harmonious internal only; never implied by client/fund permissions).
  ...([
    ["controls.view", "Controls - view", "view"], ["controls.edit", "Controls - edit", "edit"], ["controls.review", "Controls - review", "review"],
    ["controls.approve", "Controls - approve", "approve"], ["evidence.view", "Evidence - view", "view"], ["evidence.collect", "Evidence - collect", "edit"],
    ["evidence.review", "Evidence - review", "review"], ["access_reviews.manage", "Access reviews - manage", "edit"],
    ["privacy.view", "Privacy - view", "view"], ["privacy.manage", "Privacy - manage", "edit"], ["vendors.view", "Vendors - view", "view"],
    ["vendors.manage", "Vendors - manage", "edit"], ["risks.view", "Risks - view", "view"], ["risks.manage", "Risks - manage", "edit"],
    ["incidents.view", "Incidents - view", "view"], ["incidents.manage", "Incidents - manage", "edit"],
    // Phase 7 - contacts, deals and campaigns (Super Administrator assigns; never implied).
    ["crm.view_all", "Contacts & deals - see everyone's", "view"], ["crm.assign", "Contacts & deals - reassign owner", "edit"],
    ["campaigns.approve", "Campaigns - approve", "approve"],
    // Phase 7 - contacts, deals and campaigns (Super Administrator assigns; never implied).
    ["crm.view_all", "Contacts & deals - see everyone's", "view"], ["crm.assign", "Contacts & deals - reassign owner", "edit"],
    ["campaigns.approve", "Campaigns - approve", "approve"],
  ] as const).map(([k, label, summary]): AtomicDef => ({ key: `administration.${k}`, label, area: "administration", summary })),
];
export const ATOMIC_KEYS = ATOMIC_PERMISSIONS.map((a) => a.key);
export const isAtomic = (k: string) => ATOMIC_KEYS.includes(k);
export const atomicDef = (k: string) => ATOMIC_PERMISSIONS.find((a) => a.key === k);
export const DESTRUCTIVE_ATOMICS = ATOMIC_PERMISSIONS.filter((a) => a.destructive).map((a) => a.key);
/** Deliberately absent: no unrestricted delete exists. */
export const FORBIDDEN_KEYS = ["clients.delete", "funds.delete"];

/** manage_* aggregates → the atomic sub-resource actions they bundle. */
export const AGGREGATES: Record<string, string[]> = {
  "clients.manage_contacts": ["clients.contacts.view", "clients.contacts.add", "clients.contacts.edit", "clients.contacts.remove"],
  "funds.manage_investors": ["funds.investors.view", "funds.investors.add", "funds.investors.edit", "funds.investors.remove", "funds.investors.invite"],
  "funds.manage_team": ["funds.team.view", "funds.team.add", "funds.team.edit", "funds.team.remove"],
  "funds.manage_access": ["funds.team.manage_access"],
  "administration.controls.edit": ["administration.controls.view"],
  "administration.evidence.collect": ["administration.evidence.view"],
  "administration.evidence.review": ["administration.evidence.view"],
  "administration.privacy.manage": ["administration.privacy.view"],
  "administration.vendors.manage": ["administration.vendors.view"],
  "administration.risks.manage": ["administration.risks.view"],
  "administration.incidents.manage": ["administration.incidents.view"],
};

/** Broad summary permissions → non-destructive atomics they imply. */
export const BROAD_TO_ATOMIC: Record<string, string[]> = {
  "clients.view": ["clients.view", "clients.contacts.view"],
  "clients.edit": ["clients.create", "clients.edit_profile", "clients.edit_entity", "clients.manage_contacts", "clients.manage_companies", "clients.manage_funds", "clients.manage_services", "clients.manage_engagements", "clients.manage_pricing", "clients.manage_documents"],
  "clients.manage_access": ["clients.manage_access"],
  "clients.export": ["clients.export"],
  "funds.view": ["funds.view", "funds.investors.view", "funds.team.view"],
  "funds.edit": ["funds.create", "funds.edit_profile", "funds.edit_setup", "funds.edit_offering", "funds.manage_entities", "funds.manage_investors", "funds.manage_team", "funds.manage_documents", "funds.manage_services", "funds.manage_terms"],
  "funds.manage_access": ["funds.manage_access"],
  "funds.export": ["funds.export"],
};

/** Does holding `held` cover `wanted`? (exact, aggregate or broad → atomic, one level of aggregate expansion). */
export function covers(held: string, wanted: string): boolean {
  if (held === wanted) return true;
  if (AGGREGATES[held]?.includes(wanted)) return true;
  const broad = BROAD_TO_ATOMIC[held];
  if (broad) {
    if (broad.includes(wanted)) return true;
    return broad.some((b) => AGGREGATES[b]?.includes(wanted));
  }
  return false;
}

// ---------------------------------------------------------------- lifecycle & destructive policy

export const FUND_LIFECYCLE = ["draft", "setup", "active", "closing", "closed", "archived"] as const;
export type FundStage = (typeof FUND_LIFECYCLE)[number];

/** Lifecycle action → permission + allowed from-stages. Close ≠ archive ≠ delete. */
export const FUND_TRANSITIONS: Record<string, { permission: string; from: FundStage[]; to: FundStage | "deleted" }> = {
  close: { permission: "funds.close", from: ["active", "closing"], to: "closed" },
  reopen: { permission: "funds.reopen", from: ["closed"], to: "active" },
  archive: { permission: "funds.archive", from: ["draft", "setup", "closed"], to: "archived" },
  // Restore returns the record only; it never reopens banking, fundraising, onboarding or filings.
  restore: { permission: "funds.restore", from: ["archived"], to: "closed" },
  delete_draft: { permission: "funds.delete_draft", from: ["draft"], to: "deleted" },
};
export function fundTransitionProblem(action: keyof typeof FUND_TRANSITIONS, stage: FundStage): string | null {
  const t = FUND_TRANSITIONS[action];
  if (!t) return "Unknown lifecycle action.";
  return t.from.includes(stage) ? null : `Can't ${action.replace("_", " ")} a fund that is ${stage}.`;
}

export type ClientDependencies = {
  status: "draft" | "active" | "archived" | string;
  executedAgreements: number; funds: number; companiesWithTransactions: number; investors: number;
  invoicesOrPayments: number; bankAccounts: number; accountingEntries: number; taxRecords: number;
  filings: number; executedDocuments: number; requiredAuditEvents: number;
};
export type FundDependencies = {
  stage: FundStage;
  investorsOrInvestments: number; executedSubscriptions: number; bankAccounts: number; fundingActivity: number;
  capitalCalls: number; distributions: number; accountingEntries: number; navRecords: number;
  taxRecords: number; regulatoryFilings: number; executedLegalDocuments: number;
};

const LABELS: Record<string, string> = {
  executedAgreements: "executed agreements", funds: "funds", companiesWithTransactions: "companies with transactions", investors: "investors",
  invoicesOrPayments: "invoices or payments", bankAccounts: "bank accounts", accountingEntries: "accounting entries", taxRecords: "tax records",
  filings: "filings", executedDocuments: "executed documents", requiredAuditEvents: "required audit history",
  investorsOrInvestments: "investors or investments", executedSubscriptions: "executed subscriptions", fundingActivity: "funding activity",
  capitalCalls: "capital calls", distributions: "distributions", navRecords: "NAV records", regulatoryFilings: "regulatory filings",
  executedLegalDocuments: "executed legal documents",
};
function blockers(d: Record<string, unknown>): string[] {
  return Object.entries(d).filter(([k, v]) => typeof v === "number" && v > 0 && LABELS[k]).map(([k]) => LABELS[k]!);
}

/** null = unused draft, eligible for delete_draft. Otherwise archive instead. */
export function clientDeleteDraftProblem(d: ClientDependencies): string | null {
  if (d.status !== "draft") return "Only an unused draft client can be permanently deleted - archive it instead.";
  const b = blockers(d);
  return b.length ? `Has ${b.join(", ")} - archive it instead.` : null;
}
export function fundDeleteDraftProblem(d: FundDependencies): string | null {
  if (d.stage !== "draft") return "Only an unused draft fund can be permanently deleted - use lifecycle controls instead.";
  const b = blockers(d);
  return b.length ? `Has ${b.join(", ")} - use lifecycle controls instead.` : null;
}

// ---------------------------------------------------------------- audit vocabulary

export const LIFECYCLE_AUDIT_ACTIONS = [
  "client.archived", "client.restored", "client.draft_deleted",
  "fund.closed", "fund.reopened", "fund.archived", "fund.restored", "fund.draft_deleted",
] as const;
export type LifecycleAuditEvent = {
  actor_user_id: string; resource_type: "client" | "fund"; resource_id: string;
  action: (typeof LIFECYCLE_AUDIT_ACTIONS)[number]; before_state: unknown; after_state: unknown;
  reason: string; at: string; correlation_id: string;
};
export function lifecycleAuditEvent(e: Omit<LifecycleAuditEvent, "at"> & { at?: string }): LifecycleAuditEvent {
  if (!e.reason?.trim()) throw new Error("A reason is required.");
  if (!e.correlation_id) throw new Error("A correlation ID is required.");
  return { ...e, at: e.at ?? new Date().toISOString() };
}
