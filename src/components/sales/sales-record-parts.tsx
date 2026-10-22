import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type React from "react";
import { Link } from "@tanstack/react-router";
import { Panel, money } from "@/components/sales/sales-ui";
import { getSalesLinkedRecords } from "@/lib/sales-hub.functions";
import type { ProgressStep } from "@/lib/sales-progress";
import { logSalesLinkCopy, salesDocumentPersonLinks } from "@/lib/sales-documents.functions";

export function SalesProgress({ steps }: { steps: ProgressStep[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-1 text-xs" aria-label="Progress">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1">
          <span className={`flex items-center gap-1 rounded-full border px-2.5 py-1 ${s.done ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground"}`} title={s.at ? new Date(s.at).toLocaleString() : undefined}>
            {s.done && <Check className="h-3 w-3" />}{s.label}
          </span>
          {i < steps.length - 1 && <span className="h-px w-3 bg-border" />}
        </li>
      ))}
    </ol>
  );
}

/** Each recipient's personal link: signers open review-and-sign, others a view-only page. */
export function RecipientLinks({ documentId, addOn }: { documentId: string; addOn?: boolean }) {
  const load = useServerFn(salesDocumentPersonLinks);
  const log = useServerFn(logSalesLinkCopy);
  const q = useQuery({ queryKey: ["sales-person-links", documentId], queryFn: () => load({ data: { id: documentId } }) });
  const copy = async (url: string, email: string, kind: "sign" | "view") => {
    await navigator.clipboard.writeText(url);
    toast.success(kind === "sign" ? "Sign link copied" : "Review link copied");
    log({ data: { id: documentId, email, kind } }).catch(() => undefined);
  };
  return (
    <Panel title="Recipients & signing">
      {addOn && <Badge variant="secondary" className="mb-2">Adding services for a current client</Badge>}
      {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
        : !q.data?.version ? <p className="text-sm text-muted-foreground">Personal links appear once this version is approved.</p>
        : !q.data.people.length ? <p className="text-sm text-muted-foreground">No client contacts with an email yet.</p>
        : (
          <ul className="space-y-3">
            {q.data.people.map((p) => (
              <li key={p.email} className="text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0"><span className="font-medium">{p.name}</span><span className="block truncate text-xs text-muted-foreground">{p.email}</span></span>
                  <Badge variant={p.signed ? "default" : "outline"}>{p.signed ? "Signed" : p.role === "signer" ? "Can sign" : "View only"}</Badge>
                </div>
                <div className="mt-1 flex gap-2">
                  {p.signUrl && <Button size="sm" variant="outline" onClick={() => copy(p.signUrl!, p.email, "sign")}>Copy sign link</Button>}
                  <Button size="sm" variant="ghost" onClick={() => copy(p.viewUrl, p.email, "view")}>Copy review link</Button>
                  {p.signUrl && <Button size="sm" variant="ghost" asChild><a href={p.signUrl} target="_blank" rel="noreferrer">Open</a></Button>}
                </div>
              </li>
            ))}
            <li className="text-xs text-muted-foreground">Version {q.data.version}. Links for older versions show that a newer one is available.</li>
          </ul>
        )}
    </Panel>
  );
}

const lab = (s?: string | null) => (s ? s.replace(/_/g, " ") : "");

/** Everything this quote connects to, each with a link to where it lives. Display only. */
export function LinkedRecords({ quoteId }: { quoteId: string | null }) {
  const load = useServerFn(getSalesLinkedRecords);
  const q = useQuery({ queryKey: ["sales-linked", quoteId], queryFn: () => load({ data: { id: quoteId! } }), enabled: !!quoteId });
  if (!quoteId) return <Panel title="Linked records"><p className="text-sm text-muted-foreground">Link a quote to connect the SOW, invoice and deal.</p></Panel>;
  const d = q.data;
  const row = (label: string, value: React.ReactNode, status?: React.ReactNode) => (
    <li className="flex items-center justify-between gap-2 py-1.5"><span className="text-muted-foreground">{label}</span><span className="flex min-w-0 items-center gap-2 text-right">{value}{status}</span></li>
  );
  return (
    <Panel title="Linked records">
      {!d ? <p className="text-sm text-muted-foreground">{q.error ? (q.error as Error).message : "Loading…"}</p> : (
        <ul className="divide-y text-sm">
          {row("Quote", <Link to="/sales/quotes/$id" params={{ id: d.quote.id }} className="font-medium hover:underline">Q-{d.quote.quote_number} v{d.quote.version}</Link>, <Badge variant="outline">{lab(d.quote.status)}</Badge>)}
          {row("Client", d.client ? <Link to="/admin/contracts/$clientId" params={{ clientId: d.client.id }} className="truncate font-medium hover:underline">{d.client.legal_name}</Link> : <span>Not linked</span>)}
          {row("Deal", d.deal ? <Link to="/sales/crm" className="truncate font-medium hover:underline">{d.deal.title}</Link> : <span>Not linked</span>, d.deal && <Badge variant="outline">{lab(d.deal.sales_stage ?? d.deal.stage)}</Badge>)}
          {row("SOW", d.sow ? <Link to="/admin/agreements" className="font-medium hover:underline">Statement of work</Link> : <span>Not created</span>, d.sow && <Badge variant="outline">{d.sow.executed_at ? "Executed" : d.sow.client_signed_at ? "Client signed" : lab(d.sow.status)}</Badge>)}
          {d.invoices.length ? d.invoices.map((i: any) => row("Invoice", <Link to="/admin/invoices" className="font-medium hover:underline">{i.number ?? "Draft"} · {money(i.total_cents)}</Link>, <Badge variant={i.paid_on ? "default" : "outline"}>{i.paid_on ? "Paid" : lab(i.status)}</Badge>)) : row("Invoice", <span>Created when the client signs</span>)}
        </ul>
      )}
    </Panel>
  );
}

/** One place for a record's actions: primary on the left, exports on the right. */
export function ActionBar({ children, secondary }: { children: React.ReactNode; secondary?: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card/95 p-2 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      {secondary && <div className="flex flex-wrap items-center gap-2">{secondary}</div>}
    </div>
  );
}
