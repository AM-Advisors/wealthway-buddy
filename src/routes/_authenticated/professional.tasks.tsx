import { createFileRoute } from "@tanstack/react-router";

import {
  Empty,
  WorkspaceSection,
  flatten,
  useProfessionalOverview,
} from "@/components/professional-workspace";

function Tasks() {
  const { data, isPending } = useProfessionalOverview();
  if (isPending) return <Empty>Loading…</Empty>;
  const rows = flatten<any>(data?.views, (v) => v.tasks);

  return (
    <WorkspaceSection
      title="Tasks"
      description="What is outstanding for your clients. Viewing only — the client still acts."
    >
      {rows.length === 0 ? (
        <Empty>Nothing outstanding.</Empty>
      ) : (
        <ul className="space-y-1 text-sm">
          {rows.map((t: any, i: number) => (
            <li key={i}>
              {t.client} — {t.label}
            </li>
          ))}
        </ul>
      )}
    </WorkspaceSection>
  );
}

export const Route = createFileRoute("/_authenticated/professional/tasks")({
  component: Tasks,
});
