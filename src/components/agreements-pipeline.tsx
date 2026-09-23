import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AGREEMENT_PIPELINE, roleLabel } from "@/lib/agreement-prep";
import { listAgreementPipeline } from "@/lib/agreement-prep.functions";

/**
 * The agreements pipeline. Every column is worked out from the authoritative
 * signer records and Box's own status — there is no separate status anyone can
 * edit by hand.
 */
export function AgreementsPipeline({ offeringId }: { offeringId?: string }) {
  const load = useServerFn(listAgreementPipeline);
  const query = useQuery({
    queryKey: ["agreement-pipeline", offeringId ?? "all"],
    queryFn: () => load({ data: offeringId ? { offering_id: offeringId } : {} }),
    retry: false,
    refetchInterval: 60_000,
  });

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading agreements…</p>;
  if (query.error) {
    return (
      <p className="text-sm text-muted-foreground">
        {query.error instanceof Error ? query.error.message : "Agreements are unavailable."}
      </p>
    );
  }

  const requests = (query.data as any)?.requests ?? [];
  if (requests.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No agreements have been prepared yet. Prepare one and it will appear here as it moves
        through signing.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {AGREEMENT_PIPELINE.filter((bucket) => bucket.key !== "templates").map((bucket) => {
        const rows = requests.filter((r: any) => r.bucket === bucket.key);
        if (rows.length === 0) return null;
        return (
          <Card key={bucket.key}>
            <CardHeader>
              <CardTitle className="text-base">
                {bucket.label} <Badge variant="secondary">{rows.length}</Badge>
              </CardTitle>
              <CardDescription>
                State comes from Box and from each signer&apos;s own record.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {rows.map((row: any) => (
                <div key={row.signatureId} className="rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{row.documentTitle}</span>
                    <Badge variant="outline">{row.stateLabel}</Badge>
                  </div>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {row.signers.map((s: any, i: number) => (
                      <li key={i}>
                        {s.name ?? "Signer"} —{" "}
                        {s.roleKey ? roleLabel(s.roleKey) : (s.capacityLabel ?? "Signer")} · {s.status}
                      </li>
                    ))}
                  </ul>
                  {row.providerError && (
                    <p className="mt-2 text-xs text-destructive">{row.providerError}</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
