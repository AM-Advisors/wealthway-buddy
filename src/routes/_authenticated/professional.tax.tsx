import { createFileRoute } from "@tanstack/react-router";

import {
  Empty,
  WorkspaceSection,
  flatten,
  useProfessionalOverview,
} from "@/components/professional-workspace";

function Tax() {
  const { data, isPending } = useProfessionalOverview();
  if (isPending) return <Empty>Loading…</Empty>;
  const rows = flatten<any>(data?.views, (v) => v.taxDocuments);

  return (
    <WorkspaceSection
      title="Tax"
      description="Tax documents need their own permission, and every view is recorded."
    >
      {rows.length === 0 ? (
        <Empty>No tax documents are in scope.</Empty>
      ) : (
        <ul className="space-y-2 text-sm">
          {rows.map((t: any) => (
            <li key={t.id} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{t.name}</span>
                <span className="text-xs text-muted-foreground">{t.year ?? ""}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t.client} — {String(t.type).replace(/_/g, " ")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </WorkspaceSection>
  );
}

export const Route = createFileRoute("/_authenticated/professional/tax")({
  component: Tax,
});
