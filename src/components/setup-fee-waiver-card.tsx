import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, parseISO } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { getSetupFeeWaiver, setSetupFeeWaiver } from "@/lib/setup-fee-waiver.functions";

export function SetupFeeWaiverCard({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(getSetupFeeWaiver);
  const save = useServerFn(setSetupFeeWaiver);
  const q = useQuery({ queryKey: ["setup-fee-waiver", clientId], queryFn: () => load({ data: { clientId } }), retry: false });
  const [reason, setReason] = useState("");
  const m = useMutation({
    mutationFn: (waive: boolean) => save({ data: { clientId, waive, reason } }),
    onSuccess: (_r, waive) => { toast.success(waive ? "Setup fee waived for this client." : "Setup fee restored."); setReason(""); void qc.invalidateQueries({ queryKey: ["setup-fee-waiver", clientId] }); },
    onError: (e: any) => toast.error(e?.message ?? "Could not save."),
  });
  if (q.isError) return null;
  const d = q.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">$2,500 new fund setup fee {d ? <Badge variant={d.waived ? "secondary" : "outline"}>{d.waived ? "Waived" : "Charged"}</Badge> : null}</CardTitle>
        <CardDescription>When waived, this client can send new funds or SPVs to Harmonious without paying the setup fee. Add-on services are still charged.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!d ? <p className="text-muted-foreground">Loading…</p> : (
          <>
            {d.canChange ? (
              <div className="space-y-2">
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required, kept permanently)" />
                <Button size="sm" disabled={m.isPending || reason.trim().length < 3} variant={d.waived ? "outline" : "default"} onClick={() => m.mutate(!d.waived)}>
                  {d.waived ? "Charge the setup fee again" : "Waive the setup fee"}
                </Button>
              </div>
            ) : <p className="text-muted-foreground">Only the CEO, CRO or a Super Admin can change this.</p>}
            {d.history.length > 0 && (
              <ul className="space-y-1 border-t pt-2 text-xs text-muted-foreground">
                {d.history.map((h: { id: string; reason: string; grantedBy: string; grantedAt: string; revokedAt: string | null; revokedBy: string | null; revokeReason: string | null }) => (
                  <li key={h.id}>
                    Waived by {h.grantedBy} on {format(parseISO(h.grantedAt), "MMM d, yyyy")}: {h.reason}
                    {h.revokedAt ? ` · Restored by ${h.revokedBy} on ${format(parseISO(h.revokedAt), "MMM d, yyyy")}: ${h.revokeReason ?? ""}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
