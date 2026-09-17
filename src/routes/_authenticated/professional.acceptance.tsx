import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AUTHORITY_LABELS, CAPABILITY_LABELS, SCOPE_LABELS } from "@/lib/professional-model";
import { SIGNABLE_DOCUMENT_LABELS } from "@/lib/signatory-model";
import {
  listDelegationsAwaitingAcceptance,
  respondToDelegation,
} from "@/lib/signatory.functions";

function AwaitingAcceptance() {
  const load = useServerFn(listDelegationsAwaitingAcceptance);
  const respond = useServerFn(respondToDelegation);
  const qc = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: ["delegations-awaiting-acceptance"],
    queryFn: () => load(),
    staleTime: 0,
  });

  const mutation = useMutation({
    mutationFn: (input: { delegation_id: string; terms_version: string; decision: "accept" | "decline" }) =>
      respond({ data: input }),
    onSuccess: (_r, input) => {
      toast.success(input.decision === "accept" ? "Accepted." : "Declined.");
      void qc.invalidateQueries({ queryKey: ["delegations-awaiting-acceptance"] });
      void qc.invalidateQueries({ queryKey: ["professional-standing"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not record that."),
  });

  const items = (data?.items ?? []) as any[];

  if (isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing is waiting for your acceptance.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        You are accepting exactly what the client granted. Nothing here can be widened or changed by
        you — if the client later changes it, you will be asked to accept again.
      </p>

      {items.map((item) => (
        <Card key={item.delegationId}>
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <CardTitle className="text-lg">{item.principalName}</CardTitle>
            <Badge variant="secondary">
              {item.acceptanceState === "renewal_required" ? "Changed — accept again" : "Awaiting you"}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <dl className="grid gap-2 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Through</dt>
                <dd>{item.organizationName ?? "Acting personally"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Covers</dt>
                <dd>{SCOPE_LABELS[item.scopeType as keyof typeof SCOPE_LABELS] ?? item.scopeType}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Authority</dt>
                <dd>
                  {AUTHORITY_LABELS[item.authorityLevel as keyof typeof AUTHORITY_LABELS] ??
                    item.authorityLevel}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Dates</dt>
                <dd>
                  {item.effectiveAt ? new Date(item.effectiveAt).toLocaleDateString() : "—"} –{" "}
                  {item.expiresAt ? new Date(item.expiresAt).toLocaleDateString() : "no end date"}
                </dd>
              </div>
            </dl>

            <div>
              <p className="text-xs text-muted-foreground">Permissions</p>
              <ul className="mt-1 list-inside list-disc">
                {item.capabilities.map((c: string) => (
                  <li key={c}>{CAPABILITY_LABELS[c as keyof typeof CAPABILITY_LABELS] ?? c}</li>
                ))}
              </ul>
            </div>

            {item.coveredDocumentTypes?.length ? (
              <div>
                <p className="text-xs text-muted-foreground">Documents covered</p>
                <p>
                  {item.coveredDocumentTypes
                    .map(
                      (t: string) =>
                        SIGNABLE_DOCUMENT_LABELS[t as keyof typeof SIGNABLE_DOCUMENT_LABELS] ?? t,
                    )
                    .join(", ")}
                </p>
              </div>
            ) : null}

            <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
              Terms version {item.termsVersion}. Accepting records your agreement permanently; it does
              not by itself let you sign. Signing also needs an accepted authority document.
            </p>

            <div className="flex gap-2">
              <Button
                disabled={mutation.isPending}
                onClick={() =>
                  mutation.mutate({
                    delegation_id: item.delegationId,
                    terms_version: item.termsVersion,
                    decision: "accept",
                  })
                }
              >
                Accept
              </Button>
              <Button
                variant="outline"
                disabled={mutation.isPending}
                onClick={() =>
                  mutation.mutate({
                    delegation_id: item.delegationId,
                    terms_version: item.termsVersion,
                    decision: "decline",
                  })
                }
              >
                Decline
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/professional/acceptance")({
  head: () => ({
    meta: [
      { title: "Authorisations awaiting acceptance — Harmonious" },
      {
        name: "description",
        content: "Review and accept the authorisations clients have granted you.",
      },
      { property: "og:title", content: "Authorisations awaiting acceptance — Harmonious" },
      { property: "og:description", content: "Accept client authorisations before acting." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AwaitingAcceptance,
});
