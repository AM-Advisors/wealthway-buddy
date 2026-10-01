import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  list1065sFn, get1065DetailFn, save1065DetailFn, k1HistoryFn, listFormPfFn, createFormPfFn, saveFormPfFn,
  listIrsFn, recordIrsFn, updateIrsStatusFn,
} from "@/lib/tax-phase4.functions";
import { listTaxProfileFunds } from "@/lib/fund-tax.functions";
import { SCHEDULES_1065, linesFor, type DetailStage } from "@/lib/form-1065-detail";
import { PF_STATUS_LABEL, PF_SECTIONS, ADVISER_SIZES, pfNext, IRS_STATUS_LABEL, IRS_NOTICE_SUGGESTIONS, type PfStatus, type IrsStatus } from "@/lib/form-pf";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const sel = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
const usd = (c: number | null | undefined) => (c == null ? "—" : (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" }));
const fmt = (s?: string | null) => (s ? new Date(s.length === 10 ? `${s}T12:00:00` : s).toLocaleDateString() : "—");
const STAGE_LABEL: Record<DetailStage, string> = { draft: "Draft", ready_for_review: "Ready for review", reviewed: "Reviewed", returned: "Returned for changes" };

function useRun<T>(fn: (a: { data: T }) => Promise<unknown>, done: () => void) {
  const [busy, setBusy] = useState(false);
  return { busy, run: async (data: T, ok = "Saved") => { setBusy(true); try { await fn({ data }); toast.success(ok); done(); return true; } catch (e: any) { toast.error(e.message); return false; } finally { setBusy(false); } } };
}
function TieList({ ties }: { ties: any[] }) {
  return <ul className="space-y-1 text-sm">{ties.map((t) => (
    <li key={t.id} className="flex items-start gap-2"><Badge variant={t.ok === false ? "destructive" : t.ok ? "secondary" : "outline"}>{t.ok === false ? "Differs" : t.ok ? "Ties" : "Not yet"}</Badge><span>{t.label}<span className="block text-xs text-muted-foreground">{t.detail}</span></span></li>
  ))}</ul>;
}

/* ------------------------------------------------------------ 1065 detail */

export function Form1065DetailPanel({ offeringId }: { offeringId?: string }) {
  const list = useServerFn(list1065sFn);
  const q = useQuery({ queryKey: ["1065-list", offeringId ?? "all"], queryFn: () => list({ data: offeringId ? { offeringId } : {} }) });
  const [rid, setRid] = useState("");
  const returns = q.data?.returns ?? [];
  useEffect(() => { if (!rid && returns[0]) setRid(returns[0].id); }, [returns, rid]);
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!returns.length) return <p className="text-sm text-muted-foreground">No 1065s have been prepared yet. Prepare one from a tax year first.</p>;
  return (
    <div className="space-y-4">
      <div className="max-w-md"><Label className="text-xs">1065</Label>
        <select className={sel} value={rid} onChange={(e) => setRid(e.target.value)}>{returns.map((r: any) => <option key={r.id} value={r.id}>{r.fundName} · {r.taxYear} · v{r.version} ({r.status})</option>)}</select>
      </div>
      {rid && <Detail returnId={rid} key={rid} />}
    </div>
  );
}

function Detail({ returnId }: { returnId: string }) {
  const load = useServerFn(get1065DetailFn);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["1065-detail", returnId], queryFn: () => load({ data: { returnId } }) });
  const { busy, run } = useRun(useServerFn(save1065DetailFn), () => qc.invalidateQueries({ queryKey: ["1065-detail", returnId] }));
  const [vals, setVals] = useState<Record<string, string>>({});
  const [ans, setAns] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  useEffect(() => {
    const d: any = q.data;
    if (d?.values) setVals(Object.fromEntries(Object.entries(d.values).map(([k, v]) => [k, ((v as number) / 100).toFixed(2)])));
    if (d?.answers) setAns(d.answers);
  }, [q.data]);
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading 1065 detail…</p>;
  if (q.error || !q.data) return <p className="text-sm text-destructive">{(q.error as Error)?.message ?? "Couldn't load."}</p>;
  const d: any = q.data;
  const locked = d.stage === "reviewed" || d.stage === "ready_for_review";
  const cents = () => Object.fromEntries(Object.entries(vals).filter(([, v]) => v.trim() !== "" && Number.isFinite(Number(v))).map(([k, v]) => [k, Math.round(Number(v) * 100)]));
  const save = (stage: DetailStage, ok: string) => run({ returnId, values: cents(), answers: ans, stage, note: note || null }, ok).then((r) => r && setNote(""));
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="text-base">{d.fundName} — Form 1065, {d.taxYear}</CardTitle><Badge variant="secondary">{d.stage ? STAGE_LABEL[d.stage as DetailStage] : "Not started"}</Badge></div>
        <CardDescription>{d.k1Count} current K-1s. {d.prefilled ? "Amounts below are pre-filled from the prepared return and K-1s; save to start the detail." : `Detail version ${d.detailVersion}.`} Every save adds a version; nothing is filed from here.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <section className="space-y-2"><h4 className="text-sm font-semibold">Tie-out checks</h4><TieList ties={d.ties} /></section>
        {d.canEdit && SCHEDULES_1065.map((s) => (
          <section key={s.id} className="space-y-2 border-t pt-3">
            <h4 className="text-sm font-semibold">{s.label}</h4><p className="text-xs text-muted-foreground">{s.note}</p>
            <div className="grid gap-2 sm:grid-cols-2">{linesFor(s.id).map((l) => (
              <div key={l.id} className="grid grid-cols-[1fr_10rem] items-center gap-2 text-sm">
                <span><span className="text-xs text-muted-foreground">Line {l.line}</span> {l.label}</span>
                {l.kind === "text" ? <Input disabled={locked} value={ans[l.id] ?? ""} onChange={(e) => setAns({ ...ans, [l.id]: e.target.value })} />
                  : l.kind === "yesno" ? <select disabled={locked} className={sel} value={ans[l.id] ?? ""} onChange={(e) => setAns({ ...ans, [l.id]: e.target.value })}><option value="">—</option><option value="yes">Yes</option><option value="no">No</option></select>
                  : <Input disabled={locked} inputMode="decimal" className="text-right" value={vals[l.id] ?? ""} onChange={(e) => setVals({ ...vals, [l.id]: e.target.value })} />}
              </div>
            ))}</div>
          </section>
        ))}
        {d.canEdit && d.stage !== "reviewed" && (
          <div className="space-y-2 border-t pt-3">
            <Label className="text-xs">Note (optional)</Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              {!locked && <Button size="sm" variant="outline" disabled={busy} onClick={() => save("draft", "Draft saved")}>Save draft</Button>}
              {!locked && <Button size="sm" disabled={busy} onClick={() => save("ready_for_review", "Sent for review")}>Send for review</Button>}
              {d.stage === "ready_for_review" && <Button size="sm" disabled={busy} onClick={() => save("reviewed", "Review approved")}>Approve review</Button>}
              {d.stage === "ready_for_review" && <Button size="sm" variant="outline" disabled={busy} onClick={() => save("returned", "Returned")}>Return for changes</Button>}
            </div>
          </div>
        )}
        {d.canEdit && d.history.length > 0 && (
          <section className="space-y-1 border-t pt-3"><h4 className="text-sm font-semibold">History</h4>
            <ol className="text-sm">{d.history.map((h: any) => <li key={h.version}>v{h.version} · {STAGE_LABEL[h.stage as DetailStage]} · {h.by} · {fmt(h.at)}{h.note ? ` — ${h.note}` : ""}</li>)}</ol>
          </section>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------ K-1 history */

function FundPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const fundsFn = useServerFn(listTaxProfileFunds);
  const f = useQuery({ queryKey: ["tax-profile-funds"], queryFn: () => fundsFn() });
  const list = ((f.data as any)?.funds ?? []) as { id: string; name: string }[];
  useEffect(() => { if (!value && list[0]) onChange(list[0].id); }, [list, value, onChange]);
  return <div className="max-w-md"><Label className="text-xs">Fund</Label><select className={sel} value={value} onChange={(e) => onChange(e.target.value)}>{list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>;
}

export function K1HistoryPanel() {
  const [fund, setFund] = useState("");
  const load = useServerFn(k1HistoryFn);
  const q = useQuery({ queryKey: ["k1-history", fund], queryFn: () => load({ data: { offeringId: fund } }), enabled: !!fund });
  const d: any = q.data;
  return (
    <div className="space-y-4">
      <FundPicker value={fund} onChange={setFund} />
      {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : !d ? null : d.chains.length === 0 ? <p className="text-sm text-muted-foreground">No K-1s for this Fund yet.</p> : (
        <ul className="space-y-3">{d.chains.map((c: any, i: number) => (
          <li key={i} className="rounded-md border p-3 text-sm">
            <p className="font-medium">{c.investor} · {c.taxYear}</p>
            <ol className="mt-1 space-y-1">{c.versions.map((v: any) => (
              <li key={v.id}>
                <span>v{v.version} — {v.status}</span> <span className="text-xs text-muted-foreground">{fmt(v.at)}</span>
                {d.canSeeDetail ? <>
                  {v.reason && <span className="block text-xs">Reason: {v.reason}</span>}
                  {v.changes?.length > 0 && <span className="block text-xs text-muted-foreground">Changed: {v.changes.map((ch: any) => `Box ${ch.box} ${usd(ch.from)} → ${usd(ch.to)}`).join("; ")}</span>}
                  <span className="block text-xs text-muted-foreground">Prepared {v.preparedBy ?? "—"} · Reviewed {v.reviewedBy ?? "—"} · Approved {v.approvedBy ?? "—"}</span>
                </> : v.changedBoxes > 0 && <span className="block text-xs text-muted-foreground">{v.changedBoxes} boxes changed</span>}
              </li>
            ))}</ol>
          </li>
        ))}</ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ Form PF */

export function FormPfPanel() {
  const load = useServerFn(listFormPfFn);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["form-pf"], queryFn: () => load() });
  const refresh = () => qc.invalidateQueries({ queryKey: ["form-pf"] });
  const create = useRun(useServerFn(createFormPfFn), refresh);
  const [n, setN] = useState({ adviserName: "", periodType: "annual" as "annual" | "quarterly", periodEnd: "" });
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const d: any = q.data;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Harmonious prepares Form PF records; the adviser files through the SEC's filing system. Each change adds a version and a filed record is locked.</p>
      <Card><CardContent className="grid gap-2 pt-4 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
        <div><Label className="text-xs">Adviser name</Label><Input value={n.adviserName} onChange={(e) => setN({ ...n, adviserName: e.target.value })} /></div>
        <div><Label className="text-xs">Period</Label><select className={sel} value={n.periodType} onChange={(e) => setN({ ...n, periodType: e.target.value as any })}><option value="annual">Annual</option><option value="quarterly">Quarterly</option></select></div>
        <div><Label className="text-xs">Period end</Label><Input type="date" value={n.periodEnd} onChange={(e) => setN({ ...n, periodEnd: e.target.value })} /></div>
        <Button size="sm" disabled={create.busy || !n.adviserName.trim() || !n.periodEnd} onClick={async () => { if (await create.run(n, "Form PF started")) setN({ adviserName: "", periodType: "annual", periodEnd: "" }); }}>Start Form PF</Button>
      </CardContent></Card>
      {d.filings.length === 0 ? <p className="text-sm text-muted-foreground">No Form PF records yet.</p> : d.filings.map((f: any) => <PfCard key={f.id} f={f} funds={d.funds} onChanged={refresh} />)}
    </div>
  );
}

function PfCard({ f, funds, onChanged }: { f: any; funds: { id: string; name: string }[]; onChanged: () => void }) {
  const c = f.current;
  const { busy, run } = useRun(useServerFn(saveFormPfFn), onChanged);
  const [v, setV] = useState({ crd: c?.crd ?? "", sec: c?.sec ?? "", size: c?.size ?? "smaller", dueDate: c?.dueDate ?? "", offeringIds: (c?.offeringIds ?? []) as string[], sections: (c?.sections ?? []) as string[], aum: c?.aumCents != null ? String(c.aumCents / 100) : "", filedOn: "", confirmation: "", note: "" });
  const status = (c?.status ?? "draft") as PfStatus;
  const editable = status === "draft";
  const send = (to: PfStatus, ok: string) => run({
    filingId: f.id, status: to, crd: v.crd || null, sec: v.sec || null, size: v.size as any, dueDate: v.dueDate || null, offeringIds: v.offeringIds, sections: v.sections,
    aumCents: v.aum ? Math.round(Number(v.aum) * 100) : null, filedOn: v.filedOn || null, confirmation: v.confirmation || null, note: v.note || null,
  }, ok);
  const toggle = (arr: string[], x: string) => (arr.includes(x) ? arr.filter((y) => y !== x) : [...arr, x]);
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="text-base">{f.adviserName} — {f.periodType === "annual" ? "Annual" : "Quarterly"}, period ending {fmt(f.periodEnd)}</CardTitle><Badge variant="secondary">{PF_STATUS_LABEL[status]}</Badge></div>
        {c?.dueDate && <CardDescription>Due {fmt(c.dueDate)}{c.dueIn != null && status !== "filed_by_adviser" ? (c.dueIn >= 0 ? ` (in ${c.dueIn} days)` : ` (${-c.dueIn} days ago)`) : ""}{c.confirmation ? ` · Filed ${fmt(c.filedOn)}, confirmation ${c.confirmation}` : ""}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid gap-2 sm:grid-cols-4">
          <div><Label className="text-xs">CRD number</Label><Input disabled={!editable} value={v.crd} onChange={(e) => setV({ ...v, crd: e.target.value })} /></div>
          <div><Label className="text-xs">SEC file number</Label><Input disabled={!editable} value={v.sec} onChange={(e) => setV({ ...v, sec: e.target.value })} /></div>
          <div><Label className="text-xs">Adviser size</Label><select disabled={!editable} className={sel} value={v.size} onChange={(e) => setV({ ...v, size: e.target.value })}>{ADVISER_SIZES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></div>
          <div><Label className="text-xs">Due date</Label><Input disabled={!editable} type="date" value={v.dueDate} onChange={(e) => setV({ ...v, dueDate: e.target.value })} /></div>
          <div><Label className="text-xs">Regulatory assets ($)</Label><Input disabled={!editable} inputMode="decimal" value={v.aum} onChange={(e) => setV({ ...v, aum: e.target.value })} /></div>
        </div>
        <div><Label className="text-xs">Sections required</Label><div className="flex flex-wrap gap-3">{PF_SECTIONS.map((s) => <label key={s} className="flex items-center gap-1"><input type="checkbox" disabled={!editable} checked={v.sections.includes(s)} onChange={() => setV({ ...v, sections: toggle(v.sections, s) })} />{s}</label>)}</div></div>
        <div><Label className="text-xs">Funds covered</Label><div className="flex max-h-40 flex-wrap gap-3 overflow-y-auto">{funds.map((x) => <label key={x.id} className="flex items-center gap-1"><input type="checkbox" disabled={!editable} checked={v.offeringIds.includes(x.id)} onChange={() => setV({ ...v, offeringIds: toggle(v.offeringIds, x.id) })} />{x.name}</label>)}</div></div>
        {status === "reviewed" && <div className="grid gap-2 sm:grid-cols-2">
          <div><Label className="text-xs">Date the adviser filed</Label><Input type="date" value={v.filedOn} onChange={(e) => setV({ ...v, filedOn: e.target.value })} /></div>
          <div><Label className="text-xs">Filing confirmation</Label><Input value={v.confirmation} onChange={(e) => setV({ ...v, confirmation: e.target.value })} /></div>
        </div>}
        {status !== "filed_by_adviser" && <>
          <div><Label className="text-xs">Note (optional)</Label><Input value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} /></div>
          <div className="flex flex-wrap gap-2">
            {editable && <Button size="sm" variant="outline" disabled={busy} onClick={() => send("draft", "Draft saved")}>Save draft</Button>}
            {pfNext(status).map((to) => <Button key={to} size="sm" variant={to === "draft" ? "outline" : "default"} disabled={busy} onClick={() => send(to, "Saved")}>{to === "draft" ? "Back to draft" : to === "ready_for_review" ? "Send for review" : to === "reviewed" ? "Approve review" : "Record as filed by adviser"}</Button>)}
          </div>
        </>}
        <details><summary className="cursor-pointer text-xs text-muted-foreground">History ({f.history.length})</summary>
          <ol className="mt-1 text-xs">{f.history.map((h: any) => <li key={h.version}>v{h.version} · {PF_STATUS_LABEL[h.status as PfStatus]} · {h.by} · {fmt(h.at)}{h.note ? ` — ${h.note}` : ""}</li>)}</ol>
        </details>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------ IRS records */

export function IrsRecordsPanel({ offeringId }: { offeringId?: string }) {
  const load = useServerFn(listIrsFn);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["irs-records", offeringId ?? "all"], queryFn: () => load({ data: offeringId ? { offeringId } : {} }) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["irs-records"] });
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const d: any = q.data;
  return (
    <div className="space-y-4">
      {d.canEdit && <NewIrs funds={d.funds} onChanged={refresh} />}
      {d.items.length === 0 ? <p className="text-sm text-muted-foreground">No IRS correspondence recorded.</p> : (
        <ul className="space-y-2">{d.items.map((r: any) => <IrsItem key={r.id} r={r} canEdit={d.canEdit} onChanged={refresh} />)}</ul>
      )}
    </div>
  );
}

function NewIrs({ funds, onChanged }: { funds: { id: string; name: string }[]; onChanged: () => void }) {
  const { busy, run } = useRun(useServerFn(recordIrsFn), onChanged);
  const [open, setOpen] = useState(false);
  const blank = { offeringId: "", direction: "received" as "received" | "sent" | "phone_call", noticeCode: "", subject: "", taxYear: "", formType: "", receivedOn: "", responseDue: "", shareWithManager: false, note: "" };
  const [f, setF] = useState(blank);
  const [file, setFile] = useState<File | null>(null);
  if (!open) return <Button size="sm" onClick={() => setOpen(true)}>Record IRS correspondence</Button>;
  const submit = async () => {
    let path: string | null = null;
    if (file) {
      path = `fund-setup-restricted/${f.offeringId}/irs/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
      const { error } = await supabase.storage.from("fund-formation").upload(path, file);
      if (error) { toast.error("The file couldn't be uploaded."); return; }
    }
    if (await run({ ...f, noticeCode: f.noticeCode || null, taxYear: f.taxYear ? Number(f.taxYear) : null, formType: f.formType || null, responseDue: f.responseDue || null, note: f.note || null, path }, "Recorded")) { setF(blank); setFile(null); setOpen(false); }
  };
  return (
    <Card><CardContent className="space-y-2 pt-4 text-sm">
      <div className="grid gap-2 sm:grid-cols-3">
        <div><Label className="text-xs">Fund</Label><select className={sel} value={f.offeringId} onChange={(e) => setF({ ...f, offeringId: e.target.value })}><option value="">Choose a Fund</option>{funds.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <div><Label className="text-xs">Type</Label><select className={sel} value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value as any })}><option value="received">Notice received</option><option value="sent">Letter sent</option><option value="phone_call">Phone call</option></select></div>
        <div><Label className="text-xs">Notice / letter number</Label><Input list="irs-notices" value={f.noticeCode} onChange={(e) => setF({ ...f, noticeCode: e.target.value })} /><datalist id="irs-notices">{IRS_NOTICE_SUGGESTIONS.map((s) => <option key={s} value={s} />)}</datalist></div>
        <div className="sm:col-span-3"><Label className="text-xs">Subject</Label><Input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></div>
        <div><Label className="text-xs">Tax year</Label><Input inputMode="numeric" value={f.taxYear} onChange={(e) => setF({ ...f, taxYear: e.target.value })} /></div>
        <div><Label className="text-xs">Form (e.g. 1065)</Label><Input value={f.formType} onChange={(e) => setF({ ...f, formType: e.target.value })} /></div>
        <div><Label className="text-xs">Date</Label><Input type="date" value={f.receivedOn} onChange={(e) => setF({ ...f, receivedOn: e.target.value })} /></div>
        <div><Label className="text-xs">Response due</Label><Input type="date" value={f.responseDue} onChange={(e) => setF({ ...f, responseDue: e.target.value })} /></div>
        <div className="sm:col-span-2"><Label className="text-xs">Copy (optional)</Label><Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
      </div>
      <div><Label className="text-xs">Note (Harmonious only)</Label><Textarea rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
      <label className="flex items-center gap-2"><input type="checkbox" checked={f.shareWithManager} onChange={(e) => setF({ ...f, shareWithManager: e.target.checked })} />Show this item to the Fund's managers (status and dates only)</label>
      <p className="text-xs text-muted-foreground">Never enter full SSNs or EINs. Records are permanent; status changes add a new entry.</p>
      <div className="flex gap-2"><Button size="sm" disabled={busy || !f.offeringId || !f.subject.trim() || !f.receivedOn} onClick={submit}>Save</Button><Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></div>
    </CardContent></Card>
  );
}

function IrsItem({ r, canEdit, onChanged }: { r: any; canEdit: boolean; onChanged: () => void }) {
  const { busy, run } = useRun(useServerFn(updateIrsStatusFn), onChanged);
  const [note, setNote] = useState("");
  const kind = r.direction === "received" ? "Notice" : r.direction === "sent" ? "Letter sent" : "Phone call";
  return (
    <li className="rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{r.fundName} · {kind}{r.noticeCode ? ` ${r.noticeCode}` : ""} — {r.subject}</span>
        <span className="flex gap-1">{r.dueIn != null && r.dueIn <= 7 && <Badge variant="destructive">{r.dueIn < 0 ? "Response past due" : `Due in ${r.dueIn} days`}</Badge>}<Badge variant="secondary">{IRS_STATUS_LABEL[r.status as IrsStatus]}</Badge></span>
      </div>
      <p className="text-xs text-muted-foreground">{fmt(r.receivedOn)}{r.taxYear ? ` · Tax year ${r.taxYear}` : ""}{r.formType ? ` · Form ${r.formType}` : ""}{r.responseDue ? ` · Response due ${fmt(r.responseDue)}` : ""}{canEdit && r.shareWithManager ? " · Shown to managers" : ""}{canEdit && r.hasDocument ? " · Copy on file" : ""}</p>
      {canEdit && <>
        <ol className="mt-1 text-xs text-muted-foreground">{r.history.map((h: any, i: number) => <li key={i}>{IRS_STATUS_LABEL[h.status as IrsStatus]} · {h.by} · {fmt(h.at)}{h.note ? ` — ${h.note}` : ""}</li>)}</ol>
        {r.status !== "closed" && <div className="mt-2 flex flex-wrap gap-2">
          <Input className="h-8 max-w-sm" placeholder="What happened" value={note} onChange={(e) => setNote(e.target.value)} />
          {r.status === "open" && <Button size="sm" variant="outline" disabled={busy} onClick={() => run({ id: r.id, status: "responded", note }, "Updated").then((ok) => ok && setNote(""))}>Mark responded</Button>}
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run({ id: r.id, status: "closed", note }, "Closed").then((ok) => ok && setNote(""))}>Close</Button>
        </div>}
      </>}
    </li>
  );
}

/* ------------------------------------------------------------ Manager panel */

export function ManagerTaxRecords() {
  const [fund, setFund] = useState("");
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Returns, K-1s and IRS notices</CardTitle><CardDescription>Prepared by Harmonious. Shown for your Funds only.</CardDescription></CardHeader>
      <CardContent className="space-y-6">
        <FundPicker value={fund} onChange={setFund} />
        {fund && <>
          <section className="space-y-2"><h4 className="text-sm font-semibold">Form 1065</h4><Form1065DetailPanel offeringId={fund} key={`r-${fund}`} /></section>
          <section className="space-y-2"><h4 className="text-sm font-semibold">K-1 status</h4><K1Inline offeringId={fund} /></section>
          <section className="space-y-2"><h4 className="text-sm font-semibold">IRS notices</h4><IrsRecordsPanel offeringId={fund} key={`i-${fund}`} /></section>
        </>}
      </CardContent>
    </Card>
  );
}
function K1Inline({ offeringId }: { offeringId: string }) {
  const load = useServerFn(k1HistoryFn);
  const q = useQuery({ queryKey: ["k1-history", offeringId], queryFn: () => load({ data: { offeringId } }) });
  const d: any = q.data;
  if (!d) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!d.chains.length) return <p className="text-sm text-muted-foreground">No K-1s yet.</p>;
  return <ul className="divide-y text-sm">{d.chains.map((c: any, i: number) => { const last = c.versions[c.versions.length - 1]; return <li key={i} className="flex justify-between py-1.5"><span>{c.investor} · {c.taxYear}</span><span className="text-muted-foreground">v{last.version} · {last.status}</span></li>; })}</ul>;
}
