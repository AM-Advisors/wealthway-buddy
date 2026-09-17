import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Empty, WorkspaceSection, useProfessionalOverview } from "@/components/professional-workspace";
import { getDelegationActivity } from "@/lib/professional.functions";

function ClientActivity({ delegationId, label }: { delegationId: string; label: string }) {
  const load = useServerFn(getDelegationActivity);
  const { data } = useQuery({
    queryKey: ["delegation-activity", delegationId],
    queryFn: () => load({ data: { delegation_id: delegationId } }),
    staleTime: 0,
  });
  const events = data?.events ?? [];
  return (
    <div className="rounded-md border border-border p-3 text-sm">
      <p className="font-medium">{label}</p>
      {events.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">No recorded activity yet.</p>
      ) : (
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {events.map((e: any, i: number) => (
            <li key={i}>
              {new Date(e.created_at).toLocaleString()} — {String(e.action).replace(/_/g, " ")}
              {e.detail ? ` (${e.detail})` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Activity() {
  const { data, isPending } = useProfessionalOverview();
  if (isPending) return <Empty>Loading…</Empty>;
  const clients = data?.clients ?? [];

  return (
    <WorkspaceSection
      title="Activity"
      description="Every delegated view is recorded against the human who made it."
    >
      {clients.length === 0 ? (
        <Empty>No delegated activity.</Empty>
      ) : (
        <div className="space-y-3">
          {clients.map((c: any) => (
            <ClientActivity key={c.delegationId} delegationId={c.delegationId} label={c.principalName} />
          ))}
        </div>
      )}
    </WorkspaceSection>
  );
}

export const Route = createFileRoute("/_authenticated/professional/activity")({
  component: Activity,
});
