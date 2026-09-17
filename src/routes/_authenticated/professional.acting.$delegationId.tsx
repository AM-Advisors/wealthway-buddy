import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import {
  ActingOnBehalfBanner,
  Empty,
  WorkspaceSection,
} from "@/components/professional-workspace";
import { getDelegatedClient } from "@/lib/professional.functions";

const money = (cents: number | null) =>
  cents == null ? "—" : `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

function DelegatedClient() {
  const { delegationId } = useParams({ from: "/_authenticated/professional/client/$delegationId" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const load = useServerFn(getDelegatedClient);

  // Authorization is re-checked server-side on every fetch; nothing here is
  // trusted from cache, and a revoked grant fails immediately.
  const { data, isPending, error } = useQuery({
    queryKey: ["delegated-client", delegationId],
    queryFn: () => load({ data: { delegation_id: delegationId } }),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    retry: false,
  });

  function exit() {
    qc.removeQueries({ queryKey: ["delegated-client"] });
    void navigate({ to: "/professional" });
  }

  if (isPending) return <Empty>Loading…</Empty>;
  if (error || !data) {
    return (
      <WorkspaceSection title="Access unavailable">
        <Empty>This delegated access is no longer available. It may have been revoked or expired.</Empty>
      </WorkspaceSection>
    );
  }

  const view: any = data;

  return (
    <div className="space-y-6">
      <ActingOnBehalfBanner
        principalName={view.context.principalName}
        organizationName={view.context.organizationName}
        scopeLabel={view.context.scopeLabel}
        authorityLevel={view.context.authorityLevel}
        capabilities={view.context.capabilities}
        expiresAt={view.context.expiresAt}
        onExit={exit}
      />

      {view.person ? (
        <WorkspaceSection title="Client" description="Summary details only — never identity documents.">
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Name</dt>
              <dd>{view.person.name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Email</dt>
              <dd>{view.person.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Location</dt>
              <dd>{view.person.location || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Residence</dt>
              <dd>{view.person.residence ?? "—"}</dd>
            </div>
          </dl>
        </WorkspaceSection>
      ) : null}

      {view.compliance ? (
        <WorkspaceSection title="Verification" description="Status only — no check provider data.">
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Identity</dt>
              <dd>{view.compliance.identity}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Screening</dt>
              <dd>{view.compliance.screening}</dd>
            </div>
          </dl>
          {view.compliance.accreditations.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm">
              {view.compliance.accreditations.map((a: any, i: number) => (
                <li key={i}>
                  Accreditation: {a.status}
                  {a.expiresAt ? ` — expires ${new Date(a.expiresAt).toLocaleDateString()}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </WorkspaceSection>
      ) : null}

      <WorkspaceSection title="Investment profiles">
        {view.profiles.length === 0 ? (
          <Empty>Not in scope.</Empty>
        ) : (
          <ul className="space-y-1 text-sm">
            {view.profiles.map((p: any) => (
              <li key={p.id}>
                {p.label} — {String(p.type).replace(/_/g, " ")}
              </li>
            ))}
          </ul>
        )}
      </WorkspaceSection>

      <WorkspaceSection title="Investments">
        {view.investments.length === 0 ? (
          <Empty>Not in scope.</Empty>
        ) : (
          <ul className="space-y-1 text-sm">
            {view.investments.map((a: any) => (
              <li key={a.id}>
                {a.fundName} — {money(a.commitmentCents)} — {String(a.status).replace(/_/g, " ")}
              </li>
            ))}
          </ul>
        )}
      </WorkspaceSection>

      <WorkspaceSection title="Documents">
        {view.documents.length === 0 ? (
          <Empty>Not in scope.</Empty>
        ) : (
          <ul className="space-y-1 text-sm">
            {view.documents.map((d: any) => (
              <li key={d.id}>
                {d.name} — {d.status}
              </li>
            ))}
          </ul>
        )}
      </WorkspaceSection>

      <WorkspaceSection title="Tax documents">
        {view.taxDocuments.length === 0 ? (
          <Empty>Not in scope.</Empty>
        ) : (
          <ul className="space-y-1 text-sm">
            {view.taxDocuments.map((t: any) => (
              <li key={t.id}>
                {t.name} {t.year ? `(${t.year})` : ""}
              </li>
            ))}
          </ul>
        )}
      </WorkspaceSection>

      <WorkspaceSection title="Banking" description="Last four digits only, and only when separately authorised.">
        {view.banking.length === 0 ? (
          <Empty>Not in scope.</Empty>
        ) : (
          <ul className="space-y-1 text-sm">
            {view.banking.map((b: any) => (
              <li key={b.id}>
                {b.institution ?? "Account"} — ending {b.endingIn ?? "••••"}
              </li>
            ))}
          </ul>
        )}
      </WorkspaceSection>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/professional/client/$delegationId")({
  component: DelegatedClient,
});
