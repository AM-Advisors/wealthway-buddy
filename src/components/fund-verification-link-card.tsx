import { isEntityProfile } from "@/lib/profile-kind";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { addLinkSessionInvestorFn, fundLinkSessionsFn, setLinkSessionDismissedFn } from "@/lib/fund-verification-link.functions";
import { LINK_STATE_LABEL, type LinkSessionState } from "@/lib/fund-verification-link-model";
import { fmtDate } from "@/components/fund-tabs/shared";

const TONE: Record<LinkSessionState, "default" | "secondary" | "outline" | "destructive"> = {
  needs_adding: "destructive", in_progress: "secondary", on_fund: "default", not_investor: "outline", closed: "outline",
};

/** Staff only: everyone who used this fund's own verification link, and whether they're on the fund. */
export function FundVerificationLinkCard({ fundId }: { fundId: string }) {
  const list = useServerFn(fundLinkSessionsFn);
  const q = useQuery({ queryKey: ["fund-verification-link", fundId], queryFn: () => list({ data: { offeringId: fundId } }), retry: false });
  const [adding, setAdding] = useState<any | null>(null);
  const [dismissing, setDismissing] = useState<any | null>(null);
  const d: any = q.data;
  if (!d || !d.staff || !d.connected) return null;
  const rows: any[] = d.rows ?? [];
  // Nameless sessions that were only opened stay in the count, not the list to act on.
  const isAttention = (r: any) => r.state === "needs_adding" || (r.state === "in_progress" && r.fullName);
  const attention = rows.filter(isAttention);
  const rest = rows.filter((r) => !isAttention(r));
  const c = d.counts;
  return (
    <Card data-staff-only>
      <CardHeader>
        <CardTitle className="text-base">From the fund's verification link</CardTitle>
        <CardDescription>
          Everyone who opened this fund's own identity-check link. Anyone who finishes but isn't on the fund shows here first and opens an Operations task, so nobody is missed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge variant={c.needs_adding ? "destructive" : "outline"}>{c.needs_adding} finished, not on the fund</Badge>
          <Badge variant="secondary">{c.in_progress} opened, not finished</Badge>
          <Badge>{c.on_fund} on the fund</Badge>
          {c.not_investor ? <Badge variant="outline">{c.not_investor} not an investor</Badge> : null}
          <Badge variant="outline">{c.closed} expired or never started</Badge>
        </div>
        {attention.length === 0 ? <p className="text-sm text-muted-foreground">Nobody is waiting to be added.</p> : (
          <div className="space-y-2">{attention.map((r) => <Row key={r.sessionId} r={r} onAdd={() => setAdding(r)} onDismiss={() => setDismissing(r)} />)}</div>
        )}
        {rest.length > 0 && (
          <Collapsible>
            <CollapsibleTrigger asChild><Button variant="ghost" size="sm" className="gap-1 px-0"><ChevronDown className="h-4 w-4" />Show all {rows.length} sessions</Button></CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-2">{rest.map((r) => <Row key={r.sessionId} r={r} fundId={fundId} onUndo={() => setDismissing({ ...r, undo: true })} />)}</CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
      {adding && <AddDialog fundId={fundId} r={adding} onClose={() => setAdding(null)} onDone={() => { setAdding(null); void q.refetch(); }} />}
      {dismissing && <DismissDialog fundId={fundId} r={dismissing} onClose={() => setDismissing(null)} onDone={() => { setDismissing(null); void q.refetch(); }} />}
    </Card>
  );
}

function Row({ r, fundId, onAdd, onDismiss, onUndo }: { r: any; fundId?: string; onAdd?: () => void; onDismiss?: () => void; onUndo?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
      <div className="min-w-0">
        <p className="font-medium">{r.fullName ?? "Name not given yet"}</p>
        <p className="text-xs text-muted-foreground">{r.email ?? "No email yet"} · {r.status ?? "Unknown"} · last activity {fmtDate(r.lastActivity)} · {r.ref}</p>
        {r.possibleMatch ? <p className="text-xs text-muted-foreground">Same email as {r.possibleMatch.name}, already on the fund. Open their record and load this check there instead of adding a new investor.</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={TONE[r.state as LinkSessionState]}>{LINK_STATE_LABEL[r.state as LinkSessionState]}</Badge>
        {(r.state === "needs_adding" || (r.state === "in_progress" && r.fullName)) && !r.possibleMatch && onAdd ? <Button size="sm" onClick={onAdd}>Add to fund</Button> : null}
        {r.state === "needs_adding" && onDismiss ? <Button size="sm" variant="outline" onClick={onDismiss}>Not an investor</Button> : null}
        {r.state === "not_investor" && onUndo ? <Button size="sm" variant="outline" onClick={onUndo}>Undo</Button> : null}
        {r.state === "on_fund" && r.onboardingId && fundId ? (
          <Link to="/ops/fund/$fundId/investor/$onboardingId" params={{ fundId, onboardingId: r.onboardingId }} className="text-xs text-primary hover:underline">Open investor</Link>
        ) : null}
      </div>
    </div>
  );
}

function AddDialog({ fundId, r, onClose, onDone }: { fundId: string; r: any; onClose: () => void; onDone: () => void }) {
  const add = useServerFn(addLinkSessionInvestorFn);
  const [type, setType] = useState<"individual" | "trust" | "entity">("individual");
  const [legalName, setLegalName] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const res = await add({ data: { offeringId: fundId, sessionId: r.sessionId, profileType: type, legalName: type === "individual" ? null : legalName } });
      toast.success(res.applied ? "Added to the fund with their identity check applied." : "Added to the fund. Their identity check will apply once the result is final.");
      onDone();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add {r.fullName} to the fund</DialogTitle>
          <DialogDescription>Saves their record with the name and email from the identity check and applies the check. No email is sent. You can add the amount and other details on their record.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>How are they investing?</Label>
            <Select value={type} onValueChange={(v) => setType(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="individual">As an individual</SelectItem>
                <SelectItem value="trust">Through a trust</SelectItem>
                <SelectItem value="entity">Through a company</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isEntityProfile(type) && (
            <div className="space-y-1">
              <Label htmlFor="link-legal-name">{type === "trust" ? "Trust" : "Company"} legal name</Label>
              <Input id="link-legal-name" value={legalName} onChange={(e) => setLegalName(e.target.value)} />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={busy || (isEntityProfile(type) && !legalName.trim())} onClick={save}>{busy ? "Adding…" : "Add to fund"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DismissDialog({ fundId, r, onClose, onDone }: { fundId: string; r: any; onClose: () => void; onDone: () => void }) {
  const set = useServerFn(setLinkSessionDismissedFn);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const undo = Boolean(r.undo);
  const save = async () => {
    setBusy(true);
    try { await set({ data: { offeringId: fundId, sessionId: r.sessionId, dismissed: !undo, reason } }); toast.success(undo ? "Moved back to the list to add." : "Marked as not an investor."); onDone(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{undo ? "Undo not an investor" : `${r.fullName ?? "This person"} is not an investor`}</DialogTitle>
          <DialogDescription>{undo ? "They'll show again as finished but not on the fund." : "For example a test, a team member, or a duplicate check. The decision is kept in history and can be undone."}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="link-reason">Reason</Label>
          <Input id="link-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || reason.trim().length < 3} onClick={save}>{busy ? "Saving…" : undo ? "Undo" : "Mark not an investor"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
