import { createFileRoute } from "@tanstack/react-router";

import {
  Empty,
  WorkspaceSection,
  flatten,
  useProfessionalOverview,
} from "@/components/professional-workspace";

const money = (cents: number | null) =>
  cents == null ? "—" : `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

function Investments() {
  const { data, isPending } = useProfessionalOverview();
  if (isPending) return <Empty>Loading…</Empty>;
  const rows = flatten<any>(data?.views, (v) => v.investments);

  return (
    <WorkspaceSection
      title="Investments"
      description="Commitments and funding status for the investments in scope."
    >
      {rows.length === 0 ? (
        <Empty>No investments are in scope.</Empty>
      ) : (
        <ul className="space-y-2 text-sm">
          {rows.map((a: any) => (
            <li key={a.id} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{a.fundName}</span>
                <span>{money(a.commitmentCents)}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {a.client} — {String(a.status).replace(/_/g, " ")} — funding{" "}
                {String(a.fundingStatus).replace(/_/g, " ")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </WorkspaceSection>
  );
}

export const Route = createFileRoute("/_authenticated/professional/investments")({
  component: Investments,
});
