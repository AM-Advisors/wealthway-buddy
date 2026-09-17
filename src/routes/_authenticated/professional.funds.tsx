import { createFileRoute } from "@tanstack/react-router";

import {
  Empty,
  WorkspaceSection,
  flatten,
  useProfessionalOverview,
} from "@/components/professional-workspace";

function Funds() {
  const { data, isPending } = useProfessionalOverview();
  if (isPending) return <Empty>Loading…</Empty>;
  const rows = flatten<any>(data?.views, (v) => v.funds);

  return (
    <WorkspaceSection title="Funds" description="Funds reachable through a client's delegation.">
      {rows.length === 0 ? (
        <Empty>No funds are in scope.</Empty>
      ) : (
        <ul className="space-y-2 text-sm">
          {rows.map((f: any, i: number) => (
            <li key={`${f.delegationId}-${f.id}-${i}`} className="rounded-md border border-border p-3">
              <span className="font-medium">{f.name}</span>
              <p className="mt-1 text-xs text-muted-foreground">
                {f.client}
                {f.regType ? ` — ${String(f.regType).toUpperCase()}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </WorkspaceSection>
  );
}

export const Route = createFileRoute("/_authenticated/professional/funds")({
  component: Funds,
});
