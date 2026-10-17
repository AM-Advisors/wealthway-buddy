import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveFundOriginFn } from "@/lib/fund-origin.functions";
import { fundOriginLabel, type FundOrigin } from "@/lib/fund-origin";
import { invalidateFund } from "@/lib/fund-query-keys";
export function FundOriginControl({ offeringId, origin, editable = false }: { offeringId: string; origin: unknown; editable?: boolean }) {
  const save = useServerFn(saveFundOriginFn);
  const qc = useQueryClient();
  const [choice, setChoice] = useState<FundOrigin | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return <section className="space-y-3 border-b pb-4">
    <div className="flex flex-wrap items-center gap-3"><h3 className="text-sm font-medium">Setup path</h3>
      {editable ? <div className="flex gap-1" role="group" aria-label="Fund classification">
        {(["new", "migration"] as const).map((value) => <Button key={value} size="sm" variant={(choice ?? origin) === value ? "default" : "outline"} aria-pressed={(choice ?? origin) === value} disabled={busy} onClick={() => setChoice(value)}>{fundOriginLabel(value)}</Button>)}
      </div> : <span className="text-sm text-muted-foreground">{fundOriginLabel(origin)}</span>}
    </div>
    {choice && choice !== origin && <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true);
      try { await save({ data: { offeringId, origin: choice, reason } }); await invalidateFund(qc, offeringId); setChoice(null); setReason(""); toast.success("Fund classification saved"); }
      catch (error) { toast.error((error as Error).message); } finally { setBusy(false); }
    }}><div className="min-w-0 flex-1"><Label htmlFor={`origin-reason-${offeringId}`}>Reason</Label><Input id={`origin-reason-${offeringId}`} value={reason} minLength={3} maxLength={500} required onChange={(e) => setReason(e.target.value)} /></div><Button type="submit" size="sm" disabled={busy || reason.trim().length < 3}>Save</Button><Button variant="ghost" size="sm" disabled={busy} onClick={() => { setChoice(null); setReason(""); }}>Cancel</Button></form>}
  </section>;
}
