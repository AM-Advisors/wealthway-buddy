import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { approveStarAnswer, getStar, importStarQuestions, recordStarEvent, saveStarAnswer } from "@/lib/compliance-star.functions";
import { StarChecklist, StarReferenceLibrary } from "@/components/compliance-star-kit";

const ANS: Record<string, string> = { yes: "Yes", no: "No", na: "Not applicable" };
const RESP: Record<string, string> = { csp: "Harmonious", csc: "Customer", shared: "Shared" };
const sel = "h-9 rounded-md border bg-background px-2 text-sm";

/** Finds the CAIQ question table in any sheet: needs "Question ID" and "Question" header cells. */
function parseCaiq(wb: XLSX.WorkBook) {
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[name]!, { header: 1, defval: "" });
    const h = rows.findIndex((r) => r.some((c) => /^question id$/i.test(String(c).trim())));
    if (h < 0) continue;
    const head = rows[h]!.map((c) => String(c).trim().toLowerCase());
    const qi = head.indexOf("question id"), qt = head.findIndex((c) => c === "question"), cc = head.findIndex((c) => /ccm control id/.test(c));
    if (qt < 0) continue;
    const out = rows.slice(h + 1).map((r) => ({ question_id: String(r[qi] ?? "").trim(), question: String(r[qt] ?? "").trim(), ccm_control_id: cc >= 0 ? String(r[cc] ?? "").trim() || null : null }))
      .filter((r) => /^[A-Z&]{2,4}-\d{2}(\.\d+)?$/i.test(r.question_id) && r.question);
    if (out.length) return out;
  }
  return [];
}

export function StarPanel() {
  const qc = useQueryClient();
  const get = useServerFn(getStar), imp = useServerFn(importStarQuestions), save = useServerFn(saveStarAnswer), approve = useServerFn(approveStarAnswer), rec = useServerFn(recordStarEvent);
  const q = useQuery({ queryKey: ["star"], queryFn: () => get() });
  const [domain, setDomain] = useState<string>("all");
  const [onlyGaps, setOnlyGaps] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<any>(null);
  const [owner, setOwner] = useState("");
  const [registry, setRegistry] = useState("");

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.success(ok); await qc.invalidateQueries({ queryKey: ["star"] }); return true; }
    catch (e) { toast.error(e instanceof Error ? e.message : "Something went wrong."); return false; }
  };

  const d = q.data;
  const stats = useMemo(() => {
    const by: Record<string, { total: number; answered: number; approved: number; gaps: number }> = {};
    for (const x of d?.questions ?? []) {
      const s = (by[x.domain_code] ??= { total: 0, answered: 0, approved: 0, gaps: 0 });
      s.total++; if (x.latest) s.answered++; if (x.latest?.status === "approved") s.approved++;
      if (!x.latest || x.latest.answer === "no") s.gaps++;
    }
    return by;
  }, [d]);

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error || !d) return <p className="text-sm text-destructive">{(q.error as Error)?.message ?? "Couldn't load."}</p>;

  const total = d.questions.length, approvedN = d.questions.filter((x: any) => x.latest?.status === "approved").length;
  const onFile = async (f: File) => {
    const rows = parseCaiq(XLSX.read(await f.arrayBuffer()));
    if (!rows.length) { toast.error("Couldn't find a \"Question ID\" / \"Question\" table in that file. Use the official CAIQ v4 spreadsheet."); return; }
    for (let i = 0; i < rows.length; i += 500) if (!(await act(() => imp({ data: { rows: rows.slice(i, i + 500) } }), `Loaded ${Math.min(i + 500, rows.length)} of ${rows.length} questions.`))) return;
  };
  const exportXlsx = () => {
    const rows = d.questions.map((x: any) => {
      const a = x.latest?.status === "approved" ? x.latest : null;
      return { "Question ID": x.question_id, Question: x.question, "CSP CAIQ Answer": a ? ANS[a.answer] : "", "SSRM Control Ownership": a ? ({ csp: "CSP-owned", csc: "CSC-owned", shared: "Shared CSP and CSC" } as any)[a.responsibility] : "", "CSP Implementation Description (Optional/Recommended)": a?.explanation ?? "", "CCM Control ID": x.ccm_control_id ?? "" };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "CAIQv4");
    XLSX.writeFile(wb, `Harmonious-CAIQ-v4-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  const startEdit = (x: any, fromSuggestion = false) => {
    const src = fromSuggestion ? { answer: x.suggestion.answer, responsibility: "csp", explanation: x.suggestion.note, control_keys: x.suggestion.control_keys, evidence_ids: x.suggestion.evidence_ids } : x.latest ?? { answer: "no", responsibility: "csp", explanation: "", control_keys: x.suggestion.control_keys, evidence_ids: [] };
    setForm({ ...src }); setEditing(x.question_id);
  };

  const shown = d.questions.filter((x: any) => (domain === "all" || x.domain_code === domain) && (!onlyGaps || !x.latest || x.latest.answer === "no"));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>CSA STAR Level 1 self-assessment</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">Answer the CSA Consensus Assessments Initiative Questionnaire (CAIQ v4), get each answer approved by a second person, export it, then upload it yourself to the <a className="underline" href="https://cloudsecurityalliance.org/star/submit" target="_blank" rel="noreferrer">STAR Registry</a>. Level 1 is a self-assessment, not a certification. Never describe it as "certified".</p>
          {total === 0 ? (
            <div className="rounded-md border border-dashed p-4">
              <p className="font-medium">Step 1: load the official questionnaire</p>
              <p className="text-muted-foreground">Download the CAIQ v4 spreadsheet from the <a className="underline" href="https://cloudsecurityalliance.org/artifacts/star-level-1-security-questionnaire-caiq-v4" target="_blank" rel="noreferrer">CSA site</a> (free account needed), then load it here.</p>
              {d.canEdit && <Input type="file" accept=".xlsx,.xls" className="mt-2 max-w-sm" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-4">
                <div className="min-w-60 flex-1"><Progress value={(approvedN / total) * 100} /><p className="mt-1 text-xs text-muted-foreground">{approvedN} of {total} answers approved ({Math.round((approvedN / total) * 100)}%)</p></div>
                <Button variant="outline" onClick={exportXlsx}>Export approved answers (CAIQ xlsx)</Button>
              </div>
              {approvedN < total && <p className="text-xs text-muted-foreground">Export includes approved answers only; unanswered rows stay blank.</p>}
            </>
          )}
          <div className="grid gap-2 sm:grid-cols-3">
            <div><p className="text-xs text-muted-foreground">Submission owner</p><p>{d.owner ?? "Not set"}</p>
              {d.canEdit && <div className="mt-1 flex gap-1"><Input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Name" /><Button size="sm" variant="outline" disabled={!owner} onClick={() => act(() => rec({ data: { action: "owner_set", value: owner } }), "Owner saved.")}>Set</Button></div>}</div>
            <div><p className="text-xs text-muted-foreground">Submitted to registry</p><p>{d.submittedOn ?? "Not yet"}</p>
              {d.canEdit && total > 0 && <Button size="sm" variant="outline" className="mt-1" onClick={() => act(() => rec({ data: { action: "submitted", value: new Date().toISOString().slice(0, 10) } }), "Recorded as submitted today.")}>I submitted it today</Button>}</div>
            <div><p className="text-xs text-muted-foreground">Registry listing</p>{d.registryUrl ? <a className="underline" href={d.registryUrl} target="_blank" rel="noreferrer">View listing</a> : <p>None yet</p>}
              {d.canEdit && <div className="mt-1 flex gap-1"><Input value={registry} onChange={(e) => setRegistry(e.target.value)} placeholder="https://cloudsecurityalliance.org/star/registry/…" /><Button size="sm" variant="outline" disabled={!registry} onClick={() => act(() => rec({ data: { action: "registry_url", value: registry } }), "Listing saved.")}>Save</Button></div>}</div>
          </div>
        </CardContent>
      </Card>

      <StarChecklist d={d} />
      <StarReferenceLibrary />

      <Card>
        <CardHeader><CardTitle>Areas (CCM v4)</CardTitle></CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {d.domains.map((dm: any) => { const s = stats[dm.code]; return (
            <button key={dm.code} onClick={() => setDomain(domain === dm.code ? "all" : dm.code)} className={`rounded-md border p-3 text-left text-sm hover:bg-muted ${domain === dm.code ? "border-primary" : ""}`}>
              <p className="font-medium">{dm.code} · {dm.title}</p>
              <p className="text-xs text-muted-foreground">{s ? `${s.approved}/${s.total} approved · ${s.gaps} gaps` : "No questions loaded"} · Controls: {dm.controls.length ? dm.controls.join(", ") : "none yet"}</p>
            </button>); })}
        </CardContent>
      </Card>

      {total > 0 && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>{domain === "all" ? "All questions" : domain} ({shown.length})</CardTitle>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyGaps} onChange={(e) => setOnlyGaps(e.target.checked)} /> Gaps only</label>
          </CardHeader>
          <CardContent className="space-y-3">
            {shown.slice(0, 200).map((x: any) => (
              <div key={x.question_id} className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p><span className="font-mono text-xs">{x.question_id}</span> {x.question}</p>
                  {x.latest ? <Badge variant={x.latest.status === "approved" ? "default" : "secondary"}>{ANS[x.latest.answer]} · {x.latest.status === "approved" ? "Approved" : "Draft"}</Badge> : <Badge variant="outline">Unanswered</Badge>}
                </div>
                {x.latest && editing !== x.question_id && <p className="mt-1 text-muted-foreground">{RESP[x.latest.responsibility]}: {x.latest.explanation}</p>}
                {!x.latest && <p className="mt-1 text-xs text-muted-foreground">Suggestion: {ANS[x.suggestion.answer]}. {x.suggestion.note}</p>}
                {editing === x.question_id ? (
                  <div className="mt-2 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <select className={sel} value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })}>{Object.entries(ANS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                      <select className={sel} value={form.responsibility} onChange={(e) => setForm({ ...form, responsibility: e.target.value })}>{Object.entries(RESP).map(([k, v]) => <option key={k} value={k}>Responsible: {v}</option>)}</select>
                    </div>
                    <Textarea value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} placeholder="How Harmonious meets this (facts only)" />
                    <p className="text-xs text-muted-foreground">Linked controls: {form.control_keys.join(", ") || "none"} · Evidence records: {form.evidence_ids.length}</p>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={async () => { if (await act(() => save({ data: { question_id: x.question_id, ...form } }), "Draft answer saved.")) setEditing(null); }}>Save draft</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : d.canEdit && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {!x.latest && <Button size="sm" variant="outline" onClick={() => startEdit(x, true)}>Use suggestion</Button>}
                    <Button size="sm" variant="outline" onClick={() => startEdit(x)}>{x.latest ? "Revise" : "Answer"}</Button>
                    {x.latest?.status === "draft" && <Button size="sm" onClick={() => act(() => approve({ data: { id: x.latest.id } }), "Answer approved.")}>Approve</Button>}
                  </div>
                )}
              </div>
            ))}
            {shown.length > 200 && <p className="text-xs text-muted-foreground">Showing the first 200. Pick an area above to narrow.</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
