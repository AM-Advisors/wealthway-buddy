import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { acknowledgeDocumentFn, investorDocumentsFn } from "@/lib/fund-setup-canonical.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadError } from "@/components/load-error";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OfferingDocumentReader } from "@/components/offering-document-reader";

/** Investor Sign-stage list: only documents that apply to this investment, plain actions. */
export function InvestmentOfferingDocuments({ onboardingId }: { onboardingId: string }) {
  const [reading, setReading] = useState<{ id: string; title: string } | null>(null);
  const qc = useQueryClient();
  const load = useServerFn(investorDocumentsFn);
  const ack = useServerFn(acknowledgeDocumentFn);
  const q = useQuery({ queryKey: ["investment-offering-docs", onboardingId], queryFn: () => load({ data: { onboardingId } }) });
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading documents…</p>;
  if (q.error) return <LoadError audience="account" error={q.error} what="Your documents" onRetry={() => void q.refetch()} />;
  if (!q.data?.length) return <p className="text-sm text-muted-foreground">No documents have been shared for this investment yet.</p>;
  const acknowledge = async (documentId: string) => {
    try {
      await ack({ data: { onboardingId, documentId } });
      toast.success("Acknowledged");
      qc.invalidateQueries({ queryKey: ["investment-offering-docs", onboardingId] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Documents</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {q.data.map((d) => (
          <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
            <span className="text-sm">{d.title}{d.action !== "Completed" && d.approvalLabel ? <Badge variant="outline" className="mt-1 block w-fit">{d.approvalLabel}</Badge> : null}</span>
            {d.canRead && <Button size="sm" variant="outline" onClick={() => setReading({ id: d.id, title: d.title })}>Read document</Button>}
            {d.action === "Completed" ? (
              <Badge variant="secondary">Completed</Badge>
            ) : d.action === "Acknowledge" ? (
              <Button size="sm" onClick={() => acknowledge(d.id)}>I acknowledge and agree</Button>
            ) : d.action ? (
              <Button asChild size="sm" variant={d.action.includes("Sign") ? "default" : "outline"}>
                <Link to="/investment/$onboardingId" params={{ onboardingId }} search={{ tab: "onboarding", step: "sign" }}>
                  {d.action}
                </Link>
              </Button>
            ) : null}
          </div>
        ))}
      </CardContent>
      <Dialog open={!!reading} onOpenChange={(open) => { if (!open) setReading(null); }}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>{reading?.title ?? "Document"}</DialogTitle></DialogHeader>
          {reading && <OfferingDocumentReader documentId={reading.id} onboardingId={onboardingId} title={reading.title} onReachedEnd={() => {}} />}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
