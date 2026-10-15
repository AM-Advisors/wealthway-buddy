import { Link } from "@tanstack/react-router";

const TABS = [
  { to: "/ops/fund-migration/requests", label: "Approval queue" },
  { to: "/ops/fund-migration/wix", label: "Wix funds" },
  { to: "/ops/fund-migration", label: "Google Drive gaps" },
  { to: "/ops/fund-migration/sources", label: "Source reconciliation" },
] as const;

/** Shared tab bar for the Funds → Migrations workspace. Display only. */
export function MigrationsTabs() {
  return (
    <nav aria-label="Migrations" className="flex flex-wrap gap-1 border-b">
      {TABS.map((t) => (
        <Link
          key={t.to}
          to={t.to}
          activeOptions={{ exact: true }}
          className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
          activeProps={{ className: "border-primary font-medium text-foreground" }}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
