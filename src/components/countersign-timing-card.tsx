import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { COUNTERSIGN_TIMINGS, COUNTERSIGN_TIMING_LABELS, type CountersignTiming } from "@/lib/countersign-timing";
import { getCountersignTimingFn, setCountersignTimingFn } from "@/lib/countersign-timing.functions";

/** Fund manager / Harmonious choice of when countersigning happens. */
export function CountersignTimingCard({ offeringId }: { offeringId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(getCountersignTimingFn);
  const save = useServerFn(setCountersignTimingFn);
  const q = useQuery({ queryKey: ["countersign-timing", offeringId], queryFn: () => load({ data: { offeringId } }), retry: false });
  const m = useMutation({
    mutationFn: (timing: CountersignTiming) => save({ data: { offeringId, timing } }),
    onSuccess: () => { toast.success("Countersign timing saved"); qc.invalidateQueries({ queryKey: ["countersign-timing", offeringId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (q.error) return null;
  const current = q.data?.timing;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">When do you countersign?</CardTitle>
        <CardDescription>
          Identity, accreditation, tax and signing checks always come first. Investors aren't admitted until you countersign. A change only affects investors who haven't signed yet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2" role="radiogroup" aria-label="Countersign timing">
        {COUNTERSIGN_TIMINGS.map((t) => {
          const l = COUNTERSIGN_TIMING_LABELS[t];
          const on = current === t;
          return (
            <button key={t} type="button" role="radio" aria-checked={on} disabled={!q.data || m.isPending}
              onClick={() => !on && m.mutate(t)}
              className={`w-full rounded-md border p-3 text-left transition-colors ${on ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}>
              <span className="block text-sm font-medium">{l.title}{t === "pause" ? " (default)" : ""}</span>
              <span className="block text-xs text-muted-foreground">Investor: {l.investor}</span>
              <span className="block text-xs text-muted-foreground">You: {l.manager}</span>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
