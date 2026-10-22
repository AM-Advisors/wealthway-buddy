import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getInvestorEconomics, linkPendingSideLetter } from "@/lib/investor-economics.functions";
import { changeInvestmentClassFn, previewClassChangeFn } from "@/lib/fund-setup-canonical.functions";
import { proposeSideLetterChange } from "@/lib/side-letters.functions";
import { generateFundDocFn } from "@/lib/fund-tabs.functions";
import { fmtRate, type EconRow } from "@/lib/investor-economics-model";

const FEE_PICKS = [0, 0.5, 1, 1.5, 2, 2.5];
const CARRY_PICKS = [0, 10, 15, 20, 25, 30];

export function InvestorEconomicsCard({ fundId }: { fundId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(getInvestorEconomics);
  const link = useServerFn(linkPendingSideLetter);
  const q = useQuery({ queryKey: ["investor-economics", fundId], queryFn: () => load({ data: { fundId } }), retry: false });
  const [filter, setFilter] = useState("all");
  const [sel, setSel] = useState<string[]>([]);
  const [editing, setEditing] = useState<EconRow[] | null>(null);
  if (!q.data) return null;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["investor-economics", fundId] }); void qc.invalidateQueries({ queryKey: ["class-assign", fundId] }); };
  const rows = q.data.rows.filter((r) => filter === "all" ? true : filter === "letter" ? !!r.letterId : filter === "default" ? !r.className : r.className === filter);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle className="text-base">Investor economics</CardTitle>
        <p className="text-sm text-muted-foreground">Fund default: fee {fmtRate(q.data.defaults.fee)} · carry {fmtRate(q.data.defaults.carry)}{q.data.classes.map((c) => ` · ${c.name}: ${fmtRate(c.fee)} / ${fmtRate(c.carry)}`).join("")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Filter investors" className="h-9 rounded-md border bg-background px-2 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All investors</option><option value="default">Fund default</option><option value="letter">Has a side letter</option>
            {q.data.classes.map((c) => <option key={c.key} value={c.name}>{c.name}</option>)}
          </select>
          <Button size="sm" disabled={!sel.length} onClick={() => setEditing(q.data!.rows.filter((r) => sel.includes(r.id)))}>Change terms ({sel.length})</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.data.unlinkedLetters.map((l) => (
          <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-2 text-sm">
            <span>Waiting side letter for <strong>{l.label}</strong> (fee {fmtRate(l.fee)}, carry {fmtRate(l.carry)}) —</span>
            <select aria-label="Link to investor" className="h-8 rounded-md border bg-background px-2 text-sm" defaultValue="" onChange={async (e) => {
              if (!e.target.value) return;
              try { await link({ data: { fundId, sideLetterId: l.id, onboardingId: e.target.value } }); toast.success("Side letter linked"); refresh(); } catch (err: any) { toast.error(err.message); }
            }}>
              <option value="">Link to investor…</option>
              {q.data!.rows.filter((r) => !r.letterId).map((r) => <option key={r.id} value={r.id}>{r.investor}</option>)}
            </select>
          </div>
        ))}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground"><tr><th className="w-8" /><th className="py-1 pr-3">Investor</th><th className="pr-3">Class</th><th className="pr-3">Management fee</th><th className="pr-3">Carry</th><th className="pr-3">Where it comes from</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td><input type="checkbox" aria-label={`Select ${r.investor}`} checked={sel.includes(r.id)} onChange={() => toggle(r.id)} /></td>
                  <td className="py-1 pr-3">{r.investor}{r.locked && <Badge variant="outline" className="ml-2">Signed</Badge>}</td>
                  <td className="pr-3">{r.className ?? "Default"}</td>
                  <td className="pr-3">{fmtRate(r.fee)}{r.proposed && r.proposed.fee !== r.fee && <span className="text-muted-foreground"> → {fmtRate(r.proposed.fee)}</span>}</td>
                  <td className="pr-3">{fmtRate(r.carry)}{r.proposed && r.proposed.carry !== r.carry && <span className="text-muted-foreground"> → {fmtRate(r.proposed.carry)}</span>}</td>
                  <td className="pr-3">{r.source}{r.proposed && <Badge variant="secondary" className="ml-2">Side letter proposed</Badge>}</td>
                  <td><Button size="sm" variant="ghost" onClick={() => setEditing([r])}>Change</Button></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={7} className="py-2 text-muted-foreground">No investors match.</td></tr>}
            </tbody>
          </table>
        </div>
      </CardContent>
      {editing && <ChangeTermsDialog fundId={fundId} rows={editing} classes={q.data.classes} onClose={(done) => { setEditing(null); if (done) { setSel([]); refresh(); } }} />}
    </Card>
  );
}

function ChangeTermsDialog({ fundId, rows, classes, onClose }: { fundId: string; rows: EconRow[]; classes: { key: string; name: string; fee: number | null; carry: number | null }[]; onClose: (done: boolean) => void }) {
  const preview = useServerFn(previewClassChangeFn);
  const change = useServerFn(changeInvestmentClassFn);
  const propose = useServerFn(proposeSideLetterChange);
  const generate = useServerFn(generateFundDocFn);
  const first = rows[0]!;
  const [mode, setMode] = useState<"default" | "class" | "custom">("custom");
  const [classKey, setClassKey] = useState(classes[0]?.key ?? "");
  const [fee, setFee] = useState(first.fee == null ? "" : String(first.fee));
  const [carry, setCarry] = useState(first.carry == null ? "" : String(first.carry));
  const [reason, setReason] = useState("");
  const [draft, setDraft] = useState(true);
  const [busy, setBusy] = useState(false);
  const locked = rows.filter((r) => r.locked);

  const save = async () => {
    setBusy(true);
    const failed: string[] = [];
    for (const r of rows) {
      try {
        if (mode !== "custom") {
          const key = mode === "class" ? classKey : null;
          const p = await preview({ data: { onboardingId: r.id } });
          if (p.blocked) throw new Error("signed or funded — needs Harmonious review");
          await change({ data: { onboardingId: r.id, classKey: key, acknowledged: true } });
        } else {
          const terms = [
            fee !== "" ? { id: "fee", category: "fee_discount", description: `Management fee ${fee}% instead of ${fmtRate(r.fee)}.`, value: `${fee}%`, applicability: "This investor only" } : null,
            carry !== "" ? { id: "carry", category: "carry_reduction", description: `Carried interest ${carry}% instead of ${fmtRate(r.carry)}.`, value: `${carry}%`, applicability: "This investor only" } : null,
          ].filter(Boolean) as any[];
          if (!terms.length) throw new Error("enter a fee or carry");
          await propose({ data: { fundId, sideLetterId: null, onboardingId: r.id, kind: "create", reason, snapshot: { investorLabel: r.investor, mfnEnabled: false, mfnScope: null, effectiveDate: null, expiryDate: null, renewalNote: null, documentReference: null, terms } } });
          if (draft) {
            const values: Record<string, string> = { investor: r.investor, date: new Date().toLocaleDateString("en-US") };
            if (fee !== "") { values.include_sl_management_fee = "true"; values.management_rate = `${fee}%`; }
            if (carry !== "") { values.include_sl_carry = "true"; values.carry_rate = `${carry}%`; }
            try { await generate({ data: { fundId, templateKey: "sl_combined", values, onboardingId: r.id } }); }
            catch (e: any) { toast.message(`Side letter proposed for ${r.investor}; draft not generated: ${e.message}`); }
          }
        }
      } catch (e: any) { failed.push(`${r.investor}: ${e.message}`); }
    }
    setBusy(false);
    if (failed.length) toast.error(failed.join("\n")); else toast.success(mode === "custom" ? "Side letter proposed — awaiting approval" : "Terms updated");
    onClose(failed.length < rows.length);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Change terms — {rows.length === 1 ? first.investor : `${rows.length} investors`}</DialogTitle>
          <DialogDescription>Currently fee {fmtRate(first.fee)} · carry {fmtRate(first.carry)} ({first.source}). Fund defaults stay unchanged.</DialogDescription>
        </DialogHeader>
        {locked.length > 0 && <p className="rounded-md border border-destructive/40 p-2 text-sm">{locked.map((r) => r.investor).join(", ")} already signed. Class moves are blocked; a side letter goes to review and may need their consent.</p>}
        <div className="space-y-2 text-sm">
          <label className="flex gap-2"><input type="radio" checked={mode === "default"} onChange={() => setMode("default")} /> Fund default terms</label>
          {classes.length > 0 && <label className="flex gap-2"><input type="radio" checked={mode === "class"} onChange={() => setMode("class")} /> Assign to a class</label>}
          {mode === "class" && (
            <div className="grid gap-2 pl-6">{classes.map((c) => (
              <label key={c.key} className={`flex justify-between rounded-md border p-2 ${classKey === c.key ? "border-primary" : ""}`}>
                <span><input type="radio" className="mr-2" checked={classKey === c.key} onChange={() => setClassKey(c.key)} />{c.name}</span>
                <span className="text-muted-foreground">fee {fmtRate(c.fee)} · carry {fmtRate(c.carry)}</span>
              </label>))}</div>
          )}
          <label className="flex gap-2"><input type="radio" checked={mode === "custom"} onChange={() => setMode("custom")} /> Custom terms (side letter)</label>
          {mode === "custom" && (
            <div className="space-y-3 pl-6">
              <RateField label="Management fee %" value={fee} onChange={setFee} picks={FEE_PICKS} />
              <RateField label="Carried interest %" value={carry} onChange={setCarry} picks={CARRY_PICKS} />
              <Input placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
              <label className="flex gap-2"><input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} /> Also create the draft letter (Harmonious only)</label>
              <p className="text-xs text-muted-foreground">Proposed until a second person approves. The draft cites the Operating and Subscription Agreements.</p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onClose(false)}>Cancel</Button>
          <Button disabled={busy || (mode === "custom" && reason.trim().length < 3)} onClick={save}>{busy ? "Saving…" : "Save"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RateField({ label, value, onChange, picks }: { label: string; value: string; onChange: (v: string) => void; picks: number[] }) {
  return (
    <div className="space-y-1">
      <span className="text-xs font-medium">{label}</span>
      <div className="flex flex-wrap items-center gap-1">
        {picks.map((p) => <Button key={p} type="button" size="sm" variant={value === String(p) ? "default" : "outline"} onClick={() => onChange(String(p))}>{p}%</Button>)}
        <Input aria-label={label} className="h-8 w-20" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))} />
      </div>
    </div>
  );
}
