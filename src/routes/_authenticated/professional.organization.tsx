import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Empty, WorkspaceSection } from "@/components/professional-workspace";
import { getProfessionalStanding } from "@/lib/professional.functions";

function Organization() {
  const standing = useServerFn(getProfessionalStanding);
  const { data, isPending } = useQuery({
    queryKey: ["professional-standing"],
    queryFn: () => standing(),
    staleTime: 0,
  });
  if (isPending) return <Empty>Loading…</Empty>;

  return (
    <WorkspaceSection
      title="Organization"
      description="Your seats. A seat on its own gives no access to any client's information."
    >
      {(data?.memberships ?? []).length === 0 ? (
        <Empty>You are not seated at a firm.</Empty>
      ) : (
        <ul className="space-y-2 text-sm">
          {(data?.memberships ?? []).map((m: any) => (
            <li key={m.id} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{m.organizationName ?? "Firm"}</span>
                <span className="text-xs capitalize text-muted-foreground">{m.status}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {String(m.organizationType ?? "").replace(/_/g, " ")} — seat: {m.seatRole}
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Active client authorisations: {data?.activeDelegations ?? 0}
      </p>
    </WorkspaceSection>
  );
}

export const Route = createFileRoute("/_authenticated/professional/organization")({
  component: Organization,
});
