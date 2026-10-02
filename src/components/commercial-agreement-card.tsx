import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getCommercialAgreementStatus, updateContractStructure } from "@/lib/commercial-agreements.functions";
import { CONTRACT_STRUCTURES, CONTRACT_STRUCTURE_LABELS, DOC_STATUS_LABELS, type ContractStructure } from "@/lib/commercial-agreement-model";

/**
 * Operations view of the Harmonious MSA/SOW. Informational only - it never
 * marks anything signed and never blocks the fund or the client.
 */
export function CommercialAgreementCard({ clientId, offeringId }: { clientId?: string; offeringId?: string }) {
  const load = useServerFn(getCommercialAgreementStatus);
  const save = useServerFn(updateContractStructure);
  const qc = useQueryClient();
  const key = ["commercial-agreement", clientId ?? null, offeringId ?? null];
  const q = useQuery({ queryKey: key, queryFn: () => load({ data: { clientId, offeringId } }), retry: false });
  const [editing, setEditing] = useState<ContractStructure | "">("");
  const m = useMutation({
    mutationFn: (structure: ContractStructure) => save({ data: { clientId: (q.data as any).status.clientId, structure } }),
    onSuccess: () => { toast.success("Contract structure saved."); setEditing(""); void qc.invalidateQueries({ queryKey: ["commercial-agreement"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save."),
  });
  if (q.error || !q.data) return null;
  const s = (q.data as any).status;
  if (!s) return null;
  const tone = s.overall === "complete" ? "secondary" : "outline";
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Client MSA</CardTitle>
          <Badge variant={tone as any}>{s.overall === "complete" ? s.overallLabel : "MSA Follow-Up Required"}</Badge>
        </div>
        {s.supporting ? <CardDescription>{s.supporting}</CardDescription> : null}
      </CardHeader>
      <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted-foreground">Contract Structure</p>
          {(q.data as any).canEdit ? (
            <div className="mt-1 flex items-center gap-2">
              <Select value={editing || s.structure} onValueChange={(v) => setEditing(v as ContractStructure)}>
                <SelectTrigger className="h-8 w-full max-w-60"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTRACT_STRUCTURES.map((c) => <SelectItem key={c} value={c}>{CONTRACT_STRUCTURE_LABELS[c]}</SelectItem>)}
                </SelectContent>
              </Select>
              {editing && editing !== s.structure ? (
                <Button size="sm" onClick={() => m.mutate(editing as ContractStructure)} disabled={m.isPending}>Save</Button>
              ) : null}
            </div>
          ) : (
            <p className="font-medium">{s.structureLabel}</p>
          )}
        </div>
        {s.lines.map((l: any) => (
          <div key={l.key}>
            <p className="text-xs text-muted-foreground">{l.label}</p>
            <p className="font-medium">
              {DOC_STATUS_LABELS[l.status as keyof typeof DOC_STATUS_LABELS]}
              {l.followUp ? " · Follow-up required" : ""}
            </p>
          </div>
        ))}
        {s.followUpItems.length ? (
          <div className="sm:col-span-2">
            <p className="text-xs text-muted-foreground">Harmonious follow-up</p>
            <ul className="list-disc pl-5">{s.followUpItems.map((f: string) => <li key={f}>{f}</li>)}</ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
