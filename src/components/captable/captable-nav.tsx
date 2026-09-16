import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

export const CAP_TABLE_SECTIONS = [
  { to: "/client/cap-table", label: "Overview", exact: true },
  { to: "/client/cap-table/table", label: "Cap table" },
  { to: "/client/cap-table/securities", label: "Securities" },
  { to: "/client/cap-table/employees", label: "Employees" },
  { to: "/client/cap-table/investors", label: "Investors" },
  { to: "/client/cap-table/fundraising", label: "Fundraising" },
  { to: "/client/cap-table/secondaries", label: "Secondaries" },
  { to: "/client/cap-table/exposure", label: "Exposure" },
  { to: "/client/cap-table/compliance", label: "Compliance" },
  { to: "/client/cap-table/documents", label: "Documents" },
  { to: "/client/cap-table/reports", label: "Reports" },
  { to: "/client/cap-table/migration", label: "Migration" },
  { to: "/client/cap-table/settings", label: "Settings" },
] as const;

export function CapTableNav() {
  return (
    <nav
      aria-label="CapTable sections"
      className="-mx-1 flex gap-1 overflow-x-auto border-b pb-px"
    >
      {CAP_TABLE_SECTIONS.map((section) => (
        <Link
          key={section.to}
          to={section.to}
          activeOptions={{ exact: Boolean((section as { exact?: boolean }).exact) }}
          className={cn(
            "whitespace-nowrap rounded-t-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
          )}
          activeProps={{ className: "border-b-2 border-primary text-foreground" }}
        >
          {section.label}
        </Link>
      ))}
    </nav>
  );
}
