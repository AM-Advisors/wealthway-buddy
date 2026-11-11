import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getQuoteFoundationOptions } from "@/lib/foundation-admin.functions";
import {
  FOUNDATION_COMPONENTS, FOUNDATION_ROLE_DISCLAIMER, componentByKey, foundationLineLabel, foundationServiceKey, priceFoundationLine,
  type ComponentKey, type FoundationLineInput,
} from "@/lib/foundation-admin-model";
import type { QuoteLineInput } from "@/lib/sales-model";
import { money } from "@/components/sales/sales-ui";

const CAPABILITY_LABEL = { partial: "Partly built", not_built: "Not built yet", blocked_by_existing_gate: "Blocked until foundation accounting is validated" } as const;
const lines = (v: string) => v.split("\n").map((s) => s.trim()).filter(Boolean);
const todayIso = () => new Date().toISOString().slice(0, 10);

/** Adds one Foundation Administration component to a quote draft. The server re-prices and re-checks everything. */
export function FoundationConfigurator({ clientId, rateCents, onAdd, onClose }: {
  clientId: string; rateCents: (serviceKey: string) => number | null; onAdd: (line: QuoteLineInput) => void; onClose: () => void;
}) {
  const optsFn = useServerFn(getQuoteFoundationOptions);
  const opts = useQuery({ queryKey: ["quote-foundations", clientId], queryFn: () => optsFn({ data: { clientId } }) });
  const [profileId, setProfileId] = useState<string>("");
  const [component, setComponent] = useState<ComponentKey>("onboarding_setup");
  const def = componentByKey(component)!;
  const [billing, setBilling] = useState<FoundationLineInput["billing"]>("one_time");
  const [price, setPrice] = useState("");
  const [reason, setReason] = useState("");
  const [optional, setOptional] = useState(false);
  const [start, setStart] = useState(todayIso());
  const [end, setEnd] = useState("");
  const [billStart, setBillStart] = useState(todayIso());
  const [scope, setScope] = useState("");
  const [deliverables, setDeliverables] = useState(def.deliverables.join("\n"));
  const [included, setIncluded] = useState(def.included.join("\n"));
  const [excluded, setExcluded] = useState(def.excluded.join("\n"));
  const [limits, setLimits] = useState<{ label: string; quantity: string; unit: string }[]>([]);

  const chooseComponent = (k: ComponentKey) => {
    const c = componentByKey(k)!;
    setComponent(k); setBilling(c.cadence === "one_time" ? "one_time" : "annual");
    setDeliverables(c.deliverables.join("\n")); setIncluded(c.included.join("\n")); setExcluded(c.excluded.join("\n"));
  };
  const foundation = opts.data?.foundations.find((f) => f.profileId === profileId) ?? null;
  const rate = rateCents(foundationServiceKey(component));
  const input: FoundationLineInput | null = foundation ? {
    component, foundationProfileId: foundation.profileId, clientEntityId: foundation.clientEntityId, billing,
    negotiatedUnitCents: price.trim() === "" ? null : Math.round(Number(price) * 100), negotiatedReason: reason.trim() || null, optional,
    limits: limits.filter((l) => l.label.trim() && l.unit.trim()).map((l) => ({ label: l.label.trim(), quantity: Number(l.quantity) || 0, unit: l.unit.trim() })),
    scope: scope.trim(), deliverables: lines(deliverables), included: lines(included), excluded: lines(excluded),
    serviceStartOn: start, serviceEndOn: end || null, billingStartOn: billStart,
  } : null;
  const priced = useMemo(() => (input ? priceFoundationLine(input, rate) : null), [JSON.stringify(input), rate]);

  if (opts.isLoading) return <p className="mt-2 text-sm text-muted-foreground">Loading foundations…</p>;
  if (opts.error) return <p className="mt-2 text-sm text-destructive">{(opts.error as Error).message}</p>;
  if (!opts.data?.enabled) return <p className="mt-2 text-sm text-muted-foreground">Foundation Administration is turned off.</p>;
  if (!opts.data.foundations.length) return <p className="mt-2 text-sm text-muted-foreground">This client has no foundation on file yet. Set one up from the client's Foundation tab in Operations first.</p>;

  return (
    <div className="mt-3 space-y-4 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-heading text-lg font-semibold">Foundation Administration</h3>
        <Badge variant="outline">Not released: drafts and internal approval only</Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label>Foundation</Label>
          <Select value={profileId} onValueChange={setProfileId}><SelectTrigger aria-label="Foundation"><SelectValue placeholder="Choose the foundation" /></SelectTrigger>
            <SelectContent>{opts.data.foundations.map((f) => <SelectItem key={f.profileId} value={f.profileId}>{f.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label>Service component</Label>
          <Select value={component} onValueChange={(v) => chooseComponent(v as ComponentKey)}><SelectTrigger aria-label="Service component"><SelectValue /></SelectTrigger>
            <SelectContent>{FOUNDATION_COMPONENTS.map((c) => <SelectItem key={c.key} value={c.key}>{c.name}</SelectItem>)}</SelectContent></Select></div>
      </div>
      <div className="rounded-md bg-muted/40 p-3 text-sm">
        <p className="font-medium">{def.name} · {CAPABILITY_LABEL[def.readiness.capability]}</p>
        <p className="mt-1 text-muted-foreground">{def.summary}</p>
        {def.readiness.missing.length > 0 && <p className="mt-1 text-muted-foreground">Still missing: {def.readiness.missing.join("; ")}.</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1"><Label>Billed</Label>
          <Select value={billing} onValueChange={(v) => setBilling(v as FoundationLineInput["billing"])}><SelectTrigger aria-label="Billing cadence"><SelectValue /></SelectTrigger>
            <SelectContent>{(def.cadence === "one_time" ? ["one_time"] : ["monthly", "quarterly", "annual"]).map((b) => <SelectItem key={b} value={b}>{b === "one_time" ? "Once" : b[0]!.toUpperCase() + b.slice(1)}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label htmlFor="fa-price">Price per bill ($)</Label><Input id="fa-price" inputMode="decimal" value={price} placeholder={rate ? String(rate / 100) : "Required"} onChange={(e) => setPrice(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="fa-start">Service starts</Label><Input id="fa-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="fa-bill">Billing starts</Label><Input id="fa-bill" type="date" value={billStart} onChange={(e) => setBillStart(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="fa-end">Service ends (optional)</Label><Input id="fa-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
        <label className="flex items-center gap-2 self-end text-sm"><Switch checked={optional} onCheckedChange={setOptional} aria-label="Optional component" />Optional component</label>
      </div>
      <p className="text-sm text-muted-foreground">{rate ? `Approved rate ${money(rate)}. A lower price needs a reason and executive approval.` : "No approved rate exists for this component. Enter the negotiated price and how it was set; a CEO or CRO must approve it."}</p>
      <div className="space-y-1"><Label htmlFor="fa-reason">How the price was set</Label><Textarea id="fa-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="fa-scope">Scope</Label><Textarea id="fa-scope" rows={3} value={scope} placeholder={def.summary} onChange={(e) => setScope(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="fa-deliv">Deliverables (one per line)</Label><Textarea id="fa-deliv" rows={3} value={deliverables} onChange={(e) => setDeliverables(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="fa-inc">Included (one per line)</Label><Textarea id="fa-inc" rows={3} value={included} onChange={(e) => setIncluded(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="fa-exc">Not included (one per line)</Label><Textarea id="fa-exc" rows={3} value={excluded} onChange={(e) => setExcluded(e.target.value)} /></div>
      </div>
      <div className="space-y-2">
        <Label>Service limits</Label>
        {limits.map((l, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_120px_160px_auto]">
            <Input aria-label="Limit" placeholder="For example, grants processed" value={l.label} onChange={(e) => setLimits(limits.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
            <Input aria-label="Quantity" inputMode="decimal" value={l.quantity} onChange={(e) => setLimits(limits.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))} />
            <Input aria-label="Per" placeholder="per year" value={l.unit} onChange={(e) => setLimits(limits.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))} />
            <Button variant="ghost" size="sm" onClick={() => setLimits(limits.filter((_, j) => j !== i))}>Remove</Button>
          </div>
        ))}
        {limits.length < 10 && <Button variant="outline" size="sm" onClick={() => setLimits([...limits, { label: "", quantity: "", unit: "per year" }])}>Add a limit</Button>}
      </div>
      <p className="text-xs text-muted-foreground">{FOUNDATION_ROLE_DISCLAIMER}</p>
      {priced && !priced.ok && <p className="text-sm text-destructive">{priced.problem}</p>}
      <div className="flex gap-2">
        <Button disabled={!input || !priced?.ok} onClick={() => {
          if (!input || !priced?.ok) return;
          onAdd({ serviceKey: foundationServiceKey(component), label: `${foundationLineLabel(input)} · ${foundation!.name}`, quantity: 1, unitCents: priced.pricing.unitCents, baselineUnitCents: priced.pricing.baselineUnitCents, billingFrequency: billing, firstBillOn: billStart, foundation: input, details: { scope: input.scope || def.summary, included: input.included, excluded: input.excluded } });
        }}>Add to quote</Button>
        <Button variant="ghost" onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}
