import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  generateMigratedSow, getMigratedBilling, pushMigratedToCommissions, recordMigratedInvoice, recordMigratedPayment, uploadMigratedSow,
} from "@/lib/migrated-billing.functions";
import { usd } from "./shared";

const toB64 = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] ?? ""); r.onerror = rej; r.readAsDataURL(f); });
type Row = { label: string; amount: string };
const cents = (s: string) => Math.round(Number(s.replace(/[$,]/g, "")) * 100) || 0;

/** CEO / CRO / Super Admin: migrated past fees, invoices, payments and statements of work for this fund. */
export function MigratedBillingPanel({ fundId }: { fundId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(getMigratedBilling);
  const q = useQuery({ queryKey: ["migrated-billing", fundId], queryFn: () => load({ data: { fundId } }), retry: false });
  const recordInv = useServerFn(recordMigratedInvoice);
  const recordPay = useServerFn(recordMigratedPayment);
  const genSow = useServerFn(generateMigratedSow);
  const upSow = useServerFn(uploadMigratedSow);
  const push = useServerFn(pushMigratedToCommissions);

  const [rows, setRows] = useState<Row[]>([{ label: "", amount: "" }]);
  const [issueDate, setIssueDate] = useState("");
  const [paidOn, setPaidOn] = useState("");
  const [reference, setReference] = useState("");
  const [sowMode, setSowMode] = useState<"generate" | "upload" | "none">("generate");
  const [sowTitle, setSowTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [signedOn, setSignedOn] = useState("");
  const [signedBy, setSignedBy] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [rep, setRep] = useState<Record<string, string>>({});
  const [payOn, setPayOn] = useState<Record<string, string>>({});

  if (q.error) return null; // Not CEO/CRO/Super Admin: section hidden.
  if (!q.data) return <p className="text-sm text-muted-foreground">Loading migrated billing…</p>;
  const d = q.data;
  const refresh = () => { qc.invalidateQueries({ queryKey: ["migrated-billing", fundId] }); qc.invalidateQueries({ queryKey: ["fund-billing"] }); };
  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try { await fn(); toast.success(ok); refresh(); return true; } catch (e) { toast.error((e as Error).message); return false; } finally { setBusy(null); }
  };
  const lines = rows.filter((r) => r.label.trim() && cents(r.amount) > 0).map((r) => ({ label: r.label.trim(), amountCents: cents(r.amount) }));

  const save = async () => {
    if (!lines.length) return toast.error("Add at least one fee with an amount.");
    if (sowMode === "upload" && (!file || !signedOn)) return toast.error("Choose the signed PDF and its signed date.");
    await run("save", async () => {
      const inv = issueDate ? await recordInv({ data: { fundId, lines, issueDate, paidOn: paidOn || null, reference: reference || null } }) : null;
      if (sowMode === "generate") {
        const r = await genSow({ data: { fundId, title: sowTitle, lines, invoiceId: inv?.id ?? null } });
        toast.message(r.emailed ? `Emailed ${r.emailed} client ${r.emailed === 1 ? "person" : "people"} to sign` : "No client portal users to email yet; it's on their list when they sign in.");
      } else if (sowMode === "upload" && file) {
        await upSow({ data: { fundId, title: sowTitle, signedOn, signedBy: signedBy || null, fileName: file.name, base64: await toB64(file), invoiceId: inv?.id ?? null } });
      }
    }, "Saved");
    setRows([{ label: "", amount: "" }]); setIssueDate(""); setPaidOn(""); setReference(""); setSowTitle(""); setFile(null); setSignedOn(""); setSignedBy("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Migrated fees, invoices and statements of work</CardTitle>
        <CardDescription>For past costs and paid invoices from before the platform. CEO, CRO and Super Admin only. Records only: nothing is charged or paid out.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3 rounded-md border p-3">
          <p className="text-sm font-medium">1. Fees</p>
          {rows.map((r, i) => (
            <div key={i} className="flex gap-2">
              <Input placeholder="Service or fee (e.g. Fund formation)" value={r.label} onChange={(e) => setRows((x) => x.map((y, n) => (n === i ? { ...y, label: e.target.value } : y)))} />
              <Input className="w-36" inputMode="decimal" placeholder="Amount $" value={r.amount} onChange={(e) => setRows((x) => x.map((y, n) => (n === i ? { ...y, amount: e.target.value } : y)))} />
              {rows.length > 1 && <Button variant="ghost" size="sm" onClick={() => setRows((x) => x.filter((_, n) => n !== i))}>Remove</Button>}
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setRows((x) => [...x, { label: "", amount: "" }])}>Add fee</Button>
          <p className="text-xs text-muted-foreground">Total {usd(lines.reduce((s, l) => s + l.amountCents, 0))}</p>
        </div>

        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">2. Invoice and payment (optional)</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-xs text-muted-foreground">Invoice date<Input type="date" max={new Date().toISOString().slice(0, 10)} value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></label>
            <label className="text-xs text-muted-foreground">Paid on (leave blank if unpaid)<Input type="date" max={new Date().toISOString().slice(0, 10)} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></label>
            <label className="text-xs text-muted-foreground">Payment reference<Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Wire or check number" /></label>
          </div>
          <p className="text-xs text-muted-foreground">Leave the invoice date blank to only create the statement of work.</p>
        </div>

        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">3. Statement of work</p>
          <div className="flex flex-wrap gap-4 text-sm">
            {([["generate", "Create one and send to the client to sign"], ["upload", "Upload a previously signed one"], ["none", "None"]] as const).map(([v, l]) => (
              <label key={v} className="flex items-center gap-2"><input type="radio" name="sow-mode" checked={sowMode === v} onChange={() => setSowMode(v)} />{l}</label>
            ))}
          </div>
          {sowMode !== "none" && <Input placeholder="Title (optional)" value={sowTitle} onChange={(e) => setSowTitle(e.target.value)} />}
          {sowMode === "generate" && <p className="text-xs text-muted-foreground">Built from the fees above and assigned to this fund. It's added to the client's Waiting on you list and each client portal user gets an email to review and sign.</p>}
          {sowMode === "upload" && (
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="text-xs text-muted-foreground">Signed PDF<Input type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
              <label className="text-xs text-muted-foreground">Signed on<Input type="date" max={new Date().toISOString().slice(0, 10)} value={signedOn} onChange={(e) => setSignedOn(e.target.value)} /></label>
              <label className="text-xs text-muted-foreground">Signed by (client)<Input value={signedBy} onChange={(e) => setSignedBy(e.target.value)} /></label>
            </div>
          )}
        </div>
        <Button disabled={!!busy} onClick={save}>{busy === "save" ? "Saving…" : "Save"}</Button>

        <div className="space-y-2">
          <p className="text-sm font-medium">Invoices on this fund</p>
          {!d.invoices.length && <p className="text-sm text-muted-foreground">None yet.</p>}
          <ul className="divide-y text-sm">
            {d.invoices.map((i: any) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{i.number ?? "Draft"} · {usd(Number(i.total_cents))} · {i.issue_date ?? "-"}</span>
                <span className="flex flex-wrap items-center gap-2">
                  <Badge variant={i.paid_on ? "default" : "outline"}>{i.paid_on ? `Paid ${i.paid_on}` : i.status}</Badge>
                  {i.status === "issued" && (<>
                    <Input type="date" className="h-8 w-36" max={new Date().toISOString().slice(0, 10)} value={payOn[i.id] ?? ""} onChange={(e) => setPayOn((x) => ({ ...x, [i.id]: e.target.value }))} />
                    <Button size="sm" variant="outline" disabled={!payOn[i.id] || !!busy} onClick={() => run(`pay-${i.id}`, () => recordPay({ data: { invoiceId: i.id, paidOn: payOn[i.id]! } }), "Payment recorded")}>Mark paid</Button>
                  </>)}
                  {i.sales_quote_id ? <Badge variant="secondary">In commissions</Badge> : (<>
                    <select className="h-8 rounded-md border bg-background px-2 text-sm" value={rep[i.id] ?? ""} onChange={(e) => setRep((x) => ({ ...x, [i.id]: e.target.value }))} aria-label="Sales rep">
                      <option value="">Sales rep…</option>
                      {d.reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                    <Button size="sm" disabled={!rep[i.id] || !!busy} onClick={() => run(`push-${i.id}`, () => push({ data: { invoiceId: i.id, repUserId: rep[i.id]! } }), "Sent to commissions")}>Send to commissions</Button>
                  </>)}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">Commissions are calculated from paid invoices at the current rates. A different person than whoever entered the invoice sends it (Super Admins can with a logged reason).</p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Statements of work on this fund</p>
          {!d.sows.length && <p className="text-sm text-muted-foreground">None yet.</p>}
          <ul className="divide-y text-sm">
            {d.sows.map((s: any) => (
              <li key={s.id} className="flex items-center justify-between gap-2 py-2"><span>{s.title}</span>
                <Badge variant="outline">{s.executed_at ? (s.legacy_activation ? "Signed before platform" : "Executed") : s.client_signed_at ? "Client signed" : "Waiting on client"}</Badge></li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
