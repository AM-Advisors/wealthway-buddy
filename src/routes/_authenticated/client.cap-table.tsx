import { Outlet, createFileRoute } from "@tanstack/react-router";

import { CapPolicyGate } from "@/components/cap-policy-gate";
import { CapTableNav } from "@/components/captable/captable-nav";
import { CapTableProvider } from "@/components/captable/captable-context";
import { AddStakeholderDialog, IssueSecurityDialog } from "@/components/captable/securities-view";
import { useCapTable } from "@/components/captable/captable-context";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { DemoBadge } from "@/components/captable/captable-states";

export const Route = createFileRoute("/_authenticated/client/cap-table")({
  head: () => ({
    meta: [
      { title: "Harmonious CapTable — Know exactly who owns your company" },
      {
        name: "description",
        content:
          "Cap table, employee equity, investor records, fundraising, secondary controls and ownership verification in one private-market platform.",
      },
      { property: "og:title", content: "Harmonious CapTable" },
      {
        property: "og:description",
        content:
          "The ownership operating system for private companies: shares, securities, stakeholders, transfers and the record behind every change.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CapTableLayout,
});

function CapTableLayout() {
  return (
    <CapPolicyGate>
      <CapTableProvider>
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
                Cap Table <DemoBadge />
              </h2>
              <p className="text-sm text-muted-foreground">
                Who owns your company, calculated from the securities you record.
              </p>
            </div>
            <CapTableActions />
          </div>
          <CapTableNav />
          <Outlet />
        </div>
      </CapTableProvider>
    </CapPolicyGate>
  );
}

/** Stakeholder ≠ ownership: Add Stakeholder creates the holder, Issue Security creates ownership. */
function CapTableActions() {
  const { workspace, refetch } = useCapTable();
  if (!workspace?.company || !workspace.canManage) return null;
  return (
    <div className="flex w-full flex-wrap gap-2 sm:w-auto">
      <AddStakeholderDialog onDone={refetch} />
      <IssueSecurityDialog onDone={refetch} />
      <Button variant="ghost" asChild>
        <Link to="/client/cap-table/migration">Import Cap Table</Link>
      </Button>
    </div>
  );
}
