import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { recordCommissionPayouts, reverseCommissionPayout } from "@/lib/sales-hub.functions";
import { LAYER_LABEL, type CommissionLayer } from "@/lib/commission-model";
import { Panel, Stat, money } from "@/components/sales/sales-ui";
import { PaymentPlanner } from "@/components/payment-planner";

type Row = {
  lineId: string; userId: string | null; layer: string; client: string; quoteNumber: string | null; invoice: string | null;
  service: string; capTable: boolean; baseCents: number; paidCents: number; paidOn: string | null; name: string; ratePct: number;
  amountCents: number; status: "not_earned" | "scheduled" | "paid_out" | "cancelled"; payoutDue: string | null; cancelReason?: string | null;
  payout: { id: string; date: string; reference: string; note: string | null } | null;
};
const STATUS: Record<Row["status"], string> = { not_earned: "Not earned yet", scheduled: "Scheduled", paid_out: "Paid out", cancelled: "Cancelled" };
const key = (r: Row) => `${r.lineId}|${r.userId}|${r.layer}`;

export function CommissionTracker({ rows, canRecord, onChange }: { rows: Row[]; canRecord: boolean; onChange: () => void }) {
  const record = useServerFn(recordCommissionPayouts);
  const reverse = useServerFn(reverseCommissionPayout);
  const [rep, setRep] = useState(""); const [client, setClient] = useState(""); const [status, setStatus] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10)); const [ref, setRef] = useState(""); const [note, setNote] = useState("");
  const reps = useMemo(() => [...new Set(rows.map((r) => r.name))].sort(), [rows]);
  const clients = useMemo(() => [...new Set(rows.map((r) => r.client))].sort(), [rows]);
  const shown = rows.filter((r) => (!rep || r.name === rep) && (!client || r.client === client) && (!status || r.status === status));
  const sum = (s: Row["status"]) => shown.filter((r) => r.status === s).reduce((t, r) => t + r.amountCents, 0);

  const toggle = (r: Row) => setSel((p) => { const n = new Set(p); n.has(key(r)) ? n.delete(key(r)) : n.add(key(r)); return n; });
  const submit = async () => {
    const items = shown.flatMap(r => sel.has(key(r)) && r.userId ? [{ lineId: r.lineId, userId: r.userId, layer: r.layer }] : []);
    try { const res = await record({ data: { items, payoutDate: date, reference: ref, note: note || null } }); toast.success(`${res.count} payout(s) recorded`); setSel(new Set()); setRef(""); setNote(""); onChange(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const undo = async (id: string) => {
    const reason = window.prompt("Reason for reversing this payout record?"); if (!reason) return;
    try { await reverse({ data: { payoutId: id, reason } }); toast.success("Payout reversed"); onChange(); } catch (e) { toast.error((e as Error).message); }
  };
  const csv = () => {
    const head = ["Client", "Quote", "Invoice", "Service", "Sold", "Client paid", "Paid on", "Rep", "Role", "Rate %", "Commission", "Status", "Payout date", "Reference"];
    const lines = shown.map((r) => [r.client, r.quoteNumber, r.invoice, r.service, r.baseCents / 100, r.paidCents / 100, r.paidOn, r.name, LAYER_LABEL[r.layer as CommissionLayer], r.ratePct, r.amountCents / 100, STATUS[r.status], r.payout?.date ?? r.payoutDue ?? "", r.payout?.reference ?? ""]
      .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
    const url = URL.createObjectURL(new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "commission-tracker.csv"; a.click(); URL.revokeObjectURL(url);
  };
  const sel_ = (v: string, set: (v: string) => void, opts: [string, string][], all: string) => (
    <select className="rounded-md border bg-background px-2 py-1 text-sm" value={v} onChange={(e) => set(e.target.value)}>
      <option value="">{all}</option>{opts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
    </select>
  );
  const payoutCell = (r: Row) => r.payout
    ? <span>{r.payout.date}<div className="text-xs text-muted-foreground">{r.payout.reference}</div>{canRecord && <Button variant="link" size="sm" onClick={() => { if (r.payout) void undo(r.payout.id); }}>Reverse</Button>}</span>
    : r.payoutDue ? <span>Due {r.payoutDue}</span> : <span className="text-xs text-muted-foreground">End of quarter after client pays</span>;

  return (
    <Panel title="Commission tracker">
      <div className="mb-4 grid gap-3 grid-cols-2 sm:grid-cols-4">
        <Stat label="Not earned yet" value={money(sum("not_earned"))} />
        <Stat label="Scheduled" value={money(sum("scheduled"))} />
        <Stat label="Paid out" value={money(sum("paid_out"))} />
        <Stat label="Deals" value={new Set(shown.map((r) => r.quoteNumber)).size} />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {sel_(rep, setRep, reps.map((n) => [n, n]), "All reps")}
        {sel_(client, setClient, clients.map((n) => [n, n]), "All clients")}
        {sel_(status, setStatus, Object.entries(STATUS) as [string, string][], "All statuses")}
        <Button variant="outline" size="sm" onClick={csv}>Download</Button>
      </div>
      <PaymentPlanner scope="commissions" title="Selected payment commission calculations" rows={shown.filter(r => r.paidOn && r.status !== "cancelled").map(r => ({ id: key(r), lineId: r.lineId, userId: r.userId, layer: r.layer, label: `${r.client} · ${r.invoice ?? "Invoice"} · ${r.service} · ${r.name} (${LAYER_LABEL[r.layer as CommissionLayer]})`, cents: r.amountCents, date: r.paidOn, status: r.status }))} />
      {canRecord && sel.size > 0 && (
        <div className="mb-3 flex flex-wrap items-end gap-2 rounded-md border p-3">
          <span className="text-sm">{sel.size} selected</span>
          <Input type="date" className="w-40" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input className="w-48" placeholder="Payroll reference" value={ref} onChange={(e) => setRef(e.target.value)} />
          <Input className="w-56" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button size="sm" disabled={!ref.trim()} onClick={submit}>Mark paid out</Button>
          <p className="w-full text-xs text-muted-foreground">This records the payout only. No money is sent from the platform.</p>
        </div>
      )}
      <div className="space-y-2 md:hidden">
        {shown.map((r) => (
          <div key={key(r)} className="rounded-md border p-3 text-sm">
            <div className="flex justify-between gap-2"><span className="font-medium">{r.client}</span><Badge variant={r.status === "paid_out" ? "default" : "outline"}>{STATUS[r.status]}</Badge></div>
            <div className="text-muted-foreground">{r.service} · sold {money(r.baseCents)} · paid {money(r.paidCents)}{r.paidOn ? ` on ${r.paidOn}` : ""}</div>
            <div>{r.name} ({LAYER_LABEL[r.layer as CommissionLayer]}) · {r.ratePct}% = <b>{money(r.amountCents)}</b></div>
            <div className="flex justify-between">{payoutCell(r)}{canRecord && r.status === "scheduled" && <input type="checkbox" aria-label="Select" checked={sel.has(key(r))} onChange={() => toggle(r)} />}</div>
          </div>
        ))}
      </div>
      <div className="hidden md:block">
        <Table>
          <TableHeader><TableRow>{canRecord && <TableHead />}<TableHead>Client / quote</TableHead><TableHead>Service</TableHead><TableHead className="text-right">Sold</TableHead><TableHead className="text-right">Client paid</TableHead><TableHead>Rep</TableHead><TableHead className="text-right">Commission</TableHead><TableHead>Status</TableHead><TableHead>Payout</TableHead></TableRow></TableHeader>
          <TableBody>
            {shown.map((r) => (
              <TableRow key={key(r)}>
                {canRecord && <TableCell>{r.status === "scheduled" && <input type="checkbox" aria-label="Select" checked={sel.has(key(r))} onChange={() => toggle(r)} />}</TableCell>}
                <TableCell>{r.client}<div className="text-xs text-muted-foreground">{r.quoteNumber} · {r.invoice}</div></TableCell>
                <TableCell>{r.service}{r.capTable && <Badge variant="secondary" className="ml-2">Cap Table</Badge>}</TableCell>
                <TableCell className="text-right">{money(r.baseCents)}</TableCell>
                <TableCell className="text-right">{money(r.paidCents)}{r.paidOn && <div className="text-xs text-muted-foreground">{r.paidOn}</div>}</TableCell>
                <TableCell>{r.name}<div className="text-xs text-muted-foreground">{LAYER_LABEL[r.layer as CommissionLayer]}</div></TableCell>
                <TableCell className="text-right">{money(r.amountCents)}<div className="text-xs text-muted-foreground">{r.ratePct}%</div></TableCell>
                <TableCell><Badge variant={r.status === "paid_out" ? "default" : "outline"}>{STATUS[r.status]}</Badge>{r.cancelReason ? <span className="block text-xs text-muted-foreground">{r.cancelReason}</span> : null}</TableCell>
                <TableCell>{payoutCell(r)}</TableCell>
              </TableRow>
            ))}
            {!shown.length && <TableRow><TableCell colSpan={9} className="text-muted-foreground">No commissions yet. They appear once a signed quote is invoiced.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </Panel>
  );
}
