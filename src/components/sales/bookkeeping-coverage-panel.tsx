import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COVERAGE_PENDING, type CoverageCheck } from "@/lib/bookkeeping-model";
import { getBookkeepingEntityCoverage } from "@/lib/bookkeeping.functions";
import { linkSalesQuoteBookkeepingEntity } from "@/lib/sales-hub.functions";

const NONE = "__none";

/**
 * Coverage status for each bookkeeping line on a quote. Pending lines can be linked to the
 * canonical entity once it's on file; the server reruns coverage and open-request checks.
 */
export function BookkeepingCoveragePanel({ quoteId, clientId, canEdit, lines }: { quoteId: string; clientId: string | null; canEdit: boolean; lines: any[] }) {
  const bookkeeping = lines.filter((l) => l.bookkeeping_snapshot);
  if (!bookkeeping.length) return null;
  return (
    <section className="space-y-3 rounded-lg border p-4" aria-label="Bookkeeping coverage check">
      <h2 className="text-sm font-semibold">Bookkeeping coverage check</h2>
      {bookkeeping.map((l) => <CoverageLine key={l.id} quoteId={quoteId} clientId={clientId} canEdit={canEdit} line={l} />)}
    </section>
  );
}

function CoverageLine({ quoteId, clientId, canEdit, line }: { quoteId: string; clientId: string | null; canEdit: boolean; line: any }) {
  const check = (line.bookkeeping_snapshot.coverageCheck ?? null) as CoverageCheck | null;
  const refs: string[] = check?.unlinkedReferences ?? line.bookkeeping_snapshot.entityReferences ?? [];
  const passed = check?.status === "passed";
  const qc = useQueryClient();
  const [entityId, setEntityId] = useState<string>("");
  const [requestId, setRequestId] = useState<string>(NONE);
  const loadEntities = useServerFn(getBookkeepingEntityCoverage);
  const entities = useQuery({ queryKey: ["bookkeeping-entity-coverage", clientId], queryFn: () => loadEntities({ data: { clientId: clientId! } }), enabled: !passed && canEdit && !!clientId });
  const chosen = (entities.data ?? []).find((e) => e.id === entityId) ?? null;
  const openRequests = (chosen?.coverage ?? []).filter((r) => r.source === "request" && r.requestId);
  const linkFn = useServerFn(linkSalesQuoteBookkeepingEntity);
  const link = useMutation({
    mutationFn: () => linkFn({ data: { id: quoteId, sortOrder: Number(line.sort_order), entityId, sourceRequestId: requestId === NONE ? null : requestId } }),
    onSuccess: (r) => { toast.success(r.pending ? "Entity linked. Other entities on this line are still pending." : "Entity linked and coverage checked"); void qc.invalidateQueries({ queryKey: ["sales-quote", quoteId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (passed) {
    return (
      <div className="text-sm">
        <Badge variant="secondary">Coverage checked</Badge>
        <p className="mt-1">Organization: <span className="font-medium">{check?.organizationName ?? "Not recorded"}</span> · Entity: <span className="font-medium">{check?.entityName}</span></p>
        <p className="text-xs text-muted-foreground">{line.label}. Checked {check?.checkedAt ? new Date(check.checkedAt).toLocaleString() : ""}; rechecked again before the quote moves forward.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2 text-sm">
      <Badge variant="outline">{COVERAGE_PENDING}</Badge>
      <p className="text-muted-foreground">{line.label}: {refs.join(", ") || "This entity"} {refs.length === 1 ? "isn't" : "aren't"} linked to an entity on file. This quote stays a draft until each entity is linked and the coverage and open-request checks pass.</p>
      {!canEdit ? <p className="text-xs text-muted-foreground">Only an editable draft can be linked. Create a new version to link the entity.</p>
        : !clientId ? <p className="text-xs text-muted-foreground">Choose the client on this quote first.</p>
        : entities.data && entities.data.length === 0 ? <p className="text-xs text-muted-foreground">Add the entity to the client first, then link it here.</p>
        : (
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1"><Label>Entity on file</Label>
              <Select value={entityId} onValueChange={(v) => { setEntityId(v); setRequestId(NONE); }}>
                <SelectTrigger aria-label="Entity on file" className="w-72"><SelectValue placeholder="Choose entity" /></SelectTrigger>
                <SelectContent>{(entities.data ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.legalName} · {e.organizationName}</SelectItem>)}</SelectContent>
              </Select></div>
            {openRequests.length > 0 && <div className="space-y-1"><Label>Client request it answers</Label>
              <Select value={requestId} onValueChange={setRequestId}>
                <SelectTrigger aria-label="Client request it answers" className="w-72"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value={NONE}>None</SelectItem>{openRequests.map((r) => <SelectItem key={r.requestId} value={r.requestId!}>Request from {r.createdOn}</SelectItem>)}</SelectContent>
              </Select></div>}
            <Button size="sm" disabled={!entityId || link.isPending} onClick={() => link.mutate()}>Link entity and check coverage</Button>
            {refs.length > 0 && chosen && <p className="w-full text-xs text-muted-foreground">Replaces "{refs[0]}" with {chosen.legalName} on this line.</p>}
          </div>
        )}
    </div>
  );
}
