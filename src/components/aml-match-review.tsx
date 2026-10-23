import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { amlMatchReviewFn, clearAmlMatchesFn } from "@/lib/account-kyc.functions";

const VERDICT: Record<string, { label: string; cls: string }> = {
  differs: { label: "Different", cls: "text-primary" },
  same: { label: "Same", cls: "text-destructive" },
  unknown: { label: "Not on record", cls: "text-muted-foreground" },
};

/** Reviewer panel: each possible watchlist match beside the verified person, cleared one by one or in a batch with a reason. */
export function AmlMatchReview({ checkId }: { checkId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(amlMatchReviewFn);
  const clear = useServerFn(clearAmlMatchesFn);
  const q = useQuery({ queryKey: ["aml-match-review", checkId], queryFn: () => load({ data: { checkId } }) });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const m = useMutation({
    mutationFn: () => clear({ data: { checkId, keys: [...picked], reason } }),
    onSuccess: (r) => { toast.success(`${r.cleared} match${r.cleared === 1 ? "" : "es"} cleared.`); setPicked(new Set()); setReason(""); void qc.invalidateQueries({ queryKey: ["aml-match-review", checkId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading possible matches…</p>;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const d = q.data!;
  if (!d.hits.length) return <p className="text-sm text-muted-foreground">No possible watchlist matches on this check.</p>;
  const open = d.hits.filter((h: any) => !h.clearance);
  const suggested = open.filter((h: any) => h.comparison.suggestion === "likely_different_person").map((h: any) => h.comparison.key);
  const toggle = (k: string, on: boolean) => setPicked((p) => { const n = new Set(p); if (on) n.add(k); else n.delete(k); return n; });
  const canAct = d.status === "review" && !d.isOwn;

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Possible watchlist matches · {d.hits.length - open.length} of {d.hits.length} cleared</p>
        {canAct && suggested.length > 0 && <Button size="sm" variant="outline" onClick={() => setPicked(new Set(suggested))}>Select {suggested.length} with a different birth year</Button>}
      </div>
      <div className="grid gap-1 rounded-md border bg-card p-3 text-sm sm:grid-cols-3">
        <div><p className="text-xs text-muted-foreground">Verified name</p><p className="font-medium">{d.person.fullName ?? " · "}</p></div>
        <div><p className="text-xs text-muted-foreground">Date of birth</p><p className="font-medium">{d.person.dateOfBirth ?? " · "}</p></div>
        <div><p className="text-xs text-muted-foreground">ID country</p><p className="font-medium">{d.person.country ?? " · "}</p></div>
      </div>
      <ul className="max-h-[28rem] space-y-2 overflow-auto">
        {d.hits.map((h: any) => {
          const k = h.comparison.key;
          return (
            <li key={k} className="rounded-md border bg-card p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  {canAct && !h.clearance && <Checkbox aria-label={`Select ${h.caption ?? "match"}`} checked={picked.has(k)} onCheckedChange={(v) => toggle(k, v === true)} className="mt-0.5" />}
                  <div>
                    <p className="font-medium">{h.caption ?? "Unnamed"}</p>
                    <p className="text-xs text-muted-foreground">{[h.datasets?.join(", "), h.lists?.join(", ")].filter(Boolean).join(" · ") || "No list details"}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {h.pep && <Badge variant="destructive">Politically exposed</Badge>}
                  {h.matchScore != null && <Badge variant="outline">Name match {h.matchScore}%</Badge>}
                  {h.clearance ? <Badge variant="secondary">Cleared</Badge> : h.comparison.suggestion === "likely_different_person" ? <Badge variant="outline">Likely a different person</Badge> : <Badge variant="outline">Look closely</Badge>}
                </div>
              </div>
              <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                <div><dt className="text-muted-foreground">Birth date on list</dt><dd>{h.birthDates?.length ? h.birthDates.join(", ") : " · "} <span className={VERDICT[h.comparison.birth]!.cls}>· {VERDICT[h.comparison.birth]!.label}</span></dd></div>
                <div><dt className="text-muted-foreground">Country on list</dt><dd>{h.countries?.length ? h.countries.join(", ") : " · "} <span className={VERDICT[h.comparison.country]!.cls}>· {VERDICT[h.comparison.country]!.label}</span></dd></div>
              </dl>
              {h.summary && <p className="mt-1 text-xs">{h.summary}</p>}
              {h.clearance && <p className="mt-1 text-xs text-muted-foreground">Cleared {new Date(h.clearance.created_at).toLocaleString()}: {h.clearance.reason}</p>}
            </li>
          );
        })}
      </ul>
      {d.isOwn && <p className="text-xs text-muted-foreground">This is your own check, so another reviewer must clear these matches.</p>}
      {canAct && open.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor={`aml-reason-${checkId}`}>Reason these aren't this person ({picked.size} selected)</Label>
          <Textarea id={`aml-reason-${checkId}`} rows={2} maxLength={2000} placeholder="e.g. Different birth year and country than the verified ID" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button size="sm" disabled={!picked.size || reason.trim().length < 5 || m.isPending} onClick={() => m.mutate()}>{m.isPending ? "Saving…" : `Clear ${picked.size || ""} selected`}</Button>
          <p className="text-xs text-muted-foreground">Clearances are permanent and recorded with your name. Approve the check once every match is cleared.</p>
        </div>
      )}
    </div>
  );
}
