import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { changeSeriesMasterJurisdictionFn, seriesMasterForFundFn } from "@/lib/fund-setup-canonical.functions";
import { invalidateFund } from "@/lib/fund-query-keys";
import type { SeriesMaster } from "@/lib/series-master";

/** The master LLC this series fund sits under (null when the fund isn't a series of a master). */
export function useSeriesMaster(offeringId: string) {
  const load = useServerFn(seriesMasterForFundFn);
  const q = useQuery({ queryKey: ["series-master", offeringId], queryFn: () => load({ data: { offeringId } }), retry: false });
  return (q.data ?? null) as SeriesMaster | null;
}

/** Read-only jurisdiction taken from the master, with a staff-only change that applies to every series under it. */
export function SeriesMasterJurisdiction({ offeringId, master, canChange }: { offeringId: string; master: SeriesMaster; canChange: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-1">
      <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm">{master.jurisdiction}</div>
      <p className="text-xs text-muted-foreground">
        From the master, {master.name}. Every series under it uses this, so it's never entered again.
      </p>
      {canChange && (
        <Button type="button" size="sm" variant="link" className="h-auto p-0 text-xs" onClick={() => setOpen(true)}>
          Change for the master
        </Button>
      )}
      {open && <ChangeMasterDialog offeringId={offeringId} master={master} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** Shown under the jurisdiction field when the master's jurisdiction hasn't been recorded yet. */
export function SeriesMasterFirstEntryHint({ master }: { master: SeriesMaster }) {
  return (
    <p className="text-xs text-muted-foreground">
      Enter the jurisdiction of the master, {master.name}. It's saved once and every series under it fills in automatically.
    </p>
  );
}

function ChangeMasterDialog({ offeringId, master, onClose }: { offeringId: string; master: SeriesMaster; onClose: () => void }) {
  const qc = useQueryClient();
  const change = useServerFn(changeSeriesMasterJurisdictionFn);
  const [jurisdiction, setJurisdiction] = useState(master.jurisdiction ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const others = Math.max(master.seriesCount - 1, 0);
  const submit = async () => {
    setBusy(true);
    try {
      await change({ data: { offeringId, jurisdiction, reason } });
      toast.success(`Jurisdiction updated for ${master.name}`);
      await Promise.all([invalidateFund(qc, offeringId), qc.invalidateQueries({ queryKey: ["series-master"] })]);
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change the master's jurisdiction</DialogTitle>
          <DialogDescription>
            This changes the jurisdiction for {master.name} and {others === 0 ? "this fund" : `this fund plus ${others} other series under it`}. Signed documents are not changed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label htmlFor="master-jurisdiction">Jurisdiction of formation</Label>
            <Input id="master-jurisdiction" value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} placeholder="Delaware" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="master-reason">Reason</Label>
            <Textarea id="master-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Certificate of formation shows Wyoming" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !jurisdiction.trim() || !reason.trim() || jurisdiction.trim() === master.jurisdiction}>Save for the master</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
