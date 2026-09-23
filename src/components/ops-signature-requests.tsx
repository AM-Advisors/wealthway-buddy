import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  actOnSignatureRequest,
  listSignatureRequests,
} from "@/lib/document-signing.functions";

function when(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Operations view of every Box Sign request: who must sign, in what capacity,
 * and exactly where each signer is. Completed history is read-only.
 */
export function OpsSignatureRequests({ offeringId }: { offeringId?: string }) {
  const queryClient = useQueryClient();
  const load = useServerFn(listSignatureRequests);
  const act = useServerFn(actOnSignatureRequest);
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["ops-signature-requests", offeringId ?? "all"],
    queryFn: () => load({ data: offeringId ? { offering_id: offeringId } : {} }) as Promise<any>,
  });

  async function run(signatureId: string, action: "resend" | "cancel") {
    setBusy(`${signatureId}:${action}`);
    try {
      await act({ data: { signature_id: signatureId, action } });
      toast.success(action === "resend" ? "Signing request resent." : "Signing request cancelled.");
      await queryClient.invalidateQueries({ queryKey: ["ops-signature-requests"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That action could not be completed.");
    } finally {
      setBusy(null);
    }
  }

  if (error) {
    return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  }
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading signing requests…</p>;
  }

  const requests: any[] = data?.requests ?? [];
  if (requests.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No signing requests yet. One is created the first time an investor opens Review &amp; Sign.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {requests.map((request) => (
        <Card key={request.signatureId}>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">{request.documentTitle}</CardTitle>
                <CardDescription>
                  Sent {when(request.sentAt)} · document version{" "}
                  {request.sourceVersionId ? request.sourceVersionId.slice(-8) : "—"}
                  {request.signedVersionId
                    ? ` · signed version ${request.signedVersionId.slice(-8)}`
                    : ""}
                </CardDescription>
              </div>
              <Badge variant={request.state === "executed" ? "default" : "secondary"}>
                {request.stateLabel}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            <ul className="space-y-1 text-sm">
              {request.signers.map((signer: any) => (
                <li key={signer.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {signer.name} · {signer.capacityLabel}
                  </span>
                  <span className="text-muted-foreground">
                    {signer.statusLabel}
                    {signer.signedAt ? ` ${when(signer.signedAt)}` : ""}
                    {!signer.signedAt && signer.viewedAt ? ` (viewed ${when(signer.viewedAt)})` : ""}
                  </span>
                </li>
              ))}
            </ul>

            {request.providerError && (
              <p className="text-sm text-destructive">{request.providerError}</p>
            )}

            {request.state !== "executed" && (
              <div className="flex flex-wrap gap-2">
                {data?.canResend && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === `${request.signatureId}:resend`}
                    onClick={() => run(request.signatureId, "resend")}
                  >
                    Resend
                  </Button>
                )}
                {data?.canCancel && request.state !== "cancelled" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy === `${request.signatureId}:cancel`}
                    onClick={() => run(request.signatureId, "cancel")}
                  >
                    Cancel request
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
