import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { bulkEnterVerificationFn } from "@/lib/staff-verification.functions";
import { bulkTemplateCsv, columnKey, planBulkRow, type BulkPlan, type BulkVerificationRow } from "@/lib/staff-verification-model";

const MAX_ROWS = 500;
const CONCURRENCY = 3;
const todayStr = () => new Date().toISOString().slice(0, 10);

function included(p: BulkPlan) {
  const i = p.input;
  return [i.kyc ? "Past ID check" : null, i.kyb ? "Past business check" : null, i.aml ? "Past screening" : null, i.runScreening ? "Fresh screening" : null,
    i.details ? "Details" : null, i.idNumber ? `ID ••${String(i.idNumber).replace(/[^A-Za-z0-9]/g, "").slice(-4)}` : null,
    i.ssn ? `SSN ••${String(i.ssn).replace(/\D/g, "").slice(-4)}` : null, i.ein ? `EIN ••${String(i.ein).replace(/\D/g, "").slice(-4)}` : null].filter(Boolean) as string[];
}

/** Upload a spreadsheet of past clients; each row becomes its own entry waiting for a second reviewer. */
export function BulkVerificationDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const bulk = useServerFn(bulkEnterVerificationFn);
  const [fileName, setFileName] = useState("");
  const [plans, setPlans] = useState<BulkPlan[]>([]);
  const [readError, setReadError] = useState<string | null>(null);
  const [results, setResults] = useState<Record<number, { ok: boolean; message: string }>>({});
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);

  const ready = useMemo(() => plans.filter((p) => !p.problems.length && p.match), [plans]);
  const fresh = ready.filter((p) => p.input.runScreening).length;

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([bulkTemplateCsv()], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "past-verification-template.csv"; a.click(); URL.revokeObjectURL(url);
  };

  const readFile = async (file: File) => {
    setReadError(null); setResults({}); setDone(0); setFileName(file.name);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false, raw: false });
      const sheet = wb.Sheets[wb.SheetNames[0] ?? ""];
      if (!sheet) throw new Error("The file has no sheets.");
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false, dateNF: "yyyy-mm-dd" });
      if (!raw.length) throw new Error("The file has no rows under the header.");
      if (raw.length > MAX_ROWS) throw new Error(`Upload at most ${MAX_ROWS} rows at a time.`);
      const rows: BulkVerificationRow[] = raw.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [columnKey(k), String(v ?? "")])) as BulkVerificationRow);
      setPlans(rows.map((r, i) => planBulkRow(r, i + 2, todayStr())));
    } catch (e) {
      setPlans([]); setReadError(e instanceof Error ? e.message : "Couldn't read that file.");
    }
  };

  const submit = async () => {
    if (!ready.length) return;
    setRunning(true); setDone(0);
    const batchId = crypto.randomUUID();
    const queue = [...ready];
    let count = 0;
    const worker = async () => {
      for (let p = queue.shift(); p; p = queue.shift()) {
        try {
          const [res] = await bulk({ data: { batchId, rows: [{ row: p.row, clientKey: crypto.randomUUID(), match: p.match!, input: p.input as any }] } });
          setResults((r) => ({ ...r, [p!.row]: res ?? { ok: false, message: "No answer from the server." } }));
        } catch (e) {
          setResults((r) => ({ ...r, [p!.row]: { ok: false, message: e instanceof Error ? e.message : "Couldn't save this row." } }));
        }
        count += 1; setDone(count);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    setRunning(false); onSaved();
    toast.success("Finished. Saved rows are waiting for another team member to review.");
  };

  const reset = () => { setPlans([]); setFileName(""); setReadError(null); setResults({}); setDone(0); };
  const saved = Object.values(results).filter((r) => r.ok).length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!running) { onOpenChange(o); if (!o) reset(); } }}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader className="text-left">
          <DialogTitle>Upload past verifications</DialogTitle>
          <DialogDescription>One row per person or company. People are found by email, companies by exact legal name. Every saved row still waits for another team member to approve it.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={downloadTemplate}>Download the template</Button>
            <Input type="file" aria-label="Spreadsheet" className="max-w-sm" accept=".csv,.xlsx,.xls" disabled={running} onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f); }} />
          </div>
          <p className="text-xs text-muted-foreground">CSV or Excel. In the screening column write <strong>run</strong> for a fresh screening now, <strong>past</strong> to record an earlier one, or leave it blank. Full ID numbers, SSNs and EINs are stored encrypted and only the last 4 are shown.</p>
          {readError ? <p className="text-sm text-destructive">{readError}</p> : null}
          {plans.length ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{fileName}</span>
                <Badge variant="outline">{ready.length} ready</Badge>
                {plans.length - ready.length ? <Badge variant="destructive">{plans.length - ready.length} need fixing</Badge> : null}
                {fresh ? <span className="text-muted-foreground">{fresh} fresh screening{fresh > 1 ? "s" : ""} will run; each is a paid check.</span> : null}
              </div>
              {running || done ? <div className="space-y-1"><Progress value={ready.length ? (done / ready.length) * 100 : 0} /><p className="text-xs text-muted-foreground">{done} of {ready.length} done · {saved} saved</p></div> : null}
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-left text-xs"><tr><th className="p-2">Row</th><th className="p-2">Who</th><th className="p-2">Included</th><th className="p-2">Status</th></tr></thead>
                  <tbody>
                    {plans.map((p) => {
                      const res = results[p.row];
                      return (
                        <tr key={p.row} className="border-t align-top">
                          <td className="p-2 text-xs text-muted-foreground">{p.row}</td>
                          <td className="p-2"><p className="font-medium">{p.label}</p><p className="text-xs text-muted-foreground">{p.input.subject === "company" ? "Company" : p.match?.kind === "person" ? p.match.email : "Person"}</p></td>
                          <td className="p-2 text-xs">{included(p).join(" · ") || "Nothing"}</td>
                          <td className="p-2 text-xs">
                            {res ? <span className={res.ok ? "" : "text-destructive"}>{res.message}</span>
                              : p.problems.length ? <ul className="list-disc space-y-0.5 pl-4 text-destructive">{p.problems.map((x) => <li key={x}>{x}</li>)}</ul>
                              : <span className="text-muted-foreground">Ready</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={running} onClick={() => { onOpenChange(false); reset(); }}>{done ? "Close" : "Cancel"}</Button>
          <Button disabled={running || !ready.length || done > 0} onClick={() => void submit()}>{running ? "Saving…" : `Save ${ready.length} row${ready.length === 1 ? "" : "s"} for review`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
