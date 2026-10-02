import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilingFormDialog } from "@/components/filing-form-dialog";
import { generateCloseFilings, listCloseFilings, recordCloseFiling } from "@/lib/close-filings.functions";

const money = (c: number | null | undefined) =>
  c == null ? "needs review" : `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function CloseFilingsPanel({ requestId, canPrepare }: { requestId: string; canPrepare: boolean }) {
  const qc = useQueryClient();
  const list = useServerFn(listCloseFilings);
  const gen = useServerFn(generateCloseFilings);
  const key = ["close-filings", requestId];
  const q = useQuery({ queryKey: key, queryFn: () => list({ data: { id: requestId } }) });
  const [busy, setBusy] = useState(false);
  async function prepare() {
    setBusy(true);
    try {
      const res = await gen({ data: { id: requestId } });
      if (res.missing.length) toast.warning(`Prepared, but missing: ${res.missing.join(", ")}.`);
      else toast.success("Filing packets prepared.");
      await qc.invalidateQueries({ queryKey: key });
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't prepare filings.");
    } finally {
      setBusy(false);
    }
  }
  const rows = q.data ?? [];
  return (
    <div className="mt-3 space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">Filings</p>
        {canPrepare && (
          <Button size="sm" variant="outline" disabled={busy} onClick={prepare}>
            {rows.length ? "Prepare any missing filings" : "Generate Form D and state filings"}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        File each one on EDGAR or the state system yourself, then record it here. Someone other than the preparer must record it.
      </p>
      {q.isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : q.error ? (
        <p className="text-xs text-destructive">{(q.error as Error).message}</p>
      ) : !rows.length ? (
        <p className="text-xs text-muted-foreground">No filings prepared yet.</p>
      ) : (
        rows.map((f: any) => <FilingRow key={f.id} f={f} onDone={() => qc.invalidateQueries({ queryKey: key })} />)
      )}
    </div>
  );
}

function FilingRow({ f, onDone }: { f: any; onDone: () => void }) {
  const record = useServerFn(recordCloseFiling);
  const [conf, setConf] = useState("");
  const [date, setDate] = useState("");
  const [fee, setFee] = useState("");
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const title = f.filing_type === "form_d" ? `Form D${f.is_amendment ? " (amendment)" : ""}` : `${f.jurisdiction} state notice filing`;

  function download() {
    const body = { filing: title, investorCount: f.investor_count, amountSoldCents: f.amount_cents, ...f.packet };
    const blob = new Blob([JSON.stringify(body, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${f.filing_type}-${f.jurisdiction}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function save(outcome: "filed" | "not_required") {
    setBusy(true);
    try {
      const feeCents = fee.trim() ? Math.round(Number(fee) * 100) : undefined;
      if (feeCents !== undefined && !Number.isFinite(feeCents)) throw new Error("Enter the fee as a number.");
      await record({ data: { id: f.id, outcome, confirmationNumber: conf, filedOn: date || undefined, feeCents, note } });
      toast.success("Filing recorded.");
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't record.");
    } finally {
      setBusy(false);
    }
  }

  const statusLabel =
    f.status === "prepared" ? "Ready to file" : f.status === "filed" ? `Filed ${f.filed_on ?? ""} · ${f.confirmation_number ?? ""}` : "Not required";

  return (
    <div className="rounded border p-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-muted-foreground">
            {f.investor_count} investor{f.investor_count === 1 ? "" : "s"} · {money(f.amount_cents)} sold · fee {money(f.fee_cents)}
            {f.filing_type === "form_d" ? " (Harmonious fee)" : ""}
          </p>
          {f.packet?.missing?.length ? <p className="text-destructive">Missing: {f.packet.missing.join(", ")}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={f.status === "prepared" ? "outline" : "secondary"}>{statusLabel}</Badge>
          <Button size="sm" variant="outline" onClick={() => setFormOpen(true)}>Open filled form</Button>
          <Button size="sm" variant="ghost" onClick={download}>Download data</Button>
          <FilingFormDialog filingId={f.id} fileName={`${f.filing_type === "form_d" ? "form-d" : "state-notice"}-${f.jurisdiction}.pdf`} open={formOpen} onOpenChange={setFormOpen} />
          {f.status === "prepared" && (
            <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>Record</Button>
          )}
        </div>
      </div>
      {open && f.status === "prepared" && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Input placeholder="Confirmation or accession number" value={conf} onChange={(e) => setConf(e.target.value)} className="max-w-60" />
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="max-w-40" />
          {f.fee_needs_review && <Input placeholder="State fee paid ($)" value={fee} onChange={(e) => setFee(e.target.value)} className="max-w-36" />}
          <Input placeholder="Note (required for Not required)" value={note} onChange={(e) => setNote(e.target.value)} className="max-w-64" />
          <Button size="sm" disabled={busy} onClick={() => save("filed")}>Mark filed</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => save("not_required")}>Not required</Button>
        </div>
      )}
    </div>
  );
}
