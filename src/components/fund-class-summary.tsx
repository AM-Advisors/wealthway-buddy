import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFundSetupOverview } from "@/lib/fund-setup-canonical.functions";
import { classSummaryRows } from "@/lib/fund-setup-form-model";

/** Read-only per-class terms for the Setup summary. Returns null for single-class funds. */
export function FundClassSummary({ offeringId, onEdit }: { offeringId: string; onEdit: () => void }) {
  const load = useServerFn(getFundSetupOverview);
  const q = useQuery({ queryKey: ["fund-setup-canonical", offeringId], queryFn: () => load({ data: { offeringId } }) });
  const d: any = q.data;
  if (!d?.offering?.hasMultipleClasses || !(d.economics?.classes?.length > 0)) return null;
  const approved = d.economics.status === "approved";
  return (
    <section aria-label="Fees and terms by class" className="space-y-4 rounded-2xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <CheckCircle2 className={`size-5 ${approved ? "text-accent" : "text-muted-foreground"}`} />
        <h3 className="flex-1 font-heading text-lg font-semibold text-primary">Fees & Terms</h3>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${approved ? "bg-accent/15 text-foreground" : "bg-muted text-muted-foreground"}`}>{approved ? "Approved" : "Draft, awaiting approval"}</span>
        <Button size="sm" variant="outline" onClick={onEdit}><Pencil className="size-4" />Edit</Button>
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
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                    <dd className="text-sm">{v}</dd>
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
