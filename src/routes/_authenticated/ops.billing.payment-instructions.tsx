import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { decideRemittanceVersion, listRemittanceVersions, prepareRemittanceVersion } from "@/lib/sales-acceptance.functions";

export const Route = createFileRoute("/_authenticated/ops/billing/payment-instructions")({
  head: () => ({
    meta: [
      { title: "Harmonious payment details - Operations" },
      { name: "description", content: "Harmonious wire and ACH instructions shown to clients for invoices, with second-person approval." },
      { property: "og:title", content: "Harmonious payment details - Operations" },
      { property: "og:description", content: "Approved wire and ACH instructions for client invoices." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaymentInstructionsPage,
});

const EMPTY = { method: "wire" as "wire" | "ach", bankName: "", accountName: "", accountNumber: "", routingNumber: "", swiftCode: "", bankAddress: "", beneficiaryAddress: "", referenceNote: "" };

function PaymentInstructionsPage() {
  const load = useServerFn(listRemittanceVersions);
  const prep = useServerFn(prepareRemittanceVersion);
  const decide = useServerFn(decideRemittanceVersion);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["remit-versions"], queryFn: () => load() });
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try { await fn(); toast.success(msg); qc.invalidateQueries({ queryKey: ["remit-versions"] }); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const field = (k: keyof typeof EMPTY, label: string) => (
    <div><Label htmlFor={k}>{label}</Label><Input id={k} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
  );
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <header><h1 className="text-3xl">Harmonious payment details (quotes &amp; invoices)</h1>
        <p className="mt-1 text-sm text-muted-foreground">Harmonious's own wire and ACH details shown to clients after they sign a quote, RFQ or RFP and on their invoices. These are separate from fund banking, which is managed on each fund. Only the CEO and CRO can enter or approve them, and the person who approves must be different from the person who entered. Approved versions can't be edited; add a new version to change them. Clients see masked numbers until they choose to reveal, and every view is logged.</p></header>
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      <Card>
        <CardHeader><CardTitle className="font-heading">Add a new version</CardTitle><CardDescription>It replaces the current approved one only after a second person approves it.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">{(["wire", "ach"] as const).map((m) => <Button key={m} size="sm" variant={f.method === m ? "default" : "outline"} onClick={() => setF({ ...f, method: m })}>{m === "ach" ? "ACH" : "Wire"}</Button>)}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {field("bankName", "Bank name")}{field("accountName", "Account name")}{field("accountNumber", "Account number")}{field("routingNumber", "Routing number")}
            {field("swiftCode", "SWIFT (optional)")}{field("bankAddress", "Bank address (optional)")}{field("beneficiaryAddress", "Beneficiary address (optional)")}{field("referenceNote", "Note to clients (optional)")}
          </div>
          <Button disabled={busy} onClick={() => run(async () => { await prep({ data: f }); setF(EMPTY); }, "Saved for approval")}>Save for approval</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="font-heading">Versions</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(q.data?.versions ?? []).map((v: any) => (
            <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
              <div><Badge variant={v.status === "approved" ? "default" : "secondary"}>{v.status}</Badge> <span className="ml-2 font-medium">{v.method === "ach" ? "ACH" : "Wire"} · {v.bank_name}</span>
                <span className="ml-2 font-mono text-muted-foreground">acct {v.account_number} · routing {v.routing_number}</span>
                <span className="ml-2 text-xs text-muted-foreground">entered {new Date(v.prepared_at).toLocaleDateString()}</span></div>
              {v.status === "draft" && <div className="flex gap-2">
                <Button size="sm" disabled={busy} onClick={() => { const reason = window.prompt("Only needed if you entered this yourself (Super Admin): reason") ?? undefined; run(() => decide({ data: { id: v.id, approve: true, reason } }), "Approved"); }}>Approve</Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => decide({ data: { id: v.id, approve: false } }), "Rejected")}>Reject</Button>
              </div>}
            </div>
          ))}
          {q.data && !q.data.versions.length && <p className="text-sm text-muted-foreground">No payment instructions yet. Clients are told to contact their Harmonious representative.</p>}
        </CardContent>
      </Card>
    </main>
  );
}
