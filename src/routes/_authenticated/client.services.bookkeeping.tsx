import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { getBookkeepingChooser, requestBookkeeping } from "@/lib/bookkeeping-request.functions";
import {
  ADDONS, BOOKKEEPING_OPTIONS, CHARGED_LABELS, FREQUENCY_LABELS, OPTION_KEYS, SUPPORT_LEVELS,
  coverageConflicts, optionAvailableFor, responsibilityRows, supportDescription, visibleCapabilities,
  type AddonKey, type BookkeepingOption, type ServiceFrequency,
} from "@/lib/bookkeeping-options";
import type { ServiceLevel } from "@/lib/service-level";

export const Route = createFileRoute("/_authenticated/client/services/bookkeeping")({
  head: () => ({
    meta: [
      { title: "Bookkeeping options · Harmonious" },
      { name: "description", content: "Compare Self-Service, Bookkeeping Review and Managed Bookkeeping, see who does what, and request the right option for each entity." },
      { property: "og:title", content: "Bookkeeping options · Harmonious" },
      { property: "og:description", content: "Choose how your books are kept: by your team, reviewed by Harmonious, or fully managed." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BookkeepingChooser,
});

const OWNER_LABEL = { client: "Your team", harmonious: "Harmonious", not_included: "Not included" } as const;
const today = () => new Date().toISOString().slice(0, 10);

function BookkeepingChooser() {
  const load = useServerFn(getBookkeepingChooser);
  const submit = useServerFn(requestBookkeeping);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["bookkeeping-chooser"], queryFn: () => load() });
  const [entityId, setEntityId] = useState<string>("");
  const [option, setOption] = useState<BookkeepingOption | null>(null);
  const [frequency, setFrequency] = useState<ServiceFrequency | null>(null);
  const [support, setSupport] = useState<ServiceLevel>("self_serve");
  const [billing, setBilling] = useState<ServiceFrequency>("quarterly");
  const [addons, setAddons] = useState<AddonKey[]>([]);
  const [method, setMethod] = useState<"cash" | "accrual">("cash");
  const [accounts, setAccounts] = useState(1);
  const [transactions, setTransactions] = useState(50);
  const [startOn, setStartOn] = useState(today());
  const [notes, setNotes] = useState("");
  const [sent, setSent] = useState<string | null>(null);

  const entities = q.data?.entities ?? [];
  const entity = entities.find((e) => e.id === entityId) ?? null;
  const conflict = useMemo(() => entity && option ? coverageConflicts({ option, effectiveOn: startOn || today(), termMonths: 12 }, entity.coverage) : null, [entity, option, startOn]);
  const m = useMutation({
    mutationFn: () => submit({ data: { entityId, option: option!, frequency, supportLevel: support, billing, addons, accountingMethod: method, financialAccounts: accounts, monthlyTransactions: transactions, startOn, notes } }),
    onSuccess: (r) => { setSent(r.id); void qc.invalidateQueries({ queryKey: ["bookkeeping-chooser"] }); void qc.invalidateQueries({ queryKey: ["my-services"] }); toast.success("Request sent. Harmonious will confirm scope and pricing before anything starts."); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <Skeleton className="h-96 w-full" />;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;

  const pick = (k: BookkeepingOption) => { setOption(k); setFrequency(BOOKKEEPING_OPTIONS[k].defaultFrequency); };

  return (
    <div className="space-y-8">
      <div>
        <Link to="/client/services" className="text-sm text-muted-foreground hover:underline">← Your services</Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Bookkeeping</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Choose how the books are kept for each legal entity. Fund-level accounting (NAV, investor capital accounts, fees and carried interest) is part of Fund Accounting under your fund administration agreement, not Bookkeeping.</p>
      </div>

      <section className="space-y-2" aria-labelledby="bk-entity">
        <h2 id="bk-entity" className="text-lg font-semibold">1. Which entity?</h2>
        {entities.length === 0 ? (
          <p className="text-sm text-muted-foreground">No entities are on file yet. <Link to="/client/services/request" className="text-primary underline">Add a company, GP or management company</Link> first.</p>
        ) : (
          <Select value={entityId} onValueChange={(v) => { setEntityId(v); setSent(null); }}>
            <SelectTrigger className="max-w-md" aria-label="Entity"><SelectValue placeholder="Choose an entity" /></SelectTrigger>
            <SelectContent>{entities.map((e) => <SelectItem key={e.id} value={e.id}>{e.legalName}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {entity && entity.coverage.length > 0 && (
          <div className="max-w-3xl rounded-lg border p-4 text-sm">
            <p className="font-medium">Already in place for {entity.legalName}</p>
            <ul className="mt-1 space-y-1 text-muted-foreground">{entity.coverage.map((c, i) => <li key={i}>{c.label}: {c.scope.map((s) => CHARGED_LABELS[s]).join(", ")}</li>)}</ul>
            <p className="mt-2 text-muted-foreground">Anything already covered won't be charged again.</p>
          </div>
        )}
        {entity?.fundAccounting && (
          <div className="max-w-3xl rounded-lg border p-4 text-sm">
            <p className="font-medium">Fund Accounting for this fund</p>
            <ul className="mt-1 grid gap-1 sm:grid-cols-2">{entity.fundAccounting.map((s) => <li key={s.key}>{s.included ? "✓" : "·"} {s.label}<span className="text-muted-foreground">{s.included ? " · included" : " · not included"}</span></li>)}</ul>
          </div>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="bk-options">
        <h2 id="bk-options" className="text-lg font-semibold">2. Choose an option</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {OPTION_KEYS.map((k) => {
            const def = BOOKKEEPING_OPTIONS[k];
            const avail = entity ? optionAvailableFor(k, entity) : { available: true, reason: null };
            const caps = visibleCapabilities(k, entity ?? { entityType: "fund", offeringId: null });
            const selected = option === k;
            return (
              <article key={k} className={`flex flex-col rounded-xl border bg-card p-5 ${selected ? "border-primary ring-2 ring-primary/30" : ""}`}>
                <h3 className="text-lg font-semibold">{def.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{def.description}</p>
                <p className="mt-3 text-sm font-medium">Price: <span className="font-normal">Request a quote</span></p>
                <h4 className="mt-4 text-sm font-semibold">Included</h4>
                {caps.length ? <ul className="mt-1 space-y-1 text-sm">{caps.map((c) => <li key={c.key}>✓ {c.label}<span className="block text-xs text-muted-foreground">{c.note}</span></li>)}</ul>
                  : <p className="mt-1 text-sm text-muted-foreground">Nothing is available for this entity type yet.</p>}
                <h4 className="mt-4 text-sm font-semibold">Who does what</h4>
                <table className="mt-1 w-full text-sm"><tbody>{responsibilityRows(k).map((r) => (
                  <tr key={r.activity} className="border-b last:border-0"><td className="py-1 pr-2">{r.label}</td><td className={`py-1 text-right ${r.owner === "harmonious" ? "font-medium" : "text-muted-foreground"}`}>{OWNER_LABEL[r.owner]}</td></tr>
                ))}</tbody></table>
                <p className="mt-3 text-xs text-muted-foreground">{k === "self_service" ? "No review or close schedule from Harmonious." : k === "review" ? "Reviews monthly, quarterly or annually, as you choose." : "Monthly close by default; quarterly also available."}</p>
                {def.disclaimer && <p className="mt-3 rounded-md bg-muted p-2 text-xs">{def.disclaimer}</p>}
                <div className="mt-auto pt-4">
                  {avail.available ? <Button className="w-full" variant={selected ? "default" : "outline"} onClick={() => pick(k)}>{selected ? "Selected" : `Choose ${def.shortName}`}</Button>
                    : <p className="text-xs text-muted-foreground">{avail.reason}</p>}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {option && entity && (
        <section className="max-w-3xl space-y-4" aria-labelledby="bk-details">
          <h2 id="bk-details" className="text-lg font-semibold">3. Details</h2>
          <p className="text-sm text-muted-foreground">These are separate choices: how often Harmonious works on your books, how quickly we respond, and how often you're billed.</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1"><Label>{option === "managed" ? "How often we close your books" : "How often we review"}</Label>
              {BOOKKEEPING_OPTIONS[option].frequencies.length === 0 ? <p className="pt-2 text-sm text-muted-foreground">Not applicable: your team keeps the books.</p>
                : <Select value={frequency ?? ""} onValueChange={(v) => setFrequency(v as ServiceFrequency)}><SelectTrigger aria-label="Service frequency"><SelectValue /></SelectTrigger><SelectContent>{BOOKKEEPING_OPTIONS[option].frequencies.map((f) => <SelectItem key={f} value={f}>{FREQUENCY_LABELS[f]}</SelectItem>)}</SelectContent></Select>}</div>
            <div className="space-y-1"><Label>Support level</Label><Select value={support} onValueChange={(v) => setSupport(v as ServiceLevel)}><SelectTrigger aria-label="Support level"><SelectValue /></SelectTrigger><SelectContent>{SUPPORT_LEVELS.map((l) => <SelectItem key={l.key} value={l.key}>{l.name}{l.included ? "" : " (additional cost)"}</SelectItem>)}</SelectContent></Select>
              <p className="text-xs text-muted-foreground">{supportDescription(option, support).detail}</p></div>
            <div className="space-y-1"><Label>Billing</Label><Select value={billing} onValueChange={(v) => setBilling(v as ServiceFrequency)}><SelectTrigger aria-label="Billing frequency"><SelectValue /></SelectTrigger><SelectContent>{(["monthly", "quarterly", "annual"] as const).map((f) => <SelectItem key={f} value={f}>{FREQUENCY_LABELS[f]}</SelectItem>)}</SelectContent></Select>
              <p className="text-xs text-muted-foreground">Separate from how often work is done.</p></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="space-y-1"><Label htmlFor="bk-accounts">Bank and credit accounts</Label><Input id="bk-accounts" type="number" min={0} value={accounts} onChange={(e) => setAccounts(Math.max(0, Number(e.target.value)))} /></div>
            <div className="space-y-1"><Label htmlFor="bk-tx">Transactions per month</Label><Input id="bk-tx" type="number" min={0} value={transactions} onChange={(e) => setTransactions(Math.max(0, Number(e.target.value)))} /></div>
            <div className="space-y-1"><Label>Accounting basis</Label><Select value={method} onValueChange={(v) => setMethod(v as "cash" | "accrual")}><SelectTrigger aria-label="Accounting basis"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="accrual">Accrual</SelectItem></SelectContent></Select></div>
            <div className="space-y-1"><Label htmlFor="bk-start">Start</Label><Input id="bk-start" type="date" value={startOn} onChange={(e) => setStartOn(e.target.value)} /></div>
          </div>
          <div className="space-y-2"><Label>Add-ons (each is quoted separately)</Label>
            <div className="grid gap-2 sm:grid-cols-2">{ADDONS.map((a) => (
              <label key={a.key} className="flex items-start gap-2 rounded-md border p-3 text-sm">
                <Checkbox checked={addons.includes(a.key)} onCheckedChange={(v) => setAddons(v ? [...addons, a.key] : addons.filter((x) => x !== a.key))} className="mt-0.5" />
                <span><span className="font-medium">{a.name}</span> <Badge variant="outline" className="ml-1">Request a quote</Badge><span className="block text-muted-foreground">{a.description}</span></span>
              </label>
            ))}</div></div>
          <div className="space-y-1"><Label htmlFor="bk-notes">Anything else we should know?</Label><Textarea id="bk-notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          {conflict && conflict.duplicates.length > 0 && !conflict.blocked && <p className="text-sm">Already covered and excluded from your quote: {conflict.covered.map((s) => CHARGED_LABELS[s]).join(", ")}.</p>}
          {conflict?.blocked && <p role="alert" className="text-sm text-destructive">{conflict.reason}</p>}
          {sent ? <p className="text-sm">Request sent. <Link to="/client/services/requests/$requestId" params={{ requestId: sent }} className="text-primary underline">View request</Link></p>
            : <Button size="lg" disabled={m.isPending || !!conflict?.blocked || !startOn} onClick={() => m.mutate()}>Request {BOOKKEEPING_OPTIONS[option].shortName} for {entity.legalName}</Button>}
          <p className="text-xs text-muted-foreground">Nothing is charged or started now. Harmonious confirms scope and pricing in a quote you approve.</p>
        </section>
      )}
    </div>
  );
}
