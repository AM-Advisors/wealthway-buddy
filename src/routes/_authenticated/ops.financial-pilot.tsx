import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PILOT_STATUS_LABELS,
  SECURITY_GATES,
  SIGNOFF_CONFIRMATIONS,
  SIGNOFF_ROLES,
  VARIANCE_CLASSES,
  type PilotStatus,
} from "@/lib/financial-pilot-model";
import {
  addOpeningBalanceFn,
  candidateFactorSuggestionFn,
  decidePilotFn,
  listPilotCandidatesFn,
  pilotReadinessFn,
  raiseVarianceFn,
  recordCandidateScoreFn,
  resolveVarianceFn,
  signOffPilotFn,
  startPilotEvaluationFn,
  transitionPilotFn,
} from "@/lib/financial-pilot.functions";

export const Route = createFileRoute("/_authenticated/ops/financial-pilot")({
  head: () => ({
    meta: [
      { title: "Financial pilot readiness - Harmonious operations" },
      { name: "description", content: "Evaluate and prepare one fund for a parallel accounting pilot without changing its official books." },
      { property: "og:title", content: "Financial pilot readiness - Harmonious operations" },
      { property: "og:description", content: "Parallel-mode pilot readiness, opening balances, variances and sign-off." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PilotPage,
});

const usd = (c: number | null | undefined) => (typeof c === "number" ? (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" }) : "-");
const toCents = (s: string) => Math.round(Number(s.replace(/[$,]/g, "")) * 100);
const err = (e: any) => toast.error(e?.message ?? "That didn't go through.");

function PilotPage() {
  const [fund, setFund] = useState<string | null>(null);
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Financial pilot readiness</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        One fund, parallel mode only. The fund's current accounting process stays the official record; Harmonious results are for comparison until a formal cutover decision. Nothing here migrates data, posts to the books or sends money.
      </p>
      <Card className="mt-4 border-amber-500/40">
        <CardHeader className="py-3"><CardTitle className="text-sm">Known security gates before any production cutover</CardTitle></CardHeader>
        <CardContent className="pb-3 text-sm text-muted-foreground"><ul className="list-disc pl-5">{SECURITY_GATES.map((g) => <li key={g}>{g}</li>)}</ul></CardContent>
      </Card>
      <Tabs defaultValue="candidates" className="mt-6">
        <TabsList>
          <TabsTrigger value="candidates">Candidates</TabsTrigger>
          <TabsTrigger value="pilot" disabled={!fund}>Selected fund</TabsTrigger>
        </TabsList>
        <TabsContent value="candidates" className="mt-4"><Candidates onOpen={setFund} /></TabsContent>
        <TabsContent value="pilot" className="mt-4">{fund ? <PilotFund offeringId={fund} /> : null}</TabsContent>
      </Tabs>
    </main>
  );
}

function Candidates({ onOpen }: { onOpen: (id: string) => void }) {
  const load = useServerFn(listPilotCandidatesFn);
  const { data, isLoading, error } = useQuery({ queryKey: ["pilot-candidates"], queryFn: () => load(), retry: false });
  const [scoring, setScoring] = useState<string | null>(null);
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading funds…</p>;
  if (error) return <p className="text-sm text-destructive">{(error as any).message}</p>;
  const rows = (data?.rows ?? []).filter((r) => !/\[QA\]/.test(r.name)).sort((a, b) => a.total - b.total);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Score candidates for complexity (lower is simpler). The lowest-scoring fund with no disqualifiers is recommended for review — it is never enrolled automatically.</p>
      {rows.map((r) => (
        <Card key={r.offeringId}>
          <CardContent className="flex flex-wrap items-center gap-2 py-3 text-sm">
            <span className="font-medium">{r.name}</span>
            {r.offeringId === data?.recommendedOfferingId ? <Badge>Recommended for review</Badge> : null}
            {r.scored ? <Badge variant="outline">Score {r.total}</Badge> : <Badge variant="secondary">Not scored</Badge>}
            {r.disqualifiers.map((d) => <Badge key={d} variant="destructive">{d}</Badge>)}
            {r.pilot ? <Badge variant="secondary">{PILOT_STATUS_LABELS[r.pilot.status as PilotStatus]}</Badge> : null}
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setScoring(scoring === r.offeringId ? null : r.offeringId)}>Score</Button>
              <Button size="sm" onClick={() => onOpen(r.offeringId)}>Readiness</Button>
            </div>
            {scoring === r.offeringId ? <ScoreForm offeringId={r.offeringId} onDone={() => setScoring(null)} /> : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

const NUM_FACTORS = [
  ["investorCount", "Investors"], ["investmentCount", "Investments"], ["monthlyTransactions", "Transactions / month"], ["bankAccountCount", "Bank accounts"],
  ["sideLetters", "Side letters"], ["waterfallTiers", "Waterfall tiers"], ["internationalInvestors", "International investors"], ["outstandingExceptions", "Outstanding exceptions"],
] as const;
const LVL_FACTORS = [["entityComplexity", "Entity complexity (0 simple – 3 feeder/blocker)"], ["taxComplexity", "Tax complexity (0–3)"], ["historicalCompleteness", "History completeness (3 = complete)"], ["dataQuality", "Data quality (3 = clean)"]] as const;
const BOOL_FACTORS = [["multiCurrency", "More than one currency"], ["hasFeederBlockerOrParallel", "Feeder / blocker / parallel"], ["unusualTaxAllocation", "Unusual tax allocation"], ["nextCloseIsQuarterOrYearEnd", "Next close is quarter or year-end"]] as const;

function ScoreForm({ offeringId, onDone }: { offeringId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const suggest = useServerFn(candidateFactorSuggestionFn);
  const save = useServerFn(recordCandidateScoreFn);
  const s = useQuery({ queryKey: ["pilot-suggest", offeringId], queryFn: () => suggest({ data: { offeringId } }) });
  const [f, setF] = useState<Record<string, any>>({ entityComplexity: 0, taxComplexity: 0, historicalCompleteness: 3, dataQuality: 3 });
  const v = (k: string) => f[k] ?? (s.data as any)?.[k] ?? (typeof (s.data as any)?.[k] === "boolean" ? false : 0);
  const m = useMutation({
    mutationFn: () => {
      const factors: any = {};
      for (const [k] of NUM_FACTORS) factors[k] = Number(v(k)) || 0;
      for (const [k] of LVL_FACTORS) factors[k] = Math.min(3, Math.max(0, Number(v(k)) || 0));
      for (const [k] of BOOL_FACTORS) factors[k] = Boolean(v(k));
      return save({ data: { offeringId, factors } });
    },
    onSuccess: (r: any) => { toast.success(`Scored ${r.total}${r.disqualifiers.length ? ` · ${r.disqualifiers.length} disqualifier(s)` : ""}`); qc.invalidateQueries({ queryKey: ["pilot-candidates"] }); onDone(); },
    onError: err,
  });
  return (
    <div className="mt-2 grid w-full gap-2 rounded-md border p-3 sm:grid-cols-2">
      <p className="text-xs text-muted-foreground sm:col-span-2">Counts are pre-filled from existing records where available; confirm or correct them.</p>
      {[...NUM_FACTORS, ...LVL_FACTORS].map(([k, label]) => (
        <label key={k} className="text-xs">{label}<Input type="number" min={0} value={v(k)} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>
      ))}
      {BOOL_FACTORS.map(([k, label]) => (
        <label key={k} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={Boolean(v(k))} onChange={(e) => setF({ ...f, [k]: e.target.checked })} />{label}</label>
      ))}
      <Button size="sm" className="sm:col-span-2" disabled={m.isPending} onClick={() => m.mutate()}>Save score</Button>
    </div>
  );
}

function PilotFund({ offeringId }: { offeringId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(pilotReadinessFn);
  const start = useServerFn(startPilotEvaluationFn);
  const move = useServerFn(transitionPilotFn);
  const { data, isLoading, error } = useQuery({ queryKey: ["pilot-readiness", offeringId], queryFn: () => load({ data: { offeringId } }), retry: false });
  const refresh = () => qc.invalidateQueries({ queryKey: ["pilot-readiness", offeringId] });
  const startM = useMutation({ mutationFn: () => start({ data: { offeringId } }), onSuccess: refresh, onError: err });
  const moveM = useMutation({ mutationFn: (x: any) => move({ data: x }), onSuccess: () => { toast.success("Updated"); refresh(); }, onError: err });
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading readiness…</p>;
  if (error) return <p className="text-sm text-destructive">{(error as any).message}</p>;
  if (!data) return null;
  const { readiness, pilot } = data;
  const levelText = { NOT_READY: "NOT READY", READY_WITH_EXCEPTIONS: "READY WITH EXCEPTIONS", READY_FOR_PARALLEL_PILOT: "READY FOR PARALLEL PILOT" }[readiness.level];
  const sections = [...new Set(readiness.items.map((i) => i.section))];
  const step = (to: string) => {
    const reason = window.prompt("Reason for this step:");
    if (!reason) return;
    let extra = {};
    if (to === "parallel_active") {
      const periodStart = window.prompt("Parallel period start (YYYY-MM-DD):") ?? "";
      const periodEnd = window.prompt("Parallel period end (YYYY-MM-DD):") ?? "";
      extra = { periodStart, periodEnd, periodLabel: periodStart.slice(0, 7) };
    }
    moveM.mutate({ pilotId: pilot!.id, to, reason, ...extra });
  };
  const next: Record<string, string[]> = {
    evaluating: ["selected"], selected: ["opening_data"], opening_data: ["parallel_active"], parallel_active: ["parallel_closed"],
    parallel_closed: ["parallel_passed"], continue_parallel: ["parallel_active"], requires_remediation: ["parallel_active"],
  };
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">Readiness</CardTitle>
            <Badge variant={readiness.level === "NOT_READY" ? "destructive" : readiness.level === "READY_WITH_EXCEPTIONS" ? "secondary" : "default"}>{levelText}</Badge>
            {pilot ? <Badge variant="outline">{PILOT_STATUS_LABELS[pilot.status as PilotStatus]} · Parallel mode · Official books: existing process</Badge> : null}
          </div>
          <CardDescription>Records existing is not enough: every critical item below must be satisfied from the fund's actual data.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {!pilot ? <Button size="sm" onClick={() => startM.mutate()}>Start evaluating this fund</Button> : null}
            {pilot ? (next[pilot.status] ?? []).map((to) => <Button key={to} size="sm" onClick={() => step(to)}>Move to {PILOT_STATUS_LABELS[to as PilotStatus]}</Button>) : null}
            {pilot && !["cutover_approved", "withdrawn"].includes(pilot.status) ? <Button size="sm" variant="ghost" onClick={() => step("withdrawn")}>Withdraw</Button> : null}
          </div>
          {sections.map((s) => (
            <div key={s}>
              <p className="text-sm font-medium">{s}</p>
              <ul className="mt-1 grid gap-1 text-sm sm:grid-cols-2">
                {readiness.items.filter((i) => i.section === s).map((i) => (
                  <li key={i.key} className="flex gap-2"><span className={i.ok ? "text-primary" : i.critical ? "text-destructive" : "text-muted-foreground"}>{i.ok ? "✓" : i.critical ? "✕" : "!"}</span><span>{i.label}<span className="text-muted-foreground"> — {i.detail}</span></span></li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>
      {pilot ? <Opening pilot={pilot} data={data} onChange={refresh} /> : null}
      {pilot ? <Variances pilot={pilot} rows={data.variances as any[]} onChange={refresh} /> : null}
      {pilot ? <Signoff pilot={pilot} signoffs={data.signoffs as any[]} decisions={data.decisions as any[]} onChange={refresh} /> : null}
    </div>
  );
}

const OPENING_CATS = ["trial_balance_debits", "trial_balance_credits", "cash", "investments_cost", "investments_fair_value", "commitments", "called_capital", "uncalled_capital", "investor_capital", "liabilities", "accrued_expenses", "management_fee_balance", "prior_distributions", "nav_equity", "other"];

function Opening({ pilot, data, onChange }: { pilot: any; data: any; onChange: () => void }) {
  const add = useServerFn(addOpeningBalanceFn);
  const raise = useServerFn(raiseVarianceFn);
  const [cat, setCat] = useState(OPENING_CATS[0]!);
  const [amt, setAmt] = useState("");
  const [src, setSrc] = useState("");
  const m = useMutation({ mutationFn: () => add({ data: { pilotId: pilot.id, category: cat, officialCents: toCents(amt), sourceDocument: src } }), onSuccess: () => { toast.success("Recorded"); setAmt(""); onChange(); }, onError: err });
  const ex = useMutation({
    mutationFn: (c: any) => raise({ data: { pilotId: pilot.id, kind: "migration_exception", periodLabel: "opening", metric: c.metric, officialCents: c.official, harmoniousCents: c.harmonious, source: "Opening balance reconciliation" } }),
    onSuccess: () => { toast.success("Migration exception raised"); onChange(); }, onError: err,
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Opening balances</CardTitle><CardDescription>Enter the official opening figures with their source document. Differences become migration exceptions — never plugs.</CardDescription></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-2">
          <select className="rounded-md border bg-background px-2 text-sm" value={cat} onChange={(e) => setCat(e.target.value)}>{OPENING_CATS.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}</select>
          <Input className="w-36" placeholder="Amount" value={amt} onChange={(e) => setAmt(e.target.value)} />
          <Input className="w-64" placeholder="Source document (e.g. Prior TB 2026-09)" value={src} onChange={(e) => setSrc(e.target.value)} />
          <Button size="sm" disabled={!amt || src.length < 3 || m.isPending} onClick={() => m.mutate()}>Record</Button>
        </div>
        {data.opening ? (
          <table className="w-full text-sm"><thead><tr className="text-left text-muted-foreground"><th>Check</th><th>Official</th><th>Harmonious</th><th></th></tr></thead><tbody>
            {data.opening.checks.map((c: any) => (
              <tr key={c.metric}><td>{c.metric}</td><td>{usd(c.official)}</td><td>{usd(c.harmonious)}</td><td>{c.ok ? "Ties" : <Button size="sm" variant="outline" onClick={() => ex.mutate(c)}>Raise exception</Button>}</td></tr>
            ))}
          </tbody></table>
        ) : <p className="text-muted-foreground">No opening balances recorded yet.</p>}
      </CardContent>
    </Card>
  );
}

function Variances({ pilot, rows, onChange }: { pilot: any; rows: any[]; onChange: () => void }) {
  const raise = useServerFn(raiseVarianceFn);
  const resolve = useServerFn(resolveVarianceFn);
  const [f, setF] = useState({ metric: "", official: "", harmonious: "", source: "", component: "" });
  const r = useMutation({ mutationFn: () => raise({ data: { pilotId: pilot.id, kind: "variance", periodLabel: pilot.period_label ?? "parallel", metric: f.metric, component: f.component || null, officialCents: toCents(f.official), harmoniousCents: toCents(f.harmonious), source: f.source } }), onSuccess: () => { toast.success("Variance recorded"); onChange(); }, onError: err });
  const res = useMutation({ mutationFn: (x: any) => resolve({ data: x }), onSuccess: () => { toast.success("Closed"); onChange(); }, onError: err });
  const close = (v: any, status: "resolved" | "accepted") => {
    const classification = window.prompt(`Classification (${VARIANCE_CLASSES.join(", ")}):`, v.classification);
    if (!classification) return;
    const resolution = window.prompt("Resolution (what caused it and how it was fixed):");
    if (resolution) res.mutate({ varianceId: v.id, status, classification, resolution });
  };
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Variance register</CardTitle><CardDescription>Official vs Harmonious, at fund or investor-component level. Trial balance, allocations vs NAV, call and distribution allocations, and cash vs bank must tie exactly.</CardDescription></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-2">
          <Input className="w-44" placeholder="Metric (e.g. cash_vs_bank)" value={f.metric} onChange={(e) => setF({ ...f, metric: e.target.value })} />
          <Input className="w-32" placeholder="Component" value={f.component} onChange={(e) => setF({ ...f, component: e.target.value })} />
          <Input className="w-32" placeholder="Official" value={f.official} onChange={(e) => setF({ ...f, official: e.target.value })} />
          <Input className="w-32" placeholder="Harmonious" value={f.harmonious} onChange={(e) => setF({ ...f, harmonious: e.target.value })} />
          <Input className="w-48" placeholder="Source" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} />
          <Button size="sm" disabled={!f.metric || !f.source || r.isPending} onClick={() => r.mutate()}>Record</Button>
        </div>
        {rows.length === 0 ? <p className="text-muted-foreground">No variances recorded.</p> : (
          <ul className="space-y-1">{rows.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-2">
              <Badge variant={v.status === "open" ? "destructive" : "secondary"}>{v.status}</Badge>
              {v.kind === "migration_exception" ? <Badge variant="outline">migration</Badge> : null}
              {v.structural ? <Badge variant="outline">structural</Badge> : null}
              <span>{v.metric}{v.component ? ` · ${v.component}` : ""}: official {usd(v.official_cents)}, Harmonious {usd(v.harmonious_cents)}, variance {usd(v.variance_cents)}</span>
              <span className="text-muted-foreground">{v.classification.replace(/_/g, " ")}</span>
              {v.status === "open" ? <><Button size="sm" variant="outline" onClick={() => close(v, "resolved")}>Resolve</Button>{!v.structural ? <Button size="sm" variant="ghost" onClick={() => close(v, "accepted")}>Accept</Button> : null}</> : null}
            </li>
          ))}</ul>
        )}
      </CardContent>
    </Card>
  );
}

function Signoff({ pilot, signoffs, decisions, onChange }: { pilot: any; signoffs: any[]; decisions: any[]; onChange: () => void }) {
  const sign = useServerFn(signOffPilotFn);
  const decide = useServerFn(decidePilotFn);
  const [conf, setConf] = useState<Record<string, boolean>>({});
  const s = useMutation({ mutationFn: (role: any) => sign({ data: { pilotId: pilot.id, role, confirmations: conf } }), onSuccess: () => { toast.success("Signed"); onChange(); }, onError: err });
  const d = useMutation({ mutationFn: (decision: any) => decide({ data: { pilotId: pilot.id, decision, reason: window.prompt("Reason for this decision:") ?? "" } }), onSuccess: () => { toast.success("Decision recorded. No automatic cutover."); onChange(); }, onError: err });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Pilot sign-off and decision</CardTitle><CardDescription>Four different people sign after the parallel close. A cutover approval is recorded only — Harmonious does not become the official books automatically.</CardDescription></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid gap-1 sm:grid-cols-3">{SIGNOFF_CONFIRMATIONS.map((k) => <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={Boolean(conf[k])} onChange={(e) => setConf({ ...conf, [k]: e.target.checked })} />{k.replace(/_/g, " ")}</label>)}</div>
        <div className="flex flex-wrap gap-2">{SIGNOFF_ROLES.map((r) => {
          const done = signoffs.find((x) => x.role_key === r);
          return <Button key={r} size="sm" variant={done ? "secondary" : "outline"} disabled={Boolean(done) || pilot.status !== "parallel_closed"} onClick={() => s.mutate(r)}>{done ? `${r.replace(/_/g, " ")} signed` : `Sign as ${r.replace(/_/g, " ")}`}</Button>;
        })}</div>
        {pilot.status === "parallel_passed" ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => d.mutate("continue_parallel")}>Continue parallel</Button>
            <Button size="sm" onClick={() => d.mutate("approve_production_cutover")}>Approve production cutover (decision only)</Button>
            <Button size="sm" variant="ghost" onClick={() => d.mutate("requires_remediation")}>Requires remediation</Button>
          </div>
        ) : null}
        {decisions.map((x) => <p key={x.id} className="text-muted-foreground">{x.decision.replace(/_/g, " ")} — {x.reason}</p>)}
      </CardContent>
    </Card>
  );
}
