import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { bulkCancelFn, bulkCommitFn, bulkPreviewFn } from "@/lib/investor-record.functions";
import { BULK_CLASS_LABELS, BULK_COLUMNS, type BulkClass } from "@/lib/investor-record-model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type Preview = { importId: string; summary: Record<BulkClass, number>; rows: { index: number; cls: string; errors: string[]; name: string; email: string; amount: string; conflicts: { field: string; current: unknown; proposed: unknown }[] }[] };
const tone: Record<BulkClass, "default" | "secondary" | "outline" | "destructive"> = { create_new: "default", match_existing: "secondary", already_in_fund: "outline", needs_review: "outline", invalid: "destructive" };

/** Nothing is written until the preview is confirmed. Conflicts never overwrite silently. */
export function BulkInvestorRecords({ fundId, isStaff }: { fundId: string; isStaff: boolean }) {
  const preview = useServerFn(bulkPreviewFn);
  const commit = useServerFn(bulkCommitFn);
  const cancel = useServerFn(bulkCancelFn);
  const qc = useQueryClient();
  const [csv, setCsv] = useState("");
  const [p, setP] = useState<Preview | null>(null);
  const [decisions, setDecisions] = useState<Record<string, "keep" | "use_imported" | "later">>({});
  const [busy, setBusy] = useState(false);

  const onFile = async (file?: File) => { if (file) setCsv(await file.text()); };
  const run = async () => { setBusy(true); try { setP((await preview({ data: { offeringId: fundId, csv } })) as Preview); setDecisions({}); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } };
  const confirm = async () => {
    if (!p) return; setBusy(true);
    try {
      const r = await commit({ data: { importId: p.importId, decisions } });
      const ok = r.results.filter((x) => x.ok).length;
      toast.success(`${ok} investor${ok === 1 ? "" : "s"} added${r.results.length > ok ? `, ${r.results.length - ok} skipped` : ""}.`);
      setP(null); setCsv("");
      qc.invalidateQueries({ queryKey: ["fund-investor-records", fundId] });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Bulk Add Investors</CardTitle>
        <p className="text-sm text-muted-foreground">Upload a CSV with columns: {BULK_COLUMNS.join(", ")}. You'll see a preview first; nothing is saved and no one is emailed until you confirm.</p></CardHeader>
      <CardContent className="space-y-3">
        {!p ? <>
          <input type="file" accept=".csv,text/csv" aria-label="Choose CSV file" onChange={(e) => onFile(e.target.files?.[0])} className="text-sm" />
          <Textarea aria-label="CSV content" rows={5} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="first_name,last_name,email,profile_type,amount" />
          <Button onClick={run} disabled={busy || !csv.trim()}>{busy ? "Checking…" : "Preview"}</Button>
        </> : <>
          <div className="flex flex-wrap gap-2">{(Object.keys(p.summary) as BulkClass[]).map((k) => <Badge key={k} variant={tone[k]}>{BULK_CLASS_LABELS[k]}: {p.summary[k]}</Badge>)}</div>
          <div className="divide-y rounded-md border">
            {p.rows.map((r) => (
              <div key={r.index} className="space-y-1 p-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">Row {r.index + 1}: {r.name || "—"} <span className="font-normal text-muted-foreground">{r.email} {r.amount ? `· $${r.amount}` : ""}</span></span><Badge variant={tone[r.cls as BulkClass]}>{BULK_CLASS_LABELS[r.cls as BulkClass]}</Badge></div>
                {r.errors.map((e) => <p key={e} className="text-xs text-destructive">{e}</p>)}
                {r.conflicts.map((c) => {
                  const key = `${r.index}:${c.field}`; const v = decisions[key] ?? "later";
                  return <div key={key} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-muted-foreground">{c.field.replace(/_/g, " ")}: Harmonious "{String(c.current)}" vs imported "{String(c.proposed)}"</span>
                    {(["keep", "use_imported", "later"] as const).filter((d) => d !== "use_imported" || isStaff).map((d) => <Button key={d} size="sm" variant={v === d ? "default" : "outline"} onClick={() => setDecisions((s) => ({ ...s, [key]: d }))}>{d === "keep" ? "Keep Harmonious" : d === "use_imported" ? "Use Imported Value" : "Review Later"}</Button>)}
                  </div>;
                })}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Create new and Match existing rows are added. Needs review rows with one clear match are added and each difference follows your choice; Invalid and Already in Fund rows are skipped.</p>
          <div className="flex gap-2"><Button onClick={confirm} disabled={busy}>{busy ? "Saving…" : "Confirm & Add"}</Button><Button variant="outline" onClick={async () => { await cancel({ data: { importId: p.importId } }).catch(() => null); setP(null); }}>Cancel</Button></div>
        </>}
      </CardContent>
    </Card>
  );
}
