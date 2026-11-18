import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fundStateFilingsFn, saveStateFilingFn, recordStateFilingFn, confirmStateFilingFn, type StateFilingRow } from "@/lib/state-filings.functions";
import { invalidateFund } from "@/lib/fund-query-keys";
import { fmtDate, usd } from "./shared";

const urgencyBadge: Record<string, { label: string; v: "destructive" | "default" | "outline" | "secondary" }> = {
  past_due: { label: "Past due", v: "destructive" }, due_soon: { label: "Due within 30 days", v: "default" }, upcoming: { label: "Upcoming", v: "outline" }, filed: { label: "Filed", v: "secondary" },
};
const basisLabel = { formation: "State where the fund was formed", manager: "Fund manager's office state", added: "Added by Harmonious" } as const;
const filerLabel = (f: string | null) => (f === "harmonious" ? "Harmonious" : f === "client_counsel" ? "Client or counsel" : "Not set");

export function StateFilingsCard({ fundId }: { fundId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(fundStateFilingsFn); const save = useServerFn(saveStateFilingFn);
  const record = useServerFn(recordStateFilingFn); const confirm = useServerFn(confirmStateFilingFn);
  const q = useQuery({ queryKey: ["fund-state-filings", fundId], queryFn: () => load({ data: { fundId } }) });
  const [rec, setRec] = useState<any | null>(null); const [add, setAdd] = useState<any | null>(null);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["fund-state-filings", fundId] }); void invalidateFund(qc, fundId); };
  const run = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast.success(ok); refresh(); return true; } catch (e) { toast.error((e as Error).message); return false; } };

  if (q.isLoading) return null;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const d = q.data!;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle>State franchise tax and annual reports</CardTitle>
          <CardDescription className="text-base">Yearly state filings for this fund, based on where it was formed{d.managerState ? " and where the fund manager is located" : ""}. Nothing is filed or paid automatically. State rules last checked {fmtDate(d.lastChecked)}; confirm with the state before filing.</CardDescription>
        </div>
        {d.staff && <Button size="sm" onClick={() => setAdd({ state: "", applies: true, reason: "", filer: null })}>Add state</Button>}
      </CardHeader>
      <CardContent className="space-y-4">
        {!d.formedIn && <p className="text-sm text-muted-foreground">Add the state of formation in fund setup to see the required filing.</p>}
        {d.rows.map((r) => <Row key={r.state} r={r} staff={d.staff}
          onRecord={() => setRec({ state: r.state, year: r.nextYear ?? new Date().getFullYear(), filedOn: new Date().toISOString().slice(0, 10), confirmation: "" })}
          onEdit={() => setAdd({ state: r.state, applies: r.applies, reason: r.notApplicableReason ?? "", filer: r.filer, fixed: true })}
          onConfirm={() => run(() => confirm({ data: { fundId, eventId: r.awaitingConfirmation!.id } }), "Filing confirmed")} />)}
      </CardContent>

      <Dialog open={!!rec} onOpenChange={(o) => !o && setRec(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record {rec?.state} filing as filed</DialogTitle></DialogHeader>
          {rec && <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Filing year</Label><Input type="number" value={rec.year} onChange={(e) => setRec({ ...rec, year: Number(e.target.value) })} /></div>
            <div><Label>Date filed</Label><Input type="date" value={rec.filedOn} onChange={(e) => setRec({ ...rec, filedOn: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>Confirmation number</Label><Input value={rec.confirmation} onChange={(e) => setRec({ ...rec, confirmation: e.target.value })} /></div>
            <p className="sm:col-span-2 text-sm text-muted-foreground">A different team member confirms it afterwards. Recorded filings can't be edited or deleted.</p>
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setRec(null)}>Cancel</Button>
            <Button onClick={async () => { if (await run(() => record({ data: { fundId, ...rec } }), "Filing recorded")) setRec(null); }}>Record filing</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!add} onOpenChange={(o) => !o && setAdd(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{add?.fixed ? `${add.state} filing settings` : "Add a state"}</DialogTitle></DialogHeader>
          {add && <div className="grid gap-3">
            {!add.fixed && <div><Label>State</Label><Input value={add.state} placeholder="TX" onChange={(e) => setAdd({ ...add, state: e.target.value })} /></div>}
            <div><Label>Does this filing apply?</Label>
              <div className="mt-1 flex gap-2"><Button size="sm" variant={add.applies ? "default" : "outline"} onClick={() => setAdd({ ...add, applies: true })}>Applies</Button><Button size="sm" variant={!add.applies ? "default" : "outline"} onClick={() => setAdd({ ...add, applies: false })}>Not applicable</Button></div></div>
            {!add.applies && <div><Label>Reason</Label><Input value={add.reason} onChange={(e) => setAdd({ ...add, reason: e.target.value })} /></div>}
            {add.applies && <div><Label>Who files</Label>
              <div className="mt-1 flex gap-2">{(["harmonious", "client_counsel"] as const).map((f) => <Button key={f} size="sm" variant={add.filer === f ? "default" : "outline"} onClick={() => setAdd({ ...add, filer: f })}>{filerLabel(f)}</Button>)}</div></div>}
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setAdd(null)}>Cancel</Button>
            <Button onClick={async () => { if (await run(() => save({ data: { fundId, state: add.state, applies: add.applies, reason: add.reason, filer: add.applies ? add.filer : null } }), "Saved")) setAdd(null); }}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Row({ r, staff, onRecord, onEdit, onConfirm }: { r: StateFilingRow; staff: boolean; onRecord: () => void; onEdit: () => void; onConfirm: () => void }) {
  const b = urgencyBadge[r.urgency] ?? urgencyBadge["upcoming"]!;
  return (
    <div className="rounded-md border p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-base font-medium">{r.state}: {r.rule?.filing ?? "Yearly state filing"}</p>
          <p className="text-muted-foreground">{basisLabel[r.basis]} · Files: {filerLabel(r.filer)}</p>
        </div>
        {r.applies ? <Badge variant={b.v}>{b.label}</Badge> : <Badge variant="secondary">Not applicable</Badge>}
      </div>
      {!r.applies && <p className="mt-2 text-muted-foreground">Reason: {r.notApplicableReason}</p>}
      {r.applies && <>
        {r.needsCounsel && <p className="mt-2 text-muted-foreground">The fund may need to register in this state because the manager is located here. Confirm with counsel.</p>}
        {!r.rule && <p className="mt-2 text-muted-foreground">We don't have this state's rules yet. Check the state's website and record the filing here.</p>}
        {r.rule && <dl className="mt-3 grid gap-x-4 gap-y-1 sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Next due</dt><dd className="font-medium">{r.nextDue ? `${fmtDate(r.nextDue)} (${r.nextYear})` : r.needsFormationDate ? "Add the formation date in fund setup" : "-"}</dd></div>
          <div><dt className="text-muted-foreground">State fee</dt><dd>{r.rule.feeCents != null ? usd(r.rule.feeCents) : "Varies, needs review"}</dd></div>
          <div><dt className="text-muted-foreground">If late</dt><dd>{r.rule.penalty}</dd></div>
          <div><dt className="text-muted-foreground">Where to file</dt><dd><a className="underline" href={r.rule.fileAt} target="_blank" rel="noreferrer">State filing site</a></dd></div>
          <div className="sm:col-span-2"><dt className="text-muted-foreground">What you need</dt><dd>{r.rule.bring.join(", ")}</dd></div>
        </dl>}
      </>}
      {r.awaitingConfirmation && <p className="mt-3">{r.awaitingConfirmation.year} filing recorded {fmtDate(r.awaitingConfirmation.filedOn)}, waiting for a second person to confirm.</p>}
      {r.history.length > 0 && <p className="mt-2 text-muted-foreground">History: {r.history.map((h) => `${h.year} filed ${fmtDate(h.filedOn)}${h.confirmed ? "" : " (unconfirmed)"}`).join(" · ")}</p>}
      {staff && <div className="mt-3 flex flex-wrap gap-2">
        {r.applies && r.nextYear && <Button size="sm" onClick={onRecord}>Record as filed</Button>}
        {r.awaitingConfirmation && !r.awaitingConfirmation.byMe && <Button size="sm" variant="outline" onClick={onConfirm}>Confirm filing</Button>}
        <Button size="sm" variant="ghost" onClick={onEdit}>Settings</Button>
      </div>}
    </div>
  );
}
