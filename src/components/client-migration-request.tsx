import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { requestClientMigration } from "@/lib/migration-requests.functions";

/** Client asks Harmonious to bring over a fund that already closed or onboarded investors elsewhere. */
export function ClientMigrationRequest({ clientId }: { clientId: string | null }) {
  const send = useServerFn(requestClientMigration);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ fundName: "", investors: "", link: "", notes: "" });
  const [busy, setBusy] = useState(false);
  if (!clientId) return null;
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Move an existing fund</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Move an existing fund to Harmonious</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">For a fund that already closed or onboarded investors somewhere else. Our team reviews it and gets in touch.</p>
          <Input placeholder="Fund name" value={f.fundName} onChange={(e) => setF({ ...f, fundName: e.target.value })} />
          <Input type="number" min={0} placeholder="About how many investors?" value={f.investors} onChange={(e) => setF({ ...f, investors: e.target.value })} />
          <Input placeholder="Link to your records (optional)" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} />
          <Textarea placeholder="Anything we should know (previous administrator, close date…)" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          <Button disabled={busy || !f.fundName.trim()} onClick={async () => {
            setBusy(true);
            try {
              await send({ data: { clientId, fundName: f.fundName, notes: f.notes || null, recordsLink: f.link || null, investorCount: f.investors ? Number(f.investors) : null } });
              toast.success("Request sent. Our team will review it."); setOpen(false); setF({ fundName: "", investors: "", link: "", notes: "" });
            } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
          }}>Send request</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
