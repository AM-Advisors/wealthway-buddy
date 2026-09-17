import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { GrantAccessWizard } from "@/components/grant-access-wizard";
import { changeAccessGrant, listAccessGrants } from "@/lib/access-manager.functions";
import { revokeDelegation } from "@/lib/delegations.functions";
import { AUTHORITY_LABELS, CAPABILITY_LABELS, SCOPE_LABELS } from "@/lib/professional-model";

function ClientAccessManager() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAccessGrants);
  const changeFn = useServerFn(changeAccessGrant);
  const revokeFn = useServerFn(revokeDelegation);
  const [wizard, setWizard] = useState(false);

  const { data, isPending } = useQuery({
    queryKey: ["access-grants"],
    queryFn: () => listFn(),
    staleTime: 0,
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["access-grants"] });
    // Any delegated data the professional's browser cached is irrelevant —
    // the server re-checks — but clear our own view of it too.
    qc.removeQueries({ queryKey: ["delegated-client"] });
    qc.removeQueries({ queryKey: ["professional-overview"] });
  };

  const change = useMutation({
    mutationFn: (input: any) => changeFn({ data: input }),
    onSuccess: () => {
      toast.success("Access updated.");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "We could not update that access."),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeFn({ data: { delegation_id: id } }),
    onSuccess: () => {
      toast.success("Access revoked. It stops immediately.");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "We could not revoke that access."),
  });

  const grants = data?.grants ?? [];

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl">Who can see my information</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Advisers, lawyers and accountants only see what you authorise here, and only for as long
            as you allow it.
          </p>
        </div>
        {!wizard && <Button onClick={() => setWizard(true)}>Grant access</Button>}
      </header>

      {wizard && <GrantAccessWizard onDone={() => setWizard(false)} />}

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : grants.length === 0 ? (
        <p className="text-sm text-muted-foreground">No one else has access to your information.</p>
      ) : (
        <ul className="space-y-3">
          {grants.map((g: any) => (
            <li key={g.id} className="rounded-lg border border-border p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{g.professionalName}</p>
                  <p className="text-muted-foreground">
                    {g.firm ? `${g.firm} — ` : ""}
                    {SCOPE_LABELS[g.scopeType] ?? g.scopeType} —{" "}
                    {AUTHORITY_LABELS[g.authorityLevel] ?? g.authorityLevel}
                  </p>
                </div>
                <span className="text-xs capitalize text-muted-foreground">{g.status}</span>
              </div>

              <p className="mt-2 text-xs text-muted-foreground">
                May view: {g.capabilities.map((c: string) => CAPABILITY_LABELS[c] ?? c).join(", ")}
              </p>

              <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">Effective</dt>
                  <dd>{g.effectiveAt ? new Date(g.effectiveAt).toLocaleDateString() : "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Expires</dt>
                  <dd>{g.expiresAt ? new Date(g.expiresAt).toLocaleDateString() : "No expiry"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Last activity</dt>
                  <dd>{g.lastActivityAt ? new Date(g.lastActivityAt).toLocaleString() : "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Authorisation document</dt>
                  <dd>{g.authorityDocument ?? "None"}</dd>
                </div>
              </dl>

              {g.status !== "revoked" && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {g.status === "suspended" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => change.mutate({ delegation_id: g.id, action: "resume" })}
                    >
                      Resume
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => change.mutate({ delegation_id: g.id, action: "suspend" })}
                    >
                      Suspend
                    </Button>
                  )}
                  <input
                    type="date"
                    className="rounded-md border border-border px-2 py-1 text-xs"
                    onChange={(e) =>
                      change.mutate({
                        delegation_id: g.id,
                        action: "expiry",
                        expires_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                      })
                    }
                    aria-label="Change expiry date"
                  />
                  <Button variant="destructive" size="sm" onClick={() => revoke.mutate(g.id)}>
                    Revoke
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export const Route = createFileRoute("/_authenticated/access")({
  head: () => ({
    meta: [
      { title: "Who can see my information — Harmonious" },
      {
        name: "description",
        content:
          "Grant, review, suspend or revoke the access your adviser, lawyer or accountant has to your Harmonious information.",
      },
      { property: "og:title", content: "Who can see my information — Harmonious" },
      {
        property: "og:description",
        content: "Full control over professional access to your profiles, investments and documents.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ClientAccessManager,
});
