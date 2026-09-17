import { createFileRoute } from "@tanstack/react-router";

import {
  Empty,
  WorkspaceSection,
  flatten,
  useProfessionalOverview,
} from "@/components/professional-workspace";
import { INVESTMENT_PROFILE_LABELS } from "@/lib/identity-model";

function ClientProfiles() {
  const { data, isPending } = useProfessionalOverview();
  if (isPending) return <Empty>Loading…</Empty>;
  const rows = flatten<any>(data?.views, (v) => v.profiles);

  return (
    <WorkspaceSection
      title="Client profiles"
      description="Only the investment profiles each delegation's scope covers."
    >
      {rows.length === 0 ? (
        <Empty>No profiles are in scope.</Empty>
      ) : (
        <ul className="space-y-2 text-sm">
          {rows.map((p: any) => (
            <li key={p.id} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{p.label}</span>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  {INVESTMENT_PROFILE_LABELS[p.type as keyof typeof INVESTMENT_PROFILE_LABELS] ?? p.type}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{p.client}</p>
            </li>
          ))}
        </ul>
      )}
    </WorkspaceSection>
  );
}

export const Route = createFileRoute("/_authenticated/professional/profiles")({
  component: ClientProfiles,
});
