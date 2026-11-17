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
import { listCustomServices, retireCustomService, reviewCustomService } from "@/lib/custom-services.functions";
import { CUSTOM_REVIEW_DECISIONS, CUSTOM_REVIEW_HINT, CUSTOM_REVIEW_LABEL, type CustomReviewDecision } from "@/lib/custom-service-model";
import { categoryLabel } from "@/lib/service-catalog.functions";

const BILLED: Record<string, string> = { one_time: "One-time", monthly: "Monthly", quarterly: "Quarterly", annual: "Annual" };
const EVENT: Record<string, string> = { created: "Added", updated: "Edited", ai_drafted: "Drafted with AI", reviewed: "Decision recorded", reopened: "Sent back for review", retired: "Retired" };
type View = "pending" | "all" | "retired";

/** Shared list of Sales-written services plus the review queue. Server functions re-check every action. */
export function CustomServicesWorkspace({ service, hideTabs }: { service?: string | undefined; hideTabs?: boolean }) {
  const [view, setView] = useState<View>("pending");
  const [creating, setCreating] = useState(false);
  const load = useServerFn(listCustomServices);
  const q = useQuery({ queryKey: ["custom-services", view === "retired"], queryFn: () => load({ data: { includeRetired: view === "retired" } }) });
  const all = (q.data?.services ?? []) as any[];
  useEffect(() => { if (service && all.some((s) => s.id === service)) setView(all.find((s) => s.id === service)?.reviewStatus === "pending" ? "pending" : "all"); }, [service, all.length]);
  const pending = all.filter((s) => !s.archivedAt && s.reviewStatus === "pending");
  const shown = view === "retired" ? all.filter((s) => s.archivedAt) : view === "pending" ? pending : all.filter((s) => !s.archivedAt);
  return (
    <div className="space-y-6">
      {!hideTabs && <SalesDealDocsTabs />}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-3xl">
          <h1 className="text-3xl">Custom services</h1>
          <p className="mt-1 text-base text-muted-foreground">Write a service that isn't on the rate card, by hand or with AI. Everyone in Sales can reuse it on quotes. The review team decides whether it needs design or build, belongs in an existing product, or isn't tech related.</p>
        </div>
        {q.data?.canCreate && !creating && <Button size="lg" onClick={() => setCreating(true)}>New custom service</Button>}
      </div>
      {creating && <Panel title="New custom service"><CustomServiceForm onCancel={() => setCreating(false)} onSaved={() => { setCreating(false); setView("pending"); q.refetch(); }} /></Panel>}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1" role="tablist" aria-label="Which services">
        {([["pending", `Waiting for review (${pending.length})`], ["all", "All active"], ["retired", "Retired"]] as [View, string][]).map(([v, label]) => (
          <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`rounded-md px-3 py-1.5 text-sm ${view === v ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>
        ))}
      </div>
      {q.isLoading && <p className="text-muted-foreground">Loading…</p>}
      {q.data && !shown.length && <p className="rounded-lg border p-6 text-center text-muted-foreground">{view === "pending" ? "Nothing is waiting for review." : "No custom services here yet."}</p>}
      <div className="space-y-4">
        {shown.map((s) => <ServiceCard key={s.id} s={s} canReview={!!q.data?.canReview} highlight={s.id === service} onChanged={() => q.refetch()} />)}
      </div>
    </div>
  );
}

function ServiceCard({ s, canReview, highlight, onChanged }: { s: any; canReview: boolean; highlight: boolean; onChanged: () => void }) {
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
      {canReview && !s.archivedAt && !editing && <div className="mt-4 rounded-lg border p-3">
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
        <li key={i}>{new Date(h.at).toLocaleString()} · {EVENT[h.event] ?? h.event} by {h.actorName}{h.detail?.decision ? `: ${CUSTOM_REVIEW_LABEL[h.detail.decision as keyof typeof CUSTOM_REVIEW_LABEL] ?? h.detail.decision}` : ""}{h.detail?.reason ? `: ${h.detail.reason}` : ""}</li>
      ))}</ul>}
    </section>
  );
}
