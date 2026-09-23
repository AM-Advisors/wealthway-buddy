import { Link, createFileRoute } from "@tanstack/react-router";

import { AttentionCenter } from "@/components/attention-center";
import { Empty, WorkspaceSection, useProfessionalOverview } from "@/components/professional-workspace";
import { AUTHORITY_LABELS, CAPABILITY_LABELS } from "@/lib/professional-model";

function MyClients() {
  const { data, isPending } = useProfessionalOverview();
  if (isPending) return <Empty>Loading…</Empty>;

  const clients = data?.clients ?? [];
  const viewByDelegation = new Map((data?.views ?? []).map((v: any) => [v.context.delegationId, v]));

  return (
    <div className="space-y-6">
      <AttentionCenter workspace="professional" />
      <WorkspaceSection
      title="My clients"
      description="Built only from live delegations. Nothing outside the granted scope appears."
    >

      {clients.length === 0 ? (
        <Empty>No client has authorised you yet.</Empty>
      ) : (
        <ul className="space-y-3">
          {clients.map((c: any) => {
            const view: any = viewByDelegation.get(c.delegationId);
            return (
              <li key={c.delegationId} className="rounded-md border border-border p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{c.principalName}</p>
                    <p className="text-muted-foreground">
                      {c.organizationName ? `${c.organizationName} — ` : ""}
                      {c.scopeLabel} — {AUTHORITY_LABELS[c.authorityLevel] ?? c.authorityLevel}
                    </p>
                  </div>
                  <Link
                    to="/professional/acting/$delegationId"
                    params={{ delegationId: c.delegationId }}
                    className="rounded-md border border-border px-3 py-1.5"
                  >
                    Open
                  </Link>
                </div>
                <dl className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div>
                    <dt className="text-muted-foreground">Profiles in scope</dt>
                    <dd>{view?.profiles?.length ?? 0}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Funds / investments</dt>
                    <dd>
                      {view?.funds?.length ?? 0} / {view?.investments?.length ?? 0}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Status</dt>
                    <dd className="capitalize">{c.status}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Effective</dt>
                    <dd>{c.effectiveAt ? new Date(c.effectiveAt).toLocaleDateString() : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Expires</dt>
                    <dd>{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : "No expiry"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Last activity</dt>
                    <dd>{c.lastActivityAt ? new Date(c.lastActivityAt).toLocaleString() : "—"}</dd>
                  </div>
                </dl>
                <p className="mt-2 text-xs text-muted-foreground">
                  May view: {c.capabilities.map((x: string) => CAPABILITY_LABELS[x] ?? x).join(", ")}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </WorkspaceSection>
  );
}

export const Route = createFileRoute("/_authenticated/professional/")({
  component: MyClients,
});
