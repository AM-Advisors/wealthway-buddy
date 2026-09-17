import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AUTHORITY_DOCUMENT_LABELS,
  AUTHORITY_REVIEW_LABELS,
  ORG_VERIFICATION_LABELS,
  SIGNABLE_DOCUMENT_LABELS,
  type AuthorityDocumentType,
  type AuthorityReviewStatus,
  type OrgVerificationStatus,
  type SignableDocumentType,
} from "@/lib/signatory-model";
import { getMySignatoryAuthority, revokeSignatory } from "@/lib/signatory.functions";

const docLabel = (t: string) =>
  SIGNABLE_DOCUMENT_LABELS[t as SignableDocumentType] ?? t.replace(/_/g, " ");

function SignatoryAuthority() {
  const load = useServerFn(getMySignatoryAuthority);
  const revoke = useServerFn(revokeSignatory);
  const qc = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: ["my-signatory-authority"],
    queryFn: () => load(),
    staleTime: 0,
  });

  const mutation = useMutation({
    mutationFn: (delegationId: string) => revoke({ data: { delegation_id: delegationId } }),
    onSuccess: () => {
      toast.success("Signing authority withdrawn.");
      void qc.invalidateQueries({ queryKey: ["my-signatory-authority"] });
      void qc.invalidateQueries({ queryKey: ["access-grants"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not withdraw that."),
  });

  const grants = (data?.grants ?? []) as any[];
  const signatures = (data?.signatures ?? []) as any[];

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-3xl">Signing authority</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Who may sign on your behalf, for which of your entities, and for which documents. Nobody can
          move money, change bank details or approve a payment through this — ever.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">People who can sign for you</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isPending ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
          {!isPending && grants.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nobody can sign for you. You can give someone access on the Access page.
            </p>
          ) : null}

          {grants.map((g) => {
            const live = g.status === "active" && !g.revokedAt;
            const accepted = g.acceptanceState === "accepted";
            const acceptedDoc = (g.authorityDocuments ?? []).find(
              (d: any) => d.reviewStatus === "accepted",
            );
            return (
              <div key={g.delegationId} className="space-y-2 rounded-md border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{g.professionalName}</p>
                    <p className="text-xs text-muted-foreground">
                      {g.organizationName ?? "Acting personally"}
                      {g.organizationVerification
                        ? ` · ${
                            ORG_VERIFICATION_LABELS[
                              g.organizationVerification as OrgVerificationStatus
                            ] ?? g.organizationVerification
                          }`
                        : ""}
                    </p>
                  </div>
                  <Badge variant={live && accepted && acceptedDoc ? "default" : "secondary"}>
                    {!live
                      ? "Withdrawn"
                      : !accepted
                        ? "Not accepted yet"
                        : acceptedDoc
                          ? "Can sign"
                          : "Authority document needed"}
                  </Badge>
                </div>

                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">Documents covered</dt>
                    <dd>
                      {(acceptedDoc?.coveredDocumentTypes ?? g.coveredDocumentTypes ?? [])
                        .map(docLabel)
                        .join(", ") || "None yet"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Dates</dt>
                    <dd>
                      {g.effectiveAt ? new Date(g.effectiveAt).toLocaleDateString() : "—"} –{" "}
                      {g.expiresAt ? new Date(g.expiresAt).toLocaleDateString() : "no end date"}
                    </dd>
                  </div>
                </dl>

                {(g.authorityDocuments ?? []).length > 0 ? (
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {g.authorityDocuments.map((d: any) => (
                      <li key={d.id}>
                        {AUTHORITY_DOCUMENT_LABELS[d.type as AuthorityDocumentType] ?? d.type} ·{" "}
                        {d.fileName} ·{" "}
                        {AUTHORITY_REVIEW_LABELS[d.reviewStatus as AuthorityReviewStatus] ??
                          d.reviewStatus}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {g.recentSignatures?.length ? (
                  <p className="text-xs text-muted-foreground">
                    Last signed {docLabel(g.recentSignatures[0].document_type)} on{" "}
                    {new Date(g.recentSignatures[0].signed_at).toLocaleDateString()}.
                  </p>
                ) : null}

                {live ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate(g.delegationId)}
                  >
                    Withdraw signing authority
                  </Button>
                ) : null}
              </div>
            );
          })}

          <p className="text-xs text-muted-foreground">
            Withdrawing stops any future signing straight away. Documents already signed stay valid and
            remain in your history.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Signature activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {signatures.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing has been signed for you.</p>
          ) : null}
          {signatures.map((s) => (
            <div key={s.id} className="rounded-md border border-border p-3 text-sm">
              <p className="font-medium">
                {docLabel(s.document_type)}
                {s.document_name ? ` · ${s.document_name}` : ""}
              </p>
              <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">
                {s.signature_statement}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(s.signed_at).toLocaleString()}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}

export const Route = createFileRoute("/_authenticated/signatory")({
  head: () => ({
    meta: [
      { title: "Signing authority — Harmonious" },
      {
        name: "description",
        content:
          "See who may sign on your behalf, for which entities and documents, and withdraw that authority at any time.",
      },
      { property: "og:title", content: "Signing authority — Harmonious" },
      {
        property: "og:description",
        content: "Control who can sign documents on your behalf at Harmonious.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SignatoryAuthority,
});
