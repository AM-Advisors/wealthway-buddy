import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HARMONIOUS_LEGAL_NAME, MSA_SECTIONS } from "@/lib/agreement-templates";
import { INVESTOR_TIERS, investorTierFor } from "@/lib/product-pricing";
import { signSaasOrderFn } from "@/lib/saas-orders.functions";
import { alaCarteCatalog, CAP_TIERS, priceOrder, SAAS_MSA_VERSION, SERVICING_KEYS, type CapTier, type OrderInterval, type ServicingKey } from "@/lib/saas-order-model";

const TITLE = "Build your plan - Harmonious";
const DESC = "Pick the Harmonious services you need, agree to the Statement of Work and start right away.";
const INV_LABEL = Object.fromEntries(INVESTOR_TIERS.map((t) => [t.key, t.maxInvestors ? `${t.name} (up to ${t.maxInvestors})` : t.name])) as Record<InvestorServicingKey, string>;

export const Route = createFileRoute("/_authenticated/plan/start")({
  head: () => ({ meta: [
    { title: TITLE }, { name: "description", content: DESC }, { property: "og:title", content: TITLE }, { property: "og:description", content: DESC },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: PlanStart,
});

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
const SERV_LABEL: Record<ServicingKey, string> = { self_serve: "Self Serve (help center)", core: "Core (72-hour response)", plus: "Plus (48-hour, named contact)", white_glove: "White Glove (24-hour, proactive)" };
const CAP_LABEL: Record<CapTier, string> = { none: "No cap table", starter: "Starter (25 stakeholders)", growth: "Growth (50)", scale: "Scale (unlimited)" };

function Choice<T extends string>({ value, options, labels, onChange }: { value: T; options: readonly T[]; labels: Record<T, string>; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => onChange(o)}
          className={`rounded-md border p-3 text-left text-sm transition ${value === o ? "border-primary bg-primary/5 font-medium" : "hover:bg-muted"}`}>
          {labels[o]}
        </button>
      ))}
    </div>
  );
}

function PlanStart() {
  const navigate = useNavigate();
  const sign = useServerFn(signSaasOrderFn);
  const [step, setStep] = useState<"pick" | "sow">("pick");
  const [interval, setInterval] = useState<OrderInterval>("annual");
  const [funds, setFunds] = useState(1);
  const [servicing, setServicing] = useState<ServicingKey>("self_serve");
  const [capTable, setCapTable] = useState<CapTier>("none");
  const [investorServicing, setInvestorServicing] = useState<InvestorServicingKey>("self_serve");
  const [investorCount, setInvestorCount] = useState(0);
  const suggested = investorCount > 0 ? investorTierFor(investorCount) : null;
  const [alaCarte, setAlaCarte] = useState<Record<string, number>>({});
  const [company, setCompany] = useState("");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const catalog = useMemo(() => alaCarteCatalog(), []);
  const selection = { funds, servicing, capTable, alaCarte, investorServicing };
  const priced = useMemo(() => { try { return priceOrder(selection, interval); } catch { return null; } }, [funds, servicing, capTable, alaCarte, interval, investorServicing]);
  const per = interval === "annual" ? "year" : "quarter";

  async function submit() {
    setBusy(true);
    try {
      await sign({ data: { companyName: company, interval, selection, signerName: name, signerTitle: title || undefined, msaAccepted: true } });
      toast.success("Agreement signed.");
      navigate({ to: "/plan/setup" });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-3xl">Build your plan</h1>
        <p className="mt-2 text-sm text-muted-foreground">No sales call needed. Pick your services, agree once, pay by card and get started. Institutional and Enterprise plans are arranged with our team.</p>
      </div>

      {step === "pick" ? (
        <>
          <Card><CardHeader><CardTitle className="text-lg">Billing</CardTitle></CardHeader><CardContent>
            <Choice value={interval} options={["annual", "quarterly"] as const} labels={{ annual: "Yearly", quarterly: "Quarterly (+10%)" }} onChange={setInterval} />
          </CardContent></Card>
          <Card><CardHeader><CardTitle className="text-lg">SaaS platform</CardTitle></CardHeader><CardContent className="flex items-center gap-3">
            <Label htmlFor="funds">Number of funds</Label>
            <Input id="funds" type="number" min={0} max={50} value={funds} onChange={(e) => setFunds(Math.max(0, Math.min(50, Number(e.target.value) || 0)))} className="w-24" />
          </CardContent></Card>
          <Card><CardHeader><CardTitle className="text-lg">Servicing</CardTitle></CardHeader><CardContent>
            <Choice value={servicing} options={SERVICING_KEYS} labels={SERV_LABEL} onChange={setServicing} />
          </CardContent></Card>
          <Card><CardHeader><CardTitle className="text-lg">Investor servicing (per fund)</CardTitle></CardHeader><CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <Label htmlFor="investor-count">Investors per fund</Label>
              <Input id="investor-count" type="number" min={0} value={investorCount} onChange={(e) => setInvestorCount(Math.max(0, Number(e.target.value) || 0))} className="w-24" />
            </div>
            {suggested && <p className="text-sm text-muted-foreground">Suggested: {suggested.name}{suggested.key === "institutional" ? " (contact us for a quote)" : ""}</p>}
            <Choice value={investorServicing} options={INVESTOR_SERVICING_KEYS} labels={INV_LABEL} onChange={setInvestorServicing} />
          </CardContent></Card>
          <Card><CardHeader><CardTitle className="text-lg">Cap table</CardTitle></CardHeader><CardContent>
            <Choice value={capTable} options={CAP_TIERS} labels={CAP_LABEL} onChange={setCapTable} />
          </CardContent></Card>
          <Card><CardHeader><CardTitle className="text-lg">À la carte services</CardTitle></CardHeader><CardContent className="space-y-2">
            {catalog.map((c) => (
              <div key={c.key} className="flex items-center justify-between gap-3 text-sm">
                <span>{c.name} <span className="text-muted-foreground">— {usd(c.amount)} {c.recurring ? "/ year" : c.note ?? "one-time"}</span></span>
                <Input type="number" min={0} max={100} aria-label={`Quantity of ${c.name}`} className="w-20" value={alaCarte[c.key] ?? 0}
                  onChange={(e) => setAlaCarte((a) => ({ ...a, [c.key]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }))} />
              </div>
            ))}
          </CardContent></Card>
          <Totals priced={priced} per={per} />
          <Button size="lg" disabled={!priced || !priced.lines.length} onClick={() => setStep("sow")}>Review Statement of Work</Button>
        </>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle className="text-lg">Statement of Work</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p>This Statement of Work is entered into under the {HARMONIOUS_LEGAL_NAME} Master Services Agreement ({SAAS_MSA_VERSION}). Prices are fixed for the term below and billed {interval === "annual" ? "yearly" : "quarterly"} by card.</p>
              <Totals priced={priced} per={per} />
              <details className="rounded-md border p-3" open>
                <summary className="cursor-pointer font-medium">Master Services Agreement (standard terms)</summary>
                <div className="mt-3 max-h-80 space-y-3 overflow-y-auto pr-2">
                  {MSA_SECTIONS.map((s) => <div key={s.no}><p className="font-medium">{s.no}. {s.title}</p><p className="text-muted-foreground">{s.body}</p></div>)}
                </div>
              </details>
              <p className="text-xs text-muted-foreground">The MSA is standard for all self-serve clients and can't be changed. Institutional and Enterprise clients can ask our team for a negotiated agreement.</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div><Label htmlFor="co">Company legal name</Label><Input id="co" value={company} onChange={(e) => setCompany(e.target.value)} /></div>
                <div><Label htmlFor="nm">Your full name</Label><Input id="nm" value={name} onChange={(e) => setName(e.target.value)} /></div>
                <div><Label htmlFor="tt">Title</Label><Input id="tt" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
              </div>
              <label className="flex items-start gap-2">
                <Checkbox checked={agree} onCheckedChange={(v) => setAgree(v === true)} aria-label="Agree to the MSA and Statement of Work" />
                <span>I agree to the Master Services Agreement and this Statement of Work on behalf of the company named above, and I'm authorized to do so.</span>
              </label>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("pick")}>Back</Button>
                <Button disabled={!agree || company.trim().length < 2 || name.trim().length < 2 || busy} onClick={submit}>{busy ? "Signing…" : "Agree and continue to payment"}</Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Totals({ priced, per }: { priced: ReturnType<typeof priceOrder> | null; per: string }) {
  if (!priced) return <p className="text-sm text-destructive">One of your picks needs a custom quote.</p>;
  return (
    <div className="space-y-1 rounded-md border p-3 text-sm">
      {priced.lines.map((l) => (
        <div key={l.key} className="flex justify-between gap-3"><span>{l.name}{l.quantity > 1 ? ` × ${l.quantity}` : ""}</span><span>{usd(l.total)}{l.recurring ? ` / ${per}` : " one-time"}</span></div>
      ))}
      <div className="flex justify-between border-t pt-1 font-medium"><span>Recurring</span><span>{usd(priced.recurring)} / {per}</span></div>
      {priced.oneTime > 0 && <div className="flex justify-between font-medium"><span>One-time (first invoice)</span><span>{usd(priced.oneTime)}</span></div>}
    </div>
  );
}
