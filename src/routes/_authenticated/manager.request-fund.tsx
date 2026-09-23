import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { getFundRequestOptions, submitFundSetupRequest } from "@/lib/self-service.functions";
import { FUND_REQUEST_KINDS } from "@/lib/self-service-model";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/manager/request-fund")({
  head: () => ({
    meta: [
      { title: "Request New Fund / SPV — Harmonious" },
      { name: "description", content: "Ask Harmonious to set up a new fund or SPV in four short steps." },
      { property: "og:title", content: "Request New Fund / SPV — Harmonious" },
      { property: "og:description", content: "Ask Harmonious to set up a new fund or SPV in four short steps." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RequestFund,
});

const DRAFT_KEY = "harmonious.fund-request-draft";
const empty = { kind: "", fundName: "", strategy: "", target: "", investors: "", launch: "", jurisdiction: "", entity: "", formation: "unsure", notes: "", clientId: "" };
const STEPS = ["What are you creating?", "Basic information", "Offering / setup", "Review & Request"];

function RequestFund() {
  const navigate = useNavigate();
  const loadOptions = useServerFn(getFundRequestOptions);
  const submit = useServerFn(submitFundSetupRequest);
  const options = useQuery({ queryKey: ["fund-request-options"], queryFn: () => loadOptions() });
  const [step, setStep] = useState(0);
  const [f, setF] = useState(empty);

  useEffect(() => {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (raw) try { setF({ ...empty, ...JSON.parse(raw) }); } catch { /* ignore */ }
  }, []);
  useEffect(() => { window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(f)); }, [f]);

  const clients = options.data?.clients ?? [];
  const money = (v: string) => (v ? Math.round(Number(v.replace(/[$,\s]/g, "")) * 100) || null : null);
  const mutation = useMutation({
    mutationFn: () =>
      submit({
        data: {
          clientId: f.clientId || clients[0]?.id || null,
          kind: f.kind,
          fundName: f.fundName,
          strategy: f.strategy || null,
          targetSizeCents: money(f.target),
          expectedInvestors: f.investors ? Number(f.investors) : null,
          expectedLaunchDate: f.launch || null,
          jurisdiction: f.jurisdiction || null,
          entityPreference: f.entity || null,
          formationNeeded: f.formation as any,
          setupNotes: f.notes || null,
        },
      }),
    onSuccess: (r) => {
      window.sessionStorage.removeItem(DRAFT_KEY);
      toast.success("Request sent to Harmonious.");
      void navigate({ to: "/manager/fund-setup/$requestId", params: { requestId: r.requestId } });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message.replace(/^Forbidden:\s*/, "") : "Could not send the request"),
  });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const canNext = step === 0 ? !!f.kind : step === 1 ? f.fundName.trim().length >= 2 : true;
  const kindLabel = FUND_REQUEST_KINDS.find((k) => k.value === f.kind)?.label ?? "—";

  if (options.isSuccess && clients.length === 0) {
    return <main className="mx-auto max-w-xl px-4 py-12"><h1 className="text-2xl">Request New Fund / SPV</h1><p className="mt-2 text-sm text-muted-foreground">Your account isn't linked to a firm yet. Harmonious will set that up with you.</p></main>;
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <p className="text-xs font-medium uppercase text-muted-foreground">Step {step + 1} of 4</p>
      <h1 className="mt-1 text-2xl">{STEPS[step]}</h1>
      <div className="mt-3 flex gap-1" aria-hidden>{STEPS.map((_, i) => <div key={i} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />)}</div>

      <Card className="mt-6">
        <CardContent className="space-y-4 pt-6">
          {step === 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {FUND_REQUEST_KINDS.map((k) => (
                <Button key={k.value} type="button" variant={f.kind === k.value ? "default" : "outline"} className="h-14 justify-start text-base" onClick={() => setF({ ...f, kind: k.value })}>{k.label}</Button>
              ))}
            </div>
          )}
          {step === 1 && (
            <>
              {clients.length > 1 && (
                <div className="space-y-1.5"><Label htmlFor="rf-client">Firm</Label>
                  <select id="rf-client" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })}>
                    <option value="">Choose…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select></div>
              )}
              <Field id="rf-name" label="Fund / SPV name"><Input id="rf-name" value={f.fundName} onChange={set("fundName")} /></Field>
              <Field id="rf-strategy" label="Strategy or purpose"><Textarea id="rf-strategy" rows={3} value={f.strategy} onChange={set("strategy")} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="rf-target" label={f.kind === "spv" ? "Investment amount" : "Target size"}><Input id="rf-target" inputMode="decimal" placeholder="$" value={f.target} onChange={set("target")} /></Field>
                <Field id="rf-investors" label="Expected investors"><Input id="rf-investors" inputMode="numeric" value={f.investors} onChange={set("investors")} /></Field>
                <Field id="rf-launch" label="Expected launch / close"><Input id="rf-launch" type="date" value={f.launch} onChange={set("launch")} /></Field>
                <Field id="rf-jur" label="Jurisdiction (if known)"><Input id="rf-jur" placeholder="e.g. Delaware" value={f.jurisdiction} onChange={set("jurisdiction")} /></Field>
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <div className="space-y-2"><Label>Entity</Label>
                <div className="grid gap-2 sm:grid-cols-3">
                  {[["existing", "Existing entity"], ["formation", "Need formation"], ["unsure", "Not sure"]].map(([v, l]) => (
                    <Button key={v} type="button" variant={f.formation === v ? "default" : "outline"} onClick={() => setF({ ...f, formation: v! })}>{l}</Button>
                  ))}
                </div></div>
              <Field id="rf-entity" label="Entity preference (if known)"><Input id="rf-entity" placeholder="e.g. LLC, LP" value={f.entity} onChange={set("entity")} /></Field>
              <Field id="rf-notes" label="Anything else Harmonious should know"><Textarea id="rf-notes" rows={3} value={f.notes} onChange={set("notes")} /></Field>
              <p className="rounded-md bg-muted px-3 py-2 text-sm">Harmonious will review the offering structure with you.</p>
            </>
          )}
          {step === 3 && (
            <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Type</dt><dd>{kindLabel}</dd>
              <dt className="text-muted-foreground">Name</dt><dd className="break-words">{f.fundName}</dd>
              {f.strategy && <><dt className="text-muted-foreground">Purpose</dt><dd className="break-words">{f.strategy}</dd></>}
              {f.target && <><dt className="text-muted-foreground">Size</dt><dd>${f.target}</dd></>}
              {f.investors && <><dt className="text-muted-foreground">Investors</dt><dd>{f.investors}</dd></>}
              {f.launch && <><dt className="text-muted-foreground">Launch</dt><dd>{f.launch}</dd></>}
              <dt className="text-muted-foreground">Offering</dt><dd>Reviewed with Harmonious</dd>
            </dl>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</Button>
        {step < 3 ? (
          <Button disabled={!canNext} onClick={() => setStep(step + 1)}>Continue</Button>
        ) : (
          <Button size="lg" disabled={mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "Sending…" : "Request Fund Setup"}</Button>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Your progress is saved on this device until you send the request.</p>
    </main>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label>{children}</div>;
}
