/**
 * Pure rules for the investor reporting centre.
 *
 * The reporting centre is a *distribution* layer. It never calculates NAV,
 * performance, capital accounts or financial statements: it assembles records
 * that are already approved or published, freezes the exact versions it used,
 * and decides who may see which section.
 *
 * Nothing in this module touches the database.
 */
import type { DelegationCapability } from "@/lib/delegation-model";

// ------------------------------------------------------------------ sections

export const PACKAGE_SECTIONS = [
  "cover",
  "nav_summary",
  "capital_account",
  "investor_performance",
  "financial_statements",
  "portfolio_summary",
  "capital_activity",
  "capital_calls",
  "notices",
  "documents",
] as const;
export type PackageSection = (typeof PACKAGE_SECTIONS)[number];

export const SECTION_LABELS: Record<PackageSection, string> = {
  cover: "Cover and summary",
  nav_summary: "Fund net asset value",
  capital_account: "Your capital account statement",
  investor_performance: "Your performance",
  financial_statements: "Fund financial statements",
  portfolio_summary: "Portfolio summary",
  capital_activity: "Capital activity",
  capital_calls: "Capital calls",
  notices: "Notices",
  documents: "Documents",
};

/**
 * Internal-only material. These may never be assembled into an investor
 * package, whatever a template asks for.
 */
export const INTERNAL_ONLY_SOURCES: ReadonlySet<string> = new Set([
  "trial_balance",
  "general_ledger",
  "journal_entries",
  "journal_lines",
  "journal_register",
  "accounting_workpapers",
  "report_exceptions",
  "bank_reconciliations",
  "accounting_exceptions",
  "close_checklist_items",
]);

export function isInvestorSafeSource(sourceTable: string | null | undefined): boolean {
  if (!sourceTable) return true;
  return !INTERNAL_ONLY_SOURCES.has(sourceTable);
}

export function isPackageSection(value: unknown): value is PackageSection {
  return typeof value === "string" && (PACKAGE_SECTIONS as readonly string[]).includes(value);
}

/** Sections a template asked for, minus anything that is not investor material. */
export function sanitizeSections(sections: unknown): PackageSection[] {
  if (!Array.isArray(sections)) return [];
  return sections.filter(isPackageSection);
}

// ------------------------------------------------------- delegated access

/**
 * The exact capability a delegated professional must hold for each section.
 * A delegation never exposes a section implicitly: the capability has to be
 * granted on that delegation and allowed at its authority ceiling.
 */
export const SECTION_CAPABILITY: Record<PackageSection, DelegationCapability> = {
  cover: "view_investments",
  nav_summary: "view_investments",
  capital_account: "view_financial_statements",
  investor_performance: "view_financial_statements",
  financial_statements: "view_financial_statements",
  portfolio_summary: "view_investments",
  capital_activity: "view_distributions",
  capital_calls: "view_capital_calls",
  notices: "view_documents",
  documents: "view_documents",
};

// ----------------------------------------------------------- fund policy

export const PORTFOLIO_VISIBILITIES = ["none", "summary", "detail"] as const;
export type PortfolioVisibility = (typeof PORTFOLIO_VISIBILITIES)[number];

export const PORTFOLIO_COLUMNS = [
  "asset",
  "security",
  "cost",
  "value",
  "change",
  "pct_nav",
  "status",
] as const;
export type PortfolioColumn = (typeof PORTFOLIO_COLUMNS)[number];

/** Columns that only ever appear when the fund allows full portfolio detail. */
const DETAIL_ONLY_COLUMNS: ReadonlySet<PortfolioColumn> = new Set(["security", "cost", "change"]);

export interface PortfolioRow {
  asset: string;
  security?: string | null;
  costCents?: number | null;
  valueCents?: number | null;
  changeCents?: number | null;
  pctOfNav?: number | null;
  status?: string | null;
}

/**
 * Fund policy — not fund access — decides what an investor sees about the
 * underlying companies. With no policy the answer is nothing.
 */
export function portfolioForInvestor(
  rows: PortfolioRow[],
  visibility: PortfolioVisibility,
  columns: readonly string[] = PORTFOLIO_COLUMNS,
): Array<Partial<PortfolioRow>> {
  if (visibility === "none") return [];
  const allowed = new Set(
    (columns as readonly string[]).filter((c): c is PortfolioColumn =>
      (PORTFOLIO_COLUMNS as readonly string[]).includes(c),
    ),
  );
  return rows.map((row) => {
    const out: Partial<PortfolioRow> = { asset: row.asset };
    const keep = (column: PortfolioColumn) =>
      allowed.has(column) && (visibility === "detail" || !DETAIL_ONLY_COLUMNS.has(column));
    if (keep("security")) out.security = row.security ?? null;
    if (keep("cost")) out.costCents = row.costCents ?? null;
    if (keep("value")) out.valueCents = row.valueCents ?? null;
    if (keep("change")) out.changeCents = row.changeCents ?? null;
    if (keep("pct_nav")) out.pctOfNav = row.pctOfNav ?? null;
    if (keep("status")) out.status = row.status ?? null;
    return out;
  });
}

// ------------------------------------------------------------- templates

export interface PackageTemplatePreset {
  code: string;
  name: string;
  fundTypes: string[];
  frequency: "month" | "quarter" | "year";
  sections: PackageSection[];
  requiredComponents: PackageSection[];
  portfolioDetail: "policy" | "none" | "summary" | "detail";
}

export const TEMPLATE_PRESETS: PackageTemplatePreset[] = [
  {
    code: "spv_report",
    name: "SPV report",
    fundTypes: ["spv"],
    frequency: "quarter",
    sections: [
      "cover",
      "nav_summary",
      "capital_account",
      "investor_performance",
      "portfolio_summary",
      "capital_activity",
      "documents",
    ],
    requiredComponents: ["nav_summary", "capital_account"],
    portfolioDetail: "policy",
  },
  {
    code: "vc_quarterly",
    name: "VC quarterly report",
    fundTypes: ["venture"],
    frequency: "quarter",
    sections: [
      "cover",
      "nav_summary",
      "capital_account",
      "investor_performance",
      "financial_statements",
      "portfolio_summary",
      "capital_activity",
      "capital_calls",
      "notices",
      "documents",
    ],
    requiredComponents: ["nav_summary", "capital_account", "investor_performance"],
    portfolioDetail: "policy",
  },
  {
    code: "pe_quarterly",
    name: "PE quarterly report",
    fundTypes: ["private_equity"],
    frequency: "quarter",
    sections: [
      "cover",
      "nav_summary",
      "capital_account",
      "investor_performance",
      "financial_statements",
      "portfolio_summary",
      "capital_activity",
      "capital_calls",
      "notices",
      "documents",
    ],
    requiredComponents: ["nav_summary", "capital_account", "investor_performance"],
    portfolioDetail: "policy",
  },
  {
    code: "hedge_monthly",
    name: "Hedge fund monthly report",
    fundTypes: ["hedge"],
    frequency: "month",
    sections: ["cover", "nav_summary", "capital_account", "investor_performance", "notices"],
    requiredComponents: ["nav_summary", "capital_account"],
    portfolioDetail: "none",
  },
  {
    code: "annual_package",
    name: "Annual investor package",
    fundTypes: [],
    frequency: "year",
    sections: [
      "cover",
      "nav_summary",
      "capital_account",
      "investor_performance",
      "financial_statements",
      "portfolio_summary",
      "capital_activity",
      "capital_calls",
      "notices",
      "documents",
    ],
    requiredComponents: [
      "nav_summary",
      "capital_account",
      "investor_performance",
      "financial_statements",
    ],
    portfolioDetail: "policy",
  },
];

export function presetForFund(
  fundType: string | null | undefined,
  frequency: string,
): PackageTemplatePreset {
  const byType = TEMPLATE_PRESETS.find(
    (t) => t.frequency === frequency && fundType && t.fundTypes.includes(fundType),
  );
  if (byType) return byType;
  const byFrequency = TEMPLATE_PRESETS.find((t) => t.frequency === frequency);
  return byFrequency ?? TEMPLATE_PRESETS[1]!;
}

// ------------------------------------------------------------- lifecycle

export const PACKAGE_STATUSES = [
  "draft",
  "review",
  "approved",
  "published",
  "superseded",
] as const;
export type PackageStatus = (typeof PACKAGE_STATUSES)[number];

export const PACKAGE_FLOW: Record<PackageStatus, PackageStatus[]> = {
  draft: ["review"],
  review: ["draft", "approved"],
  approved: ["review", "published"],
  published: ["superseded"],
  superseded: [],
};

export function canTransitionPackage(from: PackageStatus, to: PackageStatus): boolean {
  return (PACKAGE_FLOW[from] ?? []).includes(to);
}

export function isImmutablePackage(status: string): boolean {
  return status === "published" || status === "superseded";
}

/** The same person may not generate a package and then publish it. */
export function segregationError(
  actorUserId: string,
  pkg: { generated_by?: string | null; approved_by?: string | null },
  to: PackageStatus,
): string | null {
  if (to === "approved" && pkg.generated_by && pkg.generated_by === actorUserId) {
    return "The person who generated a package cannot approve it.";
  }
  if (to === "published" && pkg.generated_by && pkg.generated_by === actorUserId) {
    return "The person who generated a package cannot publish it.";
  }
  return null;
}

// --------------------------------------------------------- completeness

export interface ComponentRef {
  sectionKey: string;
  sourceTable?: string | null;
  sourceId?: string | null;
  sourceVersion?: number | null;
  sourceStatus?: string | null;
}

export const PUBLISHABLE_SOURCE_STATUSES: ReadonlySet<string> = new Set([
  "approved",
  "published",
  "finalized",
  "superseded",
]);

export interface PackageException {
  kind: string;
  severity: "blocking" | "warning";
  detail: string;
}

/**
 * A package may only carry components that are already eligible for investor
 * publication, and must carry everything its template requires.
 */
export function packageExceptions(
  required: readonly string[],
  components: ComponentRef[],
): PackageException[] {
  const exceptions: PackageException[] = [];
  const present = new Set(components.map((c) => c.sectionKey));

  for (const key of required) {
    if (!present.has(key)) {
      exceptions.push({
        kind: "missing_component",
        severity: "blocking",
        detail: `${SECTION_LABELS[key as PackageSection] ?? key} has not been published for this period.`,
      });
    }
  }

  for (const component of components) {
    if (!isInvestorSafeSource(component.sourceTable)) {
      exceptions.push({
        kind: "internal_material",
        severity: "blocking",
        detail: `${component.sectionKey} draws on internal-only records and cannot be sent to an investor.`,
      });
    }
    if (
      component.sourceTable &&
      component.sourceStatus &&
      !PUBLISHABLE_SOURCE_STATUSES.has(component.sourceStatus)
    ) {
      exceptions.push({
        kind: "component_not_published",
        severity: "blocking",
        detail: `${component.sectionKey} references a record that is still ${component.sourceStatus}.`,
      });
    }
  }
  return exceptions;
}

export function blockingExceptions(exceptions: PackageException[]): PackageException[] {
  return (exceptions ?? []).filter((e) => e.severity === "blocking");
}

// ------------------------------------------------------------- manifest

export interface PackageManifest {
  investorUserId: string;
  investmentProfileId: string | null;
  positionId: string | null;
  offeringId: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  templateCode: string;
  templateVersion: number;
  navVersionId?: string | null;
  navVersion?: number | null;
  capitalStatementId?: string | null;
  capitalStatementVersion?: number | null;
  performanceRunId?: string | null;
  performanceVersion?: number | null;
  financialReportIds?: string[];
  documentIds?: string[];
  noticeIds?: string[];
  generatedBy?: string | null;
  generatedAt?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  publishedBy?: string | null;
  publishedAt?: string | null;
}

const MANIFEST_REQUIRED: (keyof PackageManifest)[] = [
  "investorUserId",
  "offeringId",
  "periodStart",
  "periodEnd",
  "templateCode",
  "templateVersion",
  "generatedBy",
  "approvedBy",
  "publishedBy",
];

/** What a manifest is still missing before the package may be published. */
export function manifestGaps(manifest: Partial<PackageManifest>): string[] {
  return MANIFEST_REQUIRED.filter((key) => {
    const value = manifest[key];
    return value === undefined || value === null || value === "";
  }).map(String);
}

export function publicationBlockers(
  exceptions: PackageException[],
  manifest: Partial<PackageManifest>,
): string[] {
  const blockers = blockingExceptions(exceptions).map((e) => e.detail);
  const gaps = manifestGaps(manifest);
  if (gaps.length > 0) {
    blockers.push(`The package manifest is incomplete: ${gaps.join(", ")}.`);
  }
  return blockers;
}

// -------------------------------------------------------------- delivery

export const DELIVERY_EVENTS = [
  "published",
  "delivered",
  "opened",
  "downloaded",
  "acknowledged",
  "exported",
] as const;
export type DeliveryEvent = (typeof DELIVERY_EVENTS)[number];

export interface DeliveryState {
  published: string | null;
  delivered: string | null;
  opened: string | null;
  downloaded: string | null;
  acknowledged: string | null;
  /** Email delivery is never treated as proof the investor saw anything. */
  accessedInPortal: boolean;
}

export function deliveryState(
  events: Array<{ event: string; channel?: string | null; created_at: string }>,
): DeliveryState {
  const first = (name: string, portalOnly = false) => {
    const match = (events ?? [])
      .filter((e) => e.event === name && (!portalOnly || (e.channel ?? "portal") === "portal"))
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0];
    return match ? match.created_at : null;
  };
  const opened = first("opened", true);
  const downloaded = first("downloaded", true);
  return {
    published: first("published"),
    delivered: first("delivered"),
    opened,
    downloaded,
    acknowledged: first("acknowledged", true),
    accessedInPortal: Boolean(opened || downloaded),
  };
}

// ------------------------------------------------------- document library

export const DOCUMENT_GROUPS = [
  "Reporting",
  "Capital statements",
  "Financial statements",
  "Performance",
  "Capital calls",
  "Distributions",
  "Tax",
  "Subscription and legal",
  "Notices",
] as const;
export type DocumentGroup = (typeof DOCUMENT_GROUPS)[number];

export function documentGroupFor(kind: string | null | undefined): DocumentGroup {
  const value = String(kind ?? "").toLowerCase();
  if (value.includes("capital_call") || value.includes("capital call")) return "Capital calls";
  if (value.includes("distribution")) return "Distributions";
  if (value.includes("tax") || value.includes("k-1") || value.includes("k1")) return "Tax";
  if (value.includes("capital_statement") || value.includes("capital account")) {
    return "Capital statements";
  }
  if (value.includes("performance")) return "Performance";
  if (value.includes("financial")) return "Financial statements";
  if (value.includes("notice")) return "Notices";
  if (value.includes("package") || value.includes("report")) return "Reporting";
  return "Subscription and legal";
}

// ------------------------------------------------------------- branding

export interface Branding {
  administrator: string;
  fundName: string | null;
  fundLogoUrl: string | null;
  periodLabel: string | null;
  contactName: string | null;
  contactEmail: string | null;
}

/** Branding is presentation only: it can never change data or authorization. */
export function brandingFor(
  fundName: string,
  periodLabel: string,
  policy: {
    branding?: Record<string, unknown> | null;
    administrator_attribution?: string | null;
    contact?: Record<string, unknown> | null;
  } | null,
): Branding {
  const branding = (policy?.branding ?? {}) as Record<string, unknown>;
  const contact = (policy?.contact ?? {}) as Record<string, unknown>;
  return {
    administrator: String(policy?.administrator_attribution ?? "Administered by Harmonious"),
    fundName: (branding["fundName"] as string) ?? fundName,
    fundLogoUrl: (branding["logoUrl"] as string) ?? null,
    periodLabel,
    contactName: (contact["name"] as string) ?? null,
    contactEmail: (contact["email"] as string) ?? null,
  };
}
