import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { acceptanceRemittance, signAcceptance, viewAcceptance } from "@/lib/sales-acceptance.functions";

export const Route = createFileRoute("/accept/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Review and sign - Harmonious" },
      { name: "description", content: "Review, sign and approve your Harmonious quote or proposal, then choose how to pay." },
      { property: "og:title", content: "Review and sign - Harmonious" },
      { property: "og:description", content: "Review, sign and approve your Harmonious quote or proposal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AcceptPage,
});

const money = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const KIND: Record<string, string> = { quote: "Quote", proposal: "Proposal", rfp: "RFP response", rfq: "RFQ response" };
type Method = "card" | "wire" | "ach";

function AcceptPage() {
  const { token } = Route.useParams();
  const view = useServerFn(viewAcceptance);
  const sign = useServerFn(signAcceptance);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["accept", token], queryFn: () => view({ data: { token } }), retry: false });
  const [name, setName] = useState(""); const [title, setTitle] = useState(""); const [agree, setAgree] = useState(false); const [msaAgree, setMsaAgree] = useState(false); const [showMsa, setShowMsa] = useState(false);
  const [method, setMethod] = useState<Method>("wire"); const [busy, setBusy] = useState(false);

  if (q.isLoading) return <Shell><p className="text-muted-foreground">Loading…</p></Shell>;
  if (q.error || !q.data) return <Shell><p className="text-destructive">{(q.error as Error)?.message ?? "This link is no longer valid."}</p></Shell>;
  const d = q.data;

  const submit = async () => {
    setBusy(true);
    try { const r = await sign({ data: { token, signerName: name, signerTitle: title || undefined, agree: true, msaAgree: d.msa ? msaAgree : undefined, msaVersionId: d.msa?.versionId ?? null, paymentMethod: method } }); qc.setQueryData(["accept", token], r); toast.success("Signed"); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const steps = [
    { id: "overview", label: "Overview" },
    ...(d.sections.length ? [{ id: "details", label: "What we handle & terms" }] : []),
    ...(d.lines.length ? [{ id: "pricing", label: "Pricing" }] : []),
    { id: "sign", label: d.accepted ? "Signed" : "Sign & approve" },
  ];
  return (
    <Shell steps={steps} doneUpTo={d.accepted ? steps.length : 0}>
      <Card id="overview" className="scroll-mt-6">
        <CardHeader>
          <CardDescription>{KIND[d.kind] ?? "Document"} · version {d.version}{d.clientName ? ` · ${d.clientName}` : ""}</CardDescription>
          <CardTitle className="font-heading text-2xl">{d.title}</CardTitle>
          <p className="text-sm text-muted-foreground">From Harmonious{d.salesContact ? <> · Your contact: <span className="font-medium text-foreground">{d.salesContact.name}</span> · <a className="underline" href={`mailto:${d.salesContact.email}`}>{d.salesContact.email}</a></> : null}</p>
          {(d as any).stale && <p className="text-sm text-destructive">A newer version is available. Please use the latest link from your Harmonious contact.</p>}
        </CardHeader>
      </Card>
      {d.sections.length > 0 && (
        <Card id="details" className="scroll-mt-6">
          <CardHeader><CardTitle className="font-heading text-lg">What we handle & terms</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {d.sections.map((s, i) => (
              <section key={i}><h3 className="font-heading font-semibold text-primary">{s.title}</h3><p className="whitespace-pre-wrap text-sm">{s.body}</p></section>
            ))}
          </CardContent>
        </Card>
      )}
      {d.lines.length > 0 && (
        <Card id="pricing" className="scroll-mt-6">
          <CardHeader><CardTitle className="font-heading text-lg">Pricing</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody>
                {d.lines.map((l, i) => <tr key={i} className="border-b"><td className="py-2">{l.label}{l.quantity > 1 ? ` × ${l.quantity}` : ""}</td><td className="py-2 text-right">{money(l.amountCents)}</td></tr>)}
                <tr><td className="pt-3 font-semibold">Total</td><td className="pt-3 text-right font-semibold">{money(d.totalCents)}</td></tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <div id="sign" className="scroll-mt-6">
      {d.accepted ? (
        <Card>
          <CardHeader><CardTitle className="font-heading">Signed by {d.accepted.signerName}</CardTitle>
            <CardDescription>{new Date(d.accepted.acceptedAt).toLocaleString()}{d.invoice ? ` · invoice ${d.invoice.number} issued for ${money(d.invoice.totalCents)}, due ${d.invoice.dueDate}` : ""}</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {!d.invoice && <p className="text-sm text-muted-foreground">{d.accepted.invoiceError ?? "Your invoice is being prepared."}</p>}
            {d.invoice && <PaySection token={token} initial={(d.accepted.paymentMethod as Method) ?? "wire"} />}
            <div className="rounded-md border p-4">
              <p className="text-sm">Your account is ready. Sign in with the email this was sent to and start setting up your fund.</p>
              <a href="/auth?next=%2Fclient%2Ffunds%2Fnew" className="mt-3 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Sign in and start setting up your fund</a>
            </div>
          </CardContent>
        </Card>
      ) : d.blocker ? (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">{d.blocker}</CardContent></Card>
      ) : (
        <Card>
          <CardHeader><CardTitle className="font-heading">Sign and approve</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label htmlFor="sn">Full name</Label><Input id="sn" value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div><Label htmlFor="st">Title (optional)</Label><Input id="st" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            </div>
            {d.msa && (
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={msaAgree} onChange={(e) => setMsaAgree(e.target.checked)} />
                <span>I have read and accept the <button type="button" className="font-medium text-primary underline" onClick={() => setShowMsa(true)}>Master Services Agreement and terms and conditions</button> (version {d.msa.version}) on behalf of my organization.</span></label>
            )}
            {d.msa && showMsa && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4" onClick={() => setShowMsa(false)}>
                <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border bg-card p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
                  <div className="mb-2 flex items-center justify-between"><p className="font-heading font-semibold text-primary">Master Services Agreement · version {d.msa.version}</p>
                    <Button size="sm" variant="outline" onClick={() => setShowMsa(false)}>Close</Button></div>
                  <div className="space-y-3 overflow-y-auto text-sm">
                    {d.msa.sections.map((x, i) => <div key={i}><p className="font-semibold">{x.no ? `${x.no}. ` : ""}{x.title}</p><p className="whitespace-pre-wrap">{x.body}</p></div>)}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">You accept this once. You'll only be asked again if Harmonious updates it and assigns the new version to you.</p>
                </div>
              </div>
            )}
            <MethodPicker value={method} onChange={setMethod} />
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>I approve and agree to this {KIND[d.kind]?.toLowerCase() ?? "document"} on behalf of my organization. Typing my name is my electronic signature.</span></label>
            <Button className="w-full" disabled={busy || !agree || (!!d.msa && !msaAgree) || name.trim().length < 2} onClick={submit}>Sign and approve</Button>
          </CardContent>
        </Card>
      )}
      </div>
    </Shell>
  );
}

function MethodPicker({ value, onChange }: { value: Method; onChange: (m: Method) => void }) {
  return (
    <div><Label>How will you pay?</Label>
      <div className="mt-1 flex gap-2">{(["wire", "ach", "card"] as Method[]).map((m) => (
        <Button key={m} type="button" size="sm" variant={value === m ? "default" : "outline"} onClick={() => onChange(m)}>{m === "ach" ? "ACH" : m === "wire" ? "Wire" : "Card"}</Button>
      ))}</div>
    </div>
  );
}

function PaySection({ token, initial }: { token: string; initial: Method }) {
  const [method, setMethod] = useState<Method>(initial);
  return (
    <div className="space-y-3">
      <MethodPicker value={method} onChange={setMethod} />
      {method === "card"
        ? <p className="text-sm text-muted-foreground">Sign in to your Harmonious portal and open Invoices to pay by card.</p>
        : <Remittance key={method} token={token} method={method} />}
    </div>
  );
}

function Remittance({ token, method }: { token: string; method: "wire" | "ach" }) {
  const load = useServerFn(acceptanceRemittance);
  const [reveal, setReveal] = useState(false);
  const q = useQuery({ queryKey: ["remit", token, method, reveal], queryFn: () => load({ data: { token, method, reveal } }), gcTime: 0, staleTime: 0 });
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading payment instructions…</p>;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const r = q.data?.instructions;
  if (!r) return <p className="text-sm text-muted-foreground">Contact your Harmonious representative for payment details.</p>;
  const rows: [string, string | null][] = [["Bank", r.bankName], ["Account name", r.accountName], ["Account number", r.accountNumber], [method === "wire" ? "Routing (ABA)" : "Routing number", r.routingNumber],
    ["SWIFT", r.swiftCode], ["Bank address", r.bankAddress], ["Beneficiary address", r.beneficiaryAddress], ["Reference", q.data?.reference ?? null]];
  return (
    <div className="rounded-md border p-3 text-sm">
      <dl className="grid grid-cols-[10rem_1fr] gap-y-1">{rows.filter(([, v]) => v).map(([k, v]) => <Fragment key={k}><dt className="text-muted-foreground">{k}</dt><dd className="font-mono">{v}</dd></Fragment>)}</dl>
      {r.referenceNote && <p className="mt-2 text-muted-foreground">{r.referenceNote}</p>}
      {!r.revealed && <Button size="sm" variant="outline" className="mt-3" onClick={() => setReveal(true)}>Show full details</Button>}
      <p className="mt-2 text-xs text-muted-foreground">Always confirm instructions by phone with your Harmonious contact before sending money. Harmonious never changes payment details by email.</p>
    </div>
  );
}

function Shell({ children, steps, doneUpTo = 0 }: { children: React.ReactNode; steps?: { id: string; label: string }[]; doneUpTo?: number }) {
  if (!steps) return <main className="mx-auto max-w-3xl space-y-4 px-4 py-10">{children}</main>;
  return (
    <main className="mx-auto grid max-w-5xl gap-6 px-4 py-10 md:grid-cols-[200px_1fr]">
      <nav aria-label="Steps" className="md:sticky md:top-6 md:self-start">
        <ol className="flex gap-2 overflow-x-auto text-sm md:flex-col">
          {steps.map((s, i) => (
            <li key={s.id}><a href={`#${s.id}`} className="flex items-center gap-2 whitespace-nowrap rounded-md px-2 py-1 hover:bg-muted">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs ${i < doneUpTo ? "border-primary bg-primary text-primary-foreground" : ""}`}>{i + 1}</span>{s.label}
            </a></li>
          ))}
        </ol>
      </nav>
      <div className="min-w-0 space-y-4">{children}</div>
    </main>
  );
}
