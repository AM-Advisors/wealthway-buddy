import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
  const [name, setName] = useState(""); const [title, setTitle] = useState(""); const [agree, setAgree] = useState(false);
  const [method, setMethod] = useState<Method>("wire"); const [busy, setBusy] = useState(false);

  if (q.isLoading) return <Shell><p className="text-muted-foreground">Loading…</p></Shell>;
  if (q.error || !q.data) return <Shell><p className="text-destructive">{(q.error as Error)?.message ?? "This link is no longer valid."}</p></Shell>;
  const d = q.data;

  const submit = async () => {
    setBusy(true);
    try { const r = await sign({ data: { token, signerName: name, signerTitle: title || undefined, agree: true, paymentMethod: method } }); qc.setQueryData(["accept", token], r); toast.success("Signed"); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Shell>
      <Card>
        <CardHeader>
          <CardDescription>{KIND[d.kind] ?? "Document"} · version {d.version}{d.clientName ? ` · ${d.clientName}` : ""}</CardDescription>
          <CardTitle className="font-heading text-2xl">{d.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {d.sections.map((s, i) => (
            <section key={i}><h3 className="font-heading font-semibold text-primary">{s.title}</h3><p className="whitespace-pre-wrap text-sm">{s.body}</p></section>
          ))}
          {d.lines.length > 0 && (
            <table className="w-full text-sm">
              <tbody>
                {d.lines.map((l, i) => <tr key={i} className="border-b"><td className="py-1">{l.label}{l.quantity > 1 ? ` × ${l.quantity}` : ""}</td><td className="py-1 text-right">{money(l.amountCents)}</td></tr>)}
                <tr><td className="pt-2 font-semibold">Total</td><td className="pt-2 text-right font-semibold">{money(d.totalCents)}</td></tr>
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {d.accepted ? (
        <Card>
          <CardHeader><CardTitle className="font-heading">Signed by {d.accepted.signerName}</CardTitle>
            <CardDescription>{new Date(d.accepted.acceptedAt).toLocaleString()}{d.invoice ? ` · invoice ${d.invoice.number} issued for ${money(d.invoice.totalCents)}, due ${d.invoice.dueDate}` : ""}</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {!d.invoice && <p className="text-sm text-muted-foreground">{d.accepted.invoiceError ?? "Your invoice is being prepared."}</p>}
            {d.invoice && <PaySection token={token} initial={(d.accepted.paymentMethod as Method) ?? "wire"} />}
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
            <MethodPicker value={method} onChange={setMethod} />
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>I approve and agree to this {KIND[d.kind]?.toLowerCase() ?? "document"} on behalf of my organization. Typing my name is my electronic signature.</span></label>
            <Button className="w-full" disabled={busy || !agree || name.trim().length < 2} onClick={submit}>Sign and approve</Button>
          </CardContent>
        </Card>
      )}
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
      <dl className="grid grid-cols-[10rem_1fr] gap-y-1">{rows.filter(([, v]) => v).map(([k, v]) => <><dt key={`${k}-k`} className="text-muted-foreground">{k}</dt><dd key={`${k}-v`} className="font-mono">{v}</dd></>)}</dl>
      {r.referenceNote && <p className="mt-2 text-muted-foreground">{r.referenceNote}</p>}
      {!r.revealed && <Button size="sm" variant="outline" className="mt-3" onClick={() => setReveal(true)}>Show full details</Button>}
      <p className="mt-2 text-xs text-muted-foreground">Always confirm instructions by phone with your Harmonious contact before sending money. Harmonious never changes payment details by email.</p>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-3xl space-y-4 px-4 py-10">{children}</main>;
}
