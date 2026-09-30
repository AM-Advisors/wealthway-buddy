import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { deleteFundPermanently, getFundDeletionImpact } from "@/lib/staff-funds.functions";

export function DeleteFundDialog({ fundId, fundName, onDeleted }: { fundId: string; fundName: string; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const [allowFunded, setAllowFunded] = useState(false);
  const [busy, setBusy] = useState(false);
  const impactFn = useServerFn(getFundDeletionImpact);
  const del = useServerFn(deleteFundPermanently);
  const impact = useQuery({ queryKey: ["fund-deletion-impact", fundId], queryFn: () => impactFn({ data: { offeringId: fundId } }), enabled: open, retry: false });
  const i = impact.data;
  const blocked = !!i && i.retired_into > 0;
  const ready = typed === fundName && reason.trim().length >= 5 && !blocked && (!i || i.funded === 0 || allowFunded);

  return <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setTyped(""); setReason(""); setAllowFunded(false); } }}>
    <DialogTrigger asChild><Button variant="ghost" size="sm" className="text-destructive">Delete</Button></DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Permanently delete {fundName}?</DialogTitle>
        <DialogDescription>This erases the Fund and everything linked to it, including its history. It cannot be undone. A record of who deleted it and why is kept.</DialogDescription>
      </DialogHeader>
      {impact.isPending ? <p className="text-sm">Checking what this affects…</p> : impact.isError ? <p role="alert" className="text-sm">{(impact.error as Error).message}</p> : i && <ul className="list-disc pl-5 text-sm">
        <li>{i.applications} investor application(s), {i.funded} funded</li>
        <li>{i.documents} fund document(s)</li>
        {blocked && <li className="text-destructive">Other retired Funds were merged into this one, so it can't be deleted.</li>}
      </ul>}
      {i && i.funded > 0 && <label className="flex items-start gap-2 text-sm"><Checkbox checked={allowFunded} onCheckedChange={(v) => setAllowFunded(v === true)} /> I confirm these funded investments are test records and should be erased.</label>}
      <div className="space-y-2">
        <Label htmlFor="del-reason">Reason</Label>
        <Textarea id="del-reason" value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Test fund, no real investors" />
        <Label htmlFor="del-name">Type the Fund name to confirm</Label>
        <Input id="del-name" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={fundName} />
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        <Button variant="destructive" disabled={!ready || busy} onClick={async () => {
          setBusy(true);
          try { await del({ data: { offeringId: fundId, confirmName: typed, reason, allowFunded } }); toast.success(`${fundName} deleted`); setOpen(false); onDeleted(); }
          catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
        }}>Delete permanently</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
