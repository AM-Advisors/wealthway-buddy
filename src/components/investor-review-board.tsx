import { useEffect, useState } from "react";

import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { decideWireAsReviewer, getFundInvestorReview } from "@/lib/manager.functions";
import { getSignedDocumentUrl } from "@/lib/documents.functions";
import { money, prettyStatus, statusTone } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

function when(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export function InvestorReviewBoard({ offeringId }: { offeringId: string }) {
  const load = useServerFn(getFundInvestorReview);
  const decide = useServerFn(decideWireAsReviewer);
  const signedUrl = useServerFn(getSignedDocumentUrl);
  const queryClient = useQueryClient();

  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const reviewQuery = useQuery({
    queryKey: ["fund-investor-review", offeringId],
    queryFn: () => load({ data: { offeringId } }),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel(`fund-review-${offeringId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "document_signatures" }, () => {
        queryClient.invalidateQueries({ queryKey: ["fund-investor-review", offeringId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "wire_confirmations" }, () => {
        queryClient.invalidateQueries({ queryKey: ["fund-investor-review", offeringId] });
      })
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "investor_applications",
          filter: `offering_id=eq.${offeringId}`,
        },
        () => queryClient.invalidateQueries({ queryKey: ["fund-investor-review", offeringId] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [offeringId, queryClient]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["fund-investor-review", offeringId] });
    queryClient.invalidateQueries({ queryKey: ["fund-operations", offeringId] });
    queryClient.invalidateQueries({ queryKey: ["fund-overview", offeringId] });
  };

  const decideMutation = useMutation({
    mutationFn: (vars: {
      applicationId: string;
      confirmationId: string;
      outcome: "approved" | "rejected";
      notes?: string;
    }) => decide({ data: vars }),
    onSuccess: (_r, vars) => {
      toast.success(vars.outcome === "approved" ? "Wire approved and funding marked received" : "Wire sent back to the investor");
      setRejecting(null);
      setReason("");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not record that decision."),
  });

  const downloadMutation = useMutation({
    mutationFn: (signatureId: string) => signedUrl({ data: { signature_id: signatureId } }),
    onSuccess: (res: any) => {
      window.open(res.url, "_blank", "noopener,noreferrer");
    },
    onError: (e: any) => toast.error(e?.message ?? "That signed copy is not available yet."),
  });

  if (reviewQuery.isLoading) {
    return <p className="mt-6 text-sm text-muted-foreground">Loading investor reviews…</p>;
  }
  if (reviewQuery.isError || !reviewQuery.data) {
    return <p className="mt-6 text-sm text-muted-foreground">Investor reviews are unavailable right now.</p>;
  }

  const investors = reviewQuery.data.investors as any[];

  return (
    <div className="mt-10 space-y-4">
      <div>
        <h2 className="text-xl">Investor reviews</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Onboarding status, signed copies and wire requests for each investor, with an action on every line.
        </p>
      </div>

      {investors.length === 0 ? (
        <p className="text-sm text-muted-foreground">No investors in this fund yet.</p>
      ) : (
        investors.map((inv) => (
          <Card key={inv.applicationId}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-base">{inv.name}</CardTitle>
                  <CardDescription>
                    {inv.email ?? "no email on file"}
                    {inv.commitmentCents ? ` · ${money(inv.commitmentCents)}` : ""}
                    {` · updated ${when(inv.updatedAt)}`}
                  </CardDescription>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link to="/manager/$applicationId" params={{ applicationId: inv.applicationId }}>
                    Full review
                  </Link>
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 pt-0">
              <div className="flex flex-wrap gap-1.5">
                <Badge variant={statusTone(inv.statuses.kyc)}>Identity {prettyStatus(inv.statuses.kyc)}</Badge>
                <Badge variant={statusTone(inv.statuses.aml)}>AML {prettyStatus(inv.statuses.aml)}</Badge>
                <Badge variant={statusTone(inv.statuses.accreditation)}>
                  Accreditation {prettyStatus(inv.statuses.accreditation)}
                </Badge>
                <Badge variant={statusTone(inv.statuses.documents)}>
                  Documents {prettyStatus(inv.statuses.documents)}
                </Badge>
                <Badge variant={statusTone(inv.statuses.funding)}>
                  Funding {prettyStatus(inv.statuses.funding)}
                </Badge>
              </div>

              <div className="rounded-lg border p-3">
                <p className="text-sm font-medium">Signed documents</p>
                {inv.signedDocuments.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">Nothing signed yet.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {inv.signedDocuments.map((doc: any) => (
                      <div
                        key={doc.signatureId}
                        className="flex flex-wrap items-center justify-between gap-2"
                      >
                        <p className="text-xs text-muted-foreground">
                          {doc.title} · signed {when(doc.signedAt)}
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!doc.hasPdf || downloadMutation.isPending}
                          onClick={() => downloadMutation.mutate(doc.signatureId)}
                        >
                          {doc.hasPdf ? "Download" : "Preparing"}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {inv.outstandingDocuments.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Still waiting on: {inv.outstandingDocuments.join(", ")}
                  </p>
                )}
              </div>

              <div className="rounded-lg border p-3">
                <p className="text-sm font-medium">Wire request</p>
                {inv.pendingWire ? (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      {money(inv.pendingWire.amount_cents)} sent {inv.pendingWire.sent_on} from{" "}
                      {inv.pendingWire.sending_bank_name} ····{inv.pendingWire.sending_account_last4}
                      {inv.pendingWire.bank_reference ? ` · ref ${inv.pendingWire.bank_reference}` : ""}
                    </p>
                    {inv.pendingWire.investor_note ? (
                      <p className="text-xs text-muted-foreground">
                        Investor note: {inv.pendingWire.investor_note}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={decideMutation.isPending}
                        onClick={() =>
                          decideMutation.mutate({
                            applicationId: inv.applicationId,
                            confirmationId: inv.pendingWire.id,
                            outcome: "approved",
                          })
                        }
                      >
                        Approve wire
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setRejecting(rejecting === inv.pendingWire.id ? null : inv.pendingWire.id)
                        }
                      >
                        Send back
                      </Button>
                    </div>
                    {rejecting === inv.pendingWire.id && (
                      <div className="space-y-2">
                        <Textarea
                          rows={2}
                          placeholder="What should the investor correct?"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                        />
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={reason.trim().length < 3 || decideMutation.isPending}
                          onClick={() =>
                            decideMutation.mutate({
                              applicationId: inv.applicationId,
                              confirmationId: inv.pendingWire.id,
                              outcome: "rejected",
                              notes: reason.trim(),
                            })
                          }
                        >
                          Confirm send back
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">Nothing awaiting your review.</p>
                )}
                {inv.wireHistory.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {inv.wireHistory.map((w: any) => (
                      <p key={w.id} className="text-xs text-muted-foreground">
                        {money(w.amount_cents)} · {prettyStatus(w.status)} · reviewed {when(w.reviewed_at)}
                        {w.review_notes ? ` · ${w.review_notes}` : ""}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
