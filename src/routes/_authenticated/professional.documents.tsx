import { createFileRoute } from "@tanstack/react-router";

import {
  Empty,
  WorkspaceSection,
  flatten,
  useProfessionalOverview,
} from "@/components/professional-workspace";

function Documents() {
  const { data, isPending } = useProfessionalOverview();
  if (isPending) return <Empty>Loading…</Empty>;
  const docs = flatten<any>(data?.views, (v) => v.documents);
  const statements = flatten<any>(data?.views, (v) => v.statements);

  return (
    <div className="space-y-6">
      <WorkspaceSection
        title="Documents"
        description="Only documents belonging to investments the delegation covers."
      >
        {docs.length === 0 ? (
          <Empty>No documents are in scope.</Empty>
        ) : (
          <ul className="space-y-2 text-sm">
            {docs.map((d: any) => (
              <li key={d.id} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{d.name}</span>
                  <span className="text-xs text-muted-foreground">{d.status}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {d.client} — {String(d.kind).replace(/_/g, " ")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </WorkspaceSection>

      <WorkspaceSection
        title="Capital account statements"
        description="Requires the financial statements permission."
      >
        {statements.length === 0 ? (
          <Empty>No statements are in scope.</Empty>
        ) : (
          <ul className="space-y-1 text-sm">
            {statements.map((s: any) => (
              <li key={s.id}>
                {s.client} — {new Date(s.date).toLocaleDateString()} (v{s.version})
              </li>
            ))}
          </ul>
        )}
      </WorkspaceSection>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/professional/documents")({
  component: Documents,
});
