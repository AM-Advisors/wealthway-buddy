import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SIGNABLE_DOCUMENT_LABELS, type SignableDocumentType } from "@/lib/signatory-model";
import { getExpiringAuthority, listMySignatures } from "@/lib/signatory.functions";

function AuthorizedSignatures() {
  const loadSignatures = useServerFn(listMySignatures);
  const loadExpiring = useServerFn(getExpiringAuthority);

  const { data: sigs, isPending } = useQuery({
    queryKey: ["my-signatures", "signer"],
    queryFn: () => loadSignatures({ data: { as: "signer" } }),
    staleTime: 0,
  });
  const { data: expiring } = useQuery({
    queryKey: ["expiring-authority"],
    queryFn: () => loadExpiring(),
    staleTime: 0,
  });

  const rows = (sigs?.signatures ?? []) as any[];
  const expiringCount =
    (expiring?.delegations?.length ?? 0) +
    (expiring?.documents?.length ?? 0) +
    (expiring?.credentials?.length ?? 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Expiring authority</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {expiringCount === 0 ? (
            <p className="text-muted-foreground">Nothing lapses in the next 60 days.</p>
          ) : (
            <ul className="list-inside list-disc text-muted-foreground">
              {(expiring?.delegations ?? []).map((d: any) => (
                <li key={d.id}>
                  A client authorisation ends {new Date(d.expires_at).toLocaleDateString()}.
                </li>
              ))}
              {(expiring?.documents ?? []).map((d: any) => (
                <li key={d.id}>
                  {d.file_name} expires {new Date(d.expires_at).toLocaleDateString()}.
                </li>
              ))}
              {(expiring?.credentials ?? []).map((c: any) => (
                <li key={c.id}>
                  {c.credential_type.replace(/_/g, " ")} expires{" "}
                  {new Date(c.expires_at).toLocaleDateString()}.
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Signatures I have made</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isPending ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
          {!isPending && rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">You have not signed anything yet.</p>
          ) : null}
          {rows.map((s) => (
            <div key={s.id} className="rounded-md border border-border p-3 text-sm">
              <p className="font-medium">
                {SIGNABLE_DOCUMENT_LABELS[s.document_type as SignableDocumentType] ??
                  s.document_type}
                {s.document_name ? ` · ${s.document_name}` : ""}
              </p>
              <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">
                {s.signature_statement}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(s.signed_at).toLocaleString()} · confirmed by {s.stepup_method}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/professional/signatures")({
  head: () => ({
    meta: [
      { title: "Authorised signatures — Harmonious" },
      {
        name: "description",
        content: "Every document you signed on a client's behalf, and authority that expires soon.",
      },
      { property: "og:title", content: "Authorised signatures — Harmonious" },
      { property: "og:description", content: "Delegated signature history and expiring authority." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthorizedSignatures,
});
