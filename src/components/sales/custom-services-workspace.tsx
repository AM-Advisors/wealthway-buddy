import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { SalesDealDocsTabs } from "@/components/sales-deal-docs-tabs";
import { Panel, money } from "@/components/sales/sales-ui";
import { CustomServiceForm } from "@/components/sales/custom-service-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { listCustomServices, releaseCustomService, retireCustomService, reviewCustomService, updateCustomServiceBuild } from "@/lib/custom-services.functions";
import { BUILD_STAGE_LABEL, BUILD_STAGES, CUSTOM_BILLING, CUSTOM_REVIEW_DECISIONS, CUSTOM_REVIEW_HINT, CUSTOM_REVIEW_LABEL, type BuildStage, type CustomReviewDecision } from "@/lib/custom-service-model";
import { categoryLabel } from "@/lib/service-catalog.functions";

const BILLED: Record<string, string> = { one_time: "One-time", monthly: "Monthly", quarterly: "Quarterly", annual: "Annual" };
const EVENT: Record<string, string> = { created: "Added", updated: "Edited", ai_drafted: "Drafted with AI", reviewed: "Decision recorded", reopened: "Sent back for review", retired: "Retired", build_updated: "Build progress", released: "Released to quotes", price_changed: "Standard price changed" };
const PER: Record<string, string> = { one_time: "one-time", monthly: "per month", quarterly: "per quarter", annual: "per year" };
type View = "pending" | "building" | "released" | "all" | "retired";

/** Shared list of Sales-written services plus the review queue. Server functions re-check every action. */
export function CustomServicesWorkspace({ service, hideTabs }: { service?: string | undefined; hideTabs?: boolean }) {
  const [view, setView] = useState<View>("pending");
  const [creating, setCreating] = useState(false);
  const load = useServerFn(listCustomServices);
  const q = useQuery({ queryKey: ["custom-services", view === "retired"], queryFn: () => load({ data: { includeRetired: view === "retired" } }) });
  const all = (q.data?.services ?? []) as any[];
  useEffect(() => {
    const s = all.find((x) => x.id === service);
    if (s) setView(s.reviewStatus === "pending" ? "pending" : s.releasedAt ? "released" : s.reviewStatus === "design_build" ? "building" : "all");
  }, [service, all.length]);
  const active = all.filter((s) => !s.archivedAt);
  const pending = active.filter((s) => s.reviewStatus === "pending");
  const building = active.filter((s) => s.reviewStatus === "design_build" && !s.releasedAt);
  const released = active.filter((s) => s.releasedAt);
  const shown = view === "retired" ? all.filter((s) => s.archivedAt) : view === "pending" ? pending : view === "building" ? building : view === "released" ? released : active;
  return (
    <div className="space-y-6">
      {!hideTabs && <SalesDealDocsTabs />}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-3xl">
          <h1 className="text-3xl">Custom services</h1>
          <p className="mt-1 text-base text-muted-foreground">Write a service that isn't on the rate card, by hand or with AI. Everyone in Sales can reuse it on quotes. The review team decides whether it needs design or build, belongs in an existing product, or isn't tech related. Services that need building are tracked here until they're ready, then the CEO or CRO sets a standard price and releases them to quotes.</p>
        </div>
        {q.data?.canCreate && !creating && <Button size="lg" onClick={() => setCreating(true)}>New custom service</Button>}
      </div>
      {creating && <Panel title="New custom service"><CustomServiceForm onCancel={() => setCreating(false)} onSaved={() => { setCreating(false); setView("pending"); q.refetch(); }} /></Panel>}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1" role="tablist" aria-label="Which services">
        {([["pending", `Waiting for review (${pending.length})`], ["building", `Being built (${building.length})`], ["released", `On quotes (${released.length})`], ["all", "All active"], ["retired", "Retired"]] as [View, string][]).map(([v, label]) => (
          <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`rounded-md px-3 py-1.5 text-sm ${view === v ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>
        ))}
      </div>
      {q.isLoading && <p className="text-muted-foreground">Loading…</p>}
      {q.data && !shown.length && <p className="rounded-lg border p-6 text-center text-muted-foreground">{view === "pending" ? "Nothing is waiting for review." : view === "building" ? "Nothing is being built. Services marked Needs design or build show up here." : view === "released" ? "No built services have been released to quotes yet." : "No custom services here yet."}</p>}
      <div className="space-y-4">
        {shown.map((s) => <ServiceCard key={s.id} s={s} canReview={!!q.data?.canReview} canRelease={!!q.data?.canRelease} highlight={s.id === service} onChanged={() => q.refetch()} />)}
      </div>
    </div>
  );
}

function ServiceCard({ s, canReview, canRelease, highlight, onChanged }: { s: any; canReview: boolean; canRelease: boolean; highlight: boolean; onChanged: () => void }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [deciding, setDeciding] = useState<CustomReviewDecision | null>(null);
  const [target, setTarget] = useState(s.productTarget ?? "");
  const [note, setNote] = useState("");
  const [retiring, setRetiring] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const reviewFn = useServerFn(reviewCustomService);
  const retireFn = useServerFn(retireCustomService);
  const done = () => { qc.invalidateQueries({ queryKey: ["quote-catalog"] }); onChanged(); };
  const review = useMutation({
    mutationFn: () => reviewFn({ data: { id: s.id, decision: deciding!, productTarget: deciding === "add_to_product" ? target : null, note: note || null, expectedUpdatedAt: s.updatedAt } }),
    onSuccess: () => { toast.success("Decision saved"); setDeciding(null); setNote(""); done(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const retire = useMutation({
    mutationFn: () => retireFn({ data: { id: s.id, reason: retiring ?? "" } }),
    onSuccess: () => { toast.success("Retired. Quotes that already have it keep it."); setRetiring(null); done(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const ref = (el: HTMLElement | null) => { if (el && highlight) el.scrollIntoView({ block: "center" }); };
  return (
    <section ref={ref} aria-label={s.name} className={`rounded-xl border bg-card p-5 ${highlight ? "ring-2 ring-primary" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl">{s.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{categoryLabel(s.category)} · {BILLED[s.billingFrequency] ?? s.billingFrequency}{s.suggestedPriceCents ? ` · suggested ${money(s.suggestedPriceCents)}` : ""} · written by {s.createdByName}, {new Date(s.createdAt).toLocaleDateString()}{s.quoteUses ? ` · on ${s.quoteUses} quote line${s.quoteUses === 1 ? "" : "s"}` : ""}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {s.archivedAt && <Badge variant="outline">Retired</Badge>}
          {s.writtenWith === "ai" && <Badge variant="outline">Drafted with AI</Badge>}
          {s.releasedAt && <Badge>On quotes · {money(s.listPriceCents)} {PER[s.listBilling] ?? ""}</Badge>}
          {!s.releasedAt && s.reviewStatus === "design_build" && s.buildStage && <Badge variant="secondary">{BUILD_STAGE_LABEL[s.buildStage as BuildStage]}</Badge>}
          <Badge variant={s.reviewStatus === "pending" ? "secondary" : "default"}>{CUSTOM_REVIEW_LABEL[s.reviewStatus as keyof typeof CUSTOM_REVIEW_LABEL]}</Badge>
        </div>
      </div>
      {editing ? <div className="mt-4"><CustomServiceForm reviewed={s.reviewStatus !== "pending"} initial={{ id: s.id, expectedUpdatedAt: s.updatedAt, name: s.name, category: s.category, summary: s.summary, included: s.included, excluded: s.excluded, billingFrequency: s.billingFrequency, suggestedPriceCents: s.suggestedPriceCents }} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); done(); }} /></div> : <>
        <p className="mt-3 whitespace-pre-wrap text-base">{s.summary}</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 text-sm">
          <div><p className="font-medium">Included</p>{s.included.length ? <ul className="mt-1 list-disc pl-5">{s.included.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul> : <p className="text-muted-foreground">Nothing listed</p>}</div>
          <div><p className="font-medium">Not included</p>{s.excluded.length ? <ul className="mt-1 list-disc pl-5">{s.excluded.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul> : <p className="text-muted-foreground">Nothing listed</p>}</div>
        </div>
      </>}
      {s.reviewStatus !== "pending" && <div className="mt-4 rounded-lg bg-muted/40 p-3 text-sm">
        <p><span className="font-medium">{CUSTOM_REVIEW_LABEL[s.reviewStatus as keyof typeof CUSTOM_REVIEW_LABEL]}</span>{s.productTarget ? `: ${s.productTarget}` : ""} · decided by {s.reviewedByName}{s.reviewedAt ? `, ${new Date(s.reviewedAt).toLocaleDateString()}` : ""}</p>
        {s.reviewNote && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{s.reviewNote}</p>}
      </div>}
      {s.reviewStatus === "design_build" && !s.archivedAt && !editing && <BuildAndRelease s={s} canReview={canReview} canRelease={canRelease} onChanged={done} />}
      {canReview && !s.archivedAt && !editing && !s.releasedAt && <div className="mt-4 rounded-lg border p-3">
        <p className="text-sm font-medium">{s.reviewStatus === "pending" ? "What is this service?" : "Change the decision"}</p>
        {s.reviewBlocker ? <p className="mt-1 text-sm text-muted-foreground">{s.reviewBlocker}</p> : <>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {CUSTOM_REVIEW_DECISIONS.map((d) => (
              <button key={d} type="button" aria-pressed={deciding === d} onClick={() => setDeciding(d)} className={`rounded-lg border p-3 text-left text-sm transition-colors ${deciding === d ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}>
                <span className="block font-medium">{CUSTOM_REVIEW_LABEL[d]}</span><span className="block text-xs text-muted-foreground">{CUSTOM_REVIEW_HINT[d]}</span>
              </button>
            ))}
          </div>
          {deciding && <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {deciding === "add_to_product" && <div className="space-y-1"><Label htmlFor={`t-${s.id}`}>Which product?</Label><Input id={`t-${s.id}`} value={target} maxLength={200} onChange={(e) => setTarget(e.target.value)} placeholder="e.g. Cap table, Fund administration" /></div>}
            <div className="space-y-1 sm:col-span-2"><Label htmlFor={`n-${s.id}`}>Note (optional)</Label><Textarea id={`n-${s.id}`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Next step, owner or anything Sales should know" /></div>
            <div className="flex gap-2 sm:col-span-2"><Button onClick={() => review.mutate()} disabled={review.isPending || (deciding === "add_to_product" && target.trim().length < 2)}>Save decision</Button><Button variant="ghost" onClick={() => setDeciding(null)}>Cancel</Button></div>
          </div>}
        </>}
      </div>}
      {retiring !== null && <div className="mt-4 flex flex-wrap items-end gap-2">
        <div className="min-w-64 flex-1 space-y-1 text-sm"><Label htmlFor={`r-${s.id}`}>Why retire it?</Label><Input id={`r-${s.id}`} autoFocus value={retiring} onChange={(e) => setRetiring(e.target.value)} /></div>
        <Button variant="destructive" disabled={retiring.trim().length < 5 || retire.isPending} onClick={() => retire.mutate()}>Retire</Button><Button variant="ghost" onClick={() => setRetiring(null)}>Keep it</Button>
      </div>}
      <div className="mt-4 flex flex-wrap gap-2">
        {s.canChange && !editing && retiring === null && <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Edit</Button>}
        {s.canChange && !editing && retiring === null && <Button variant="ghost" size="sm" onClick={() => setRetiring("")}>Retire</Button>}
        {s.history.length > 0 && <Button variant="ghost" size="sm" onClick={() => setShowHistory((v) => !v)}>{showHistory ? "Hide history" : "History"}</Button>}
      </div>
      {showHistory && <ul className="mt-2 space-y-1 text-xs text-muted-foreground">{s.history.map((h: any, i: number) => (
        <li key={i}>{new Date(h.at).toLocaleString()} · {EVENT[h.event] ?? h.event} by {h.actorName}{h.detail?.decision ? `: ${CUSTOM_REVIEW_LABEL[h.detail.decision as keyof typeof CUSTOM_REVIEW_LABEL] ?? h.detail.decision}` : ""}{h.detail?.reason ? `: ${h.detail.reason}` : ""}{h.detail?.stage ? `: ${BUILD_STAGE_LABEL[h.detail.stage as BuildStage] ?? h.detail.stage}` : ""}{h.detail?.listPriceCents ? `: ${money(h.detail.listPriceCents)} ${PER[h.detail.listBilling] ?? ""}` : ""}</li>
      ))}</ul>}
    </section>
  );
}

/** Build progress for a "Needs design or build" service, then release to quotes with a standard price (CEO or CRO). */
function BuildAndRelease({ s, canReview, canRelease, onChanged }: { s: any; canReview: boolean; canRelease: boolean; onChanged: () => void }) {
  const [stage, setStage] = useState<BuildStage | null>(null);
  const [buildNote, setBuildNote] = useState("");
  const [releasing, setReleasing] = useState(false);
  const [price, setPrice] = useState(s.listPriceCents ? String(s.listPriceCents / 100) : s.suggestedPriceCents ? String(s.suggestedPriceCents / 100) : "");
  const [billing, setBilling] = useState<string>(s.listBilling ?? s.billingFrequency ?? "one_time");
  const [releaseNote, setReleaseNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const buildFn = useServerFn(updateCustomServiceBuild);
  const releaseFn = useServerFn(releaseCustomService);
  const current: BuildStage = s.buildStage ?? "not_started";
  const at = BUILD_STAGES.indexOf(current);
  const saveBuild = useMutation({
    mutationFn: () => buildFn({ data: { id: s.id, stage: stage!, note: buildNote || null, expectedUpdatedAt: s.updatedAt } }),
    onSuccess: () => { toast.success(stage === "ready" ? "Marked ready. The CEO and CRO were told it can be released." : "Build progress saved"); setStage(null); setBuildNote(""); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const cents = Math.round((Number(price.replace(/[$,\s]/g, "")) || 0) * 100);
  const release = useMutation({
    mutationFn: () => releaseFn({ data: { id: s.id, listPriceCents: cents, listBilling: billing as any, note: releaseNote || null, expectedUpdatedAt: s.updatedAt } }),
    onSuccess: (r: any) => { toast.success(r?.released ? "Released. Sales can now add it to client quotes." : "Standard price updated for new quotes"); setReleasing(false); setConfirming(false); setReleaseNote(""); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="mt-4 space-y-3 rounded-lg border p-3">
      <div>
        <p className="text-sm font-medium">{s.releasedAt ? "Built and on quotes" : "Build progress"}</p>
        <ol className="mt-2 grid grid-cols-5 gap-1" aria-label="Build progress">
          {BUILD_STAGES.map((st, i) => (
            <li key={st} aria-current={st === current ? "step" : undefined} className={`rounded-md px-2 py-1.5 text-center text-xs ${i <= at || s.releasedAt ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{BUILD_STAGE_LABEL[st]}</li>
          ))}
        </ol>
        {(s.buildNote || s.buildUpdatedAt) && <p className="mt-2 text-sm text-muted-foreground">{s.buildNote}{s.buildUpdatedAt ? `${s.buildNote ? " · " : ""}updated by ${s.buildUpdatedByName}, ${new Date(s.buildUpdatedAt).toLocaleDateString()}` : ""}</p>}
      </div>

      {!s.releasedAt && canReview && !s.buildBlocker && <div className="space-y-2">
        <p className="text-sm">Where is the build now?</p>
        <div className="flex flex-wrap gap-2">
          {BUILD_STAGES.filter((st) => st !== current).map((st) => (
            <Button key={st} type="button" size="sm" variant={stage === st ? "default" : "outline"} aria-pressed={stage === st} onClick={() => setStage(st)}>{BUILD_STAGE_LABEL[st]}</Button>
          ))}
        </div>
        {stage && <div className="space-y-2">
          <Label htmlFor={`bn-${s.id}`}>Note (optional)</Label>
          <Textarea id={`bn-${s.id}`} rows={2} value={buildNote} onChange={(e) => setBuildNote(e.target.value)} placeholder="Who is building it, what's left, where it lives in the app" />
          {stage === "ready" && <p className="text-sm text-muted-foreground">Only mark it ready once the new screens or automation are live in the app and the team can deliver it.</p>}
          <div className="flex gap-2"><Button onClick={() => saveBuild.mutate()} disabled={saveBuild.isPending}>Save progress</Button><Button variant="ghost" onClick={() => setStage(null)}>Cancel</Button></div>
        </div>}
      </div>}

      {s.releasedAt && <p className="text-sm">Standard price <span className="font-medium">{money(s.listPriceCents)} {PER[s.listBilling] ?? ""}</span> · released by {s.releasedByName}, {new Date(s.releasedAt).toLocaleDateString()}. Quotes at or above this price with the same billing need no CEO or CRO approval; a lower price or other billing still does.</p>}
      {s.releaseNote && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{s.releaseNote}</p>}

      {current === "ready" && !s.releasedAt && !canRelease && <p className="text-sm text-muted-foreground">Ready. The CEO or CRO sets the standard price and releases it to quotes.</p>}
      {current === "ready" && canRelease && (s.releaseBlocker ? <p className="text-sm text-muted-foreground">{s.releaseBlocker}</p> : !releasing ? (
        <Button size={s.releasedAt ? "sm" : "lg"} variant={s.releasedAt ? "outline" : "default"} onClick={() => setReleasing(true)}>{s.releasedAt ? "Change standard price" : "Release to quotes"}</Button>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1"><Label htmlFor={`lp-${s.id}`}>Standard price ($)</Label><Input id={`lp-${s.id}`} inputMode="decimal" value={price} onChange={(e) => { setPrice(e.target.value); setConfirming(false); }} /></div>
          <div className="space-y-1"><Label htmlFor={`lb-${s.id}`}>Billed</Label>
            <select id={`lb-${s.id}`} className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={billing} onChange={(e) => { setBilling(e.target.value); setConfirming(false); }}>
              {CUSTOM_BILLING.map((b) => <option key={b} value={b}>{BILLED[b]}</option>)}
            </select></div>
          <div className="space-y-1 sm:col-span-3"><Label htmlFor={`rn-${s.id}`}>Note (optional)</Label><Textarea id={`rn-${s.id}`} rows={2} value={releaseNote} onChange={(e) => setReleaseNote(e.target.value)} placeholder="Anything Sales should know when quoting it" /></div>
          {confirming && <p className="rounded-md bg-muted/50 p-2 text-sm sm:col-span-3">{s.releasedAt ? `New quotes will use ${money(cents)} ${PER[billing]} as the standard price. Quotes already saved keep their prices.` : `Sales will be able to add "${s.name}" to client quotes at ${money(cents)} ${PER[billing]}. Its wording is then fixed; to change what it is, retire it and add a new one.`}</p>}
          <div className="flex gap-2 sm:col-span-3">
            {!confirming ? <Button disabled={cents <= 0} onClick={() => setConfirming(true)}>{s.releasedAt ? "Update price" : "Release to quotes"}</Button>
              : <Button disabled={release.isPending || cents <= 0} onClick={() => release.mutate()}>Confirm</Button>}
            <Button variant="ghost" onClick={() => { setReleasing(false); setConfirming(false); }}>Cancel</Button>
          </div>
        </div>
      ))}
    </div>
  );
}
