import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApprovalButton } from "@/components/approval-button";
import { getFundSetupOverview } from "@/lib/fund-setup-canonical.functions";
import { classSummaryRows } from "@/lib/fund-setup-form-model";
import { approveEconomicsFn } from "@/lib/fund-setup.functions";
import { invalidateFund } from "@/lib/fund-query-keys";
import { toast } from "sonner";

/** Saved per-class terms with the existing authorized version approval. */
export function FundClassSummary({ offeringId, onEdit }: { offeringId: string; onEdit: () => void }) {
  const qc = useQueryClient();
  const load = useServerFn(getFundSetupOverview);
  const approveFn = useServerFn(approveEconomicsFn);
  const q = useQuery({ queryKey: ["fund-setup-canonical", offeringId], queryFn: () => load({ data: { offeringId } }) });
  const d = q.data;
  const approve = useMutation({
    mutationFn: async () => {
      const versionId = d?.economics.versionId;
      if (!versionId || d?.economics.status !== "draft" || !d.economics.canApprove) throw new Error("No saved draft is available for approval.");
      return approveFn({ data: { versionId } });
    },
    onSuccess: () => { toast.success("Fees and terms approved"); void invalidateFund(qc, offeringId); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!d?.offering?.hasMultipleClasses || !(d.economics?.classes?.length > 0)) return null;
  const approved = d.economics.status === "approved";
  return (
    <section data-class-summary aria-label="Fees and terms by class" className="space-y-4 rounded-2xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <CheckCircle2 className={`size-5 ${approved ? "text-accent" : "text-muted-foreground"}`} />
        <h3 className="min-w-0 flex-1 basis-40 font-heading text-lg font-semibold text-primary">Fees & Terms</h3>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${approved ? "bg-accent/15 text-foreground" : "bg-muted text-muted-foreground"}`}>{approved ? "Approved" : "Draft, awaiting approval"}</span>
        <div className="flex flex-wrap items-center gap-2">
          {d.economics.canApprove && d.economics.status === "draft" && d.economics.versionId && <ApprovalButton title={`Approve fees and terms, version ${d.economics.version}?`} description="These saved fees and class terms will become the current approved terms. Existing signed agreements will not change." disabled={approve.isPending} onApprove={() => approve.mutate()}><CheckCircle2 className="size-4" />{approve.isPending ? "Approving…" : "Approve terms"}</ApprovalButton>}
          <Button size="sm" variant="outline" disabled={approve.isPending} onClick={onEdit}><Pencil className="size-4" />Edit</Button>
        </div>
      </div>
      <div className="space-y-4">
        {(d.economics.classes as any[]).map((c) => {
          const s = classSummaryRows(c);
          return (
            <article key={c.key} className="rounded-xl border bg-background p-4">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h4 className="font-heading text-base font-semibold">Class {s.title}</h4>
                <span className="text-sm text-muted-foreground">{s.range}</span>
              </div>
              <dl className="grid gap-3 sm:grid-cols-2">
                {s.rows.filter(([k]) => k !== "Investment range").map(([k, v]) => (
                  <div key={k} className={k === "Profit sharing" ? "sm:col-span-2" : ""}>
                    <dt className="text-base text-muted-foreground">{k}</dt>
                    <dd className="text-lg font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            </article>
          );
        })}
      </div>
    </section>
  );
}
