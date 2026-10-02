import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCapTableSubscription, startCapTableCheckout } from "@/lib/cap-table-billing.functions";
import { CAP_TABLE_TIERS, type BillingInterval, type CapTierKey, fmtUsd, tierPriceCents } from "@/lib/cap-table-tiers";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";

export const Route = createFileRoute("/_authenticated/client/add-cap-table")({
  validateSearch: (s: Record<string, unknown>): { sub?: string | undefined } => ({ sub: typeof s["sub"] === "string" ? s["sub"] : undefined }),
  head: () => ({ meta: [{ title: "Add a cap table | Harmonious" }, { name: "description", content: "Choose a cap table plan, set up auto pay and start building." }] }),
  component: AddCapTablePage,
});

function TestBanner() {
  const t = import.meta.env['VITE_PAYMENTS_CLIENT_TOKEN'] as string | undefined;
  if (t && !t.startsWith("pk_test_")) return null;
  return (
    <div className="rounded-md border border-accent bg-accent/10 px-4 py-2 text-sm">
      {t ? "Payments in the preview are in test mode. Use card 4242 4242 4242 4242." : "Card payments are not configured for this build yet."}
    </div>
  );
}

function AddCapTablePage() {
  const { sub } = Route.useSearch();
  if (sub) return <Confirming id={sub} />;
  return <AddFlow />;
}

function AddFlow() {
  const start = useServerFn(startCapTableCheckout);
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [companyName, setCompanyName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [tier, setTier] = useState<CapTierKey>("starter");
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"free" | "sales" | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  const go = async () => {
    setBusy(true);
    try {
      const r = await start({ data: {
        companyName, legalName: legalName || undefined, tier, interval, environment: getStripeEnvironment(),
        returnUrl: `${window.location.origin}/client/add-cap-table?sub=SUB_ID`,
      } });
      if ("error" in r) throw new Error(r.error);
      qc.invalidateQueries({ queryKey: ["my-cap-tables"] });
      if (r.mode === "checkout") { setClientSecret(r.clientSecret ?? null); setStep(3); }
      else setDone(r.mode);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const checkoutOptions = useMemo(() => (clientSecret ? { fetchClientSecret: async () => clientSecret } : null), [clientSecret]);

  if (done) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardHeader>
          <CardTitle>{done === "free" ? "Your cap table is ready" : "Request sent to Sales"}</CardTitle>
          <CardDescription>{done === "free" ? "No card needed on the Free plan. Set up your cap table now." : "Harmonious Sales will reach out about Enterprise pricing."}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild><Link to={done === "free" ? "/client/cap-table" : "/client/home"}>{done === "free" ? "Set up my cap table" : "Back to Home"}</Link></Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <TestBanner />
      <div>
        <h1 className="text-2xl font-semibold">Add a cap table</h1>
        <p className="text-sm text-muted-foreground">Step {step} of 3: {step === 1 ? "Company" : step === 2 ? "Choose a plan" : "Set up auto pay"}</p>
      </div>

      {step === 1 && (
        <Card className="max-w-xl">
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-1"><Label htmlFor="cn">Company name</Label><Input id="cn" value={companyName} onChange={(e) => setCompanyName(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="ln">Legal name (optional)</Label><Input id="ln" value={legalName} onChange={(e) => setLegalName(e.target.value)} /></div>
            <Button disabled={!companyName.trim()} onClick={() => setStep(2)}>Continue</Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="inline-flex rounded-md border p-1">
            {(["monthly", "annual"] as const).map((i) => (
              <Button key={i} size="sm" variant={interval === i ? "default" : "ghost"} onClick={() => setInterval(i)}>
                {i === "monthly" ? "Monthly" : "Annual (2 months free)"}
              </Button>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
            {CAP_TABLE_TIERS.map((t) => (
              <button key={t.key} type="button" onClick={() => setTier(t.key)}
                className={`rounded-lg border p-4 text-left transition ${tier === t.key ? "border-primary ring-2 ring-primary" : "hover:border-primary/50"}`}>
                <div className="flex items-center justify-between"><p className="font-semibold">{t.name}</p>{tier === t.key && <Check className="size-4 text-primary" />}</div>
                <p className="mt-1 text-xl font-semibold">
                  {t.monthlyCents === null ? "Talk to us" : t.monthlyCents === 0 ? "$0" : fmtUsd(tierPriceCents(t.monthlyCents, interval))}
                  {t.monthlyCents ? <span className="text-xs font-normal text-muted-foreground">/{interval === "annual" ? "yr" : "mo"}</span> : null}
                </p>
                <Badge variant="secondary" className="mt-2">{t.stakeholders}</Badge>
                <ul className="mt-3 space-y-1 text-xs text-muted-foreground">{t.highlights.map((h) => <li key={h}>{h}</li>)}</ul>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
            <Button disabled={busy} onClick={go}>
              {tier === "free" ? "Create cap table" : tier === "enterprise" ? "Contact Sales" : "Continue to auto pay"}
            </Button>
          </div>
          {tier !== "free" && tier !== "enterprise" && (
            <p className="text-xs text-muted-foreground">Your card is charged automatically each {interval === "annual" ? "year" : "month"}. Change plan or cancel any time from Settings; your cap table data is never deleted.</p>
          )}
        </div>
      )}

      {step === 3 && checkoutOptions && (
        <Card><CardContent className="pt-6">
          <EmbeddedCheckoutProvider stripe={getStripe()} options={checkoutOptions}><EmbeddedCheckout /></EmbeddedCheckoutProvider>
        </CardContent></Card>
      )}
    </div>
  );
}

function Confirming({ id }: { id: string }) {
  const fn = useServerFn(getCapTableSubscription);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["cap-sub", id], queryFn: () => fn({ data: { id } }), refetchInterval: (query) => (query.state.data?.status === "active" ? false : 3000) });
  const active = q.data?.status === "active";
  useEffect(() => { if (active) qc.invalidateQueries({ queryKey: ["my-cap-tables"] }); }, [active, qc]);
  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader>
        <CardTitle>{active ? "Auto pay is set up" : "Confirming your payment"}</CardTitle>
        <CardDescription>{active ? `${q.data?.company_name} is ready. Set up your cap table now.` : "This usually takes a few seconds."}</CardDescription>
      </CardHeader>
      <CardContent>{active && <Button asChild><Link to="/client/cap-table">Set up my cap table</Link></Button>}</CardContent>
    </Card>
  );
}
