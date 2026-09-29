import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { acknowledgeDocumentFn, investorDocumentsFn } from "@/lib/fund-setup-canonical.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Investor Sign-stage list: only documents that apply to this investment, plain actions. */
export function InvestmentOfferingDocuments({ onboardingId }: { onboardingId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(investorDocumentsFn);
  const ack = useServerFn(acknowledgeDocumentFn);
  const q = useQuery({ queryKey: ["investment-offering-docs", onboardingId], queryFn: () => load({ data: { onboardingId } }) });
  if (!q.data?.length) return null;
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
            <span className="text-sm">{d.title}</span>
            {d.action === "Acknowledge" ? (
              <Button size="sm" onClick={() => acknowledge(d.id)}>I have reviewed this document</Button>
            ) : (
              <span className="text-sm text-muted-foreground">{d.action}</span>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
