import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EXEC_LABEL, REVIEW_LABEL } from "@/components/client-contracts";
import {
  approveContractTerms,
  getContractReview,
  rereadContract,
  reviewTerm,
  updateContractDocument,
} from "@/lib/contract-intake.functions";

export const Route = createFileRoute("/_authenticated/ops/contracts/$documentId")({
  head: () => ({
    meta: [
      { title: "Contract review — Harmonious operations" },
      { name: "description", content: "Compare extracted contract terms with the original and approve them." },
      { property: "og:title", content: "Contract review — Harmonious operations" },
      { property: "og:description", content: "Human review of contract terms before they take effect." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ContractReview,
});

const STATUS: Record<string, string> = { needs_review: "Needs Review", confirmed: "Confirmed", corrected: "Corrected", not_applicable: "Not Applicable" };

function ContractReview() {
  const { documentId } = Route.useParams();
  const load = useServerFn(getContractReview);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["contract-review", documentId], queryFn: () => load({ data: { documentId } }) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["contract-review", documentId] });
  const updateDoc = useServerFn(updateContractDocument);
  const approve = useServerFn(approveContractTerms);
  const reread = useServerFn(rereadContract);

  if (q.isPending) return <Skeleton className="m-6 h-96" />;
  if (q.error) return <p className="p-6 text-sm text-muted-foreground">{(q.error as Error).message}</p>;
  const d = q.data as any;
  const doc = d.doc;
  const locked = doc.review_status === "approved" || doc.review_status === "superseded";
  const editable = d.mayEdit && !locked;
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.success(ok); refresh(); } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="space-y-4 px-4 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/ops/clients/$clientId" params={{ clientId: doc.client_id }} search={{ tab: "contracts" } as any} className="text-sm text-muted-foreground underline">← {d.client?.name}</Link>
          <h1 className="text-2xl">{doc.title} <span className="text-base text-muted-foreground">v{doc.version}</span></h1>
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge>{REVIEW_LABEL[doc.review_status]}</Badge>
            <Badge variant="outline">{EXEC_LABEL[doc.execution_status]}</Badge>
            <Badge variant="outline">SHA-256 {String(doc.sha256).slice(0, 12)}…</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          {editable && <Button variant="outline" onClick={() => act(() => reread({ data: { documentId } }), "Re-read")}>Re-read terms</Button>}
          {d.mayApprove && !locked && (
            <Button disabled={d.blockers.length > 0} onClick={() => act(() => approve({ data: { documentId } }), "Contract terms approved and applied")}>Approve Contract Terms</Button>
          )}
        </div>
      </div>
      {!locked && d.blockers.length > 0 && (
        <p className="text-sm text-muted-foreground">Before approval: {d.blockers.join(" ")}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="lg:sticky lg:top-4 lg:self-start">
          <CardHeader><CardTitle className="text-base">Original document</CardTitle>
            <CardDescription>{doc.original_filename} · uploaded {new Date(doc.uploaded_at).toLocaleDateString()}</CardDescription></CardHeader>
          <CardContent>
            {d.fileUrl && doc.mime_type === "application/pdf" ? (
              <iframe title="Original contract" src={d.fileUrl} className="h-[75vh] w-full rounded border" />
            ) : d.fileUrl ? (
              <Button asChild variant="outline"><a href={d.fileUrl} target="_blank" rel="noreferrer">Open original (link expires in 5 minutes)</a></Button>
            ) : <p className="text-sm text-muted-foreground">Unavailable.</p>}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Document details</CardTitle>
              <CardDescription>Execution and precedence are always decided by a person.</CardDescription></CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
              <Sel label="Execution" disabled={!editable} value={doc.execution_status}
                options={[["needs_review", "Not confirmed"], ["executed_confirmed", "Fully executed — I checked every signature"], ["not_executed", "Not executed"]]}
                onChange={(v) => act(() => updateDoc({ data: { documentId, executionStatus: v as any } }), "Saved")} />
              <Sel label="Precedence" disabled={!editable} value={doc.precedence_status}
                options={[["requires_review", "Precedence requires review"], ["confirmed", "Confirmed from clause"], ["not_applicable", "Not applicable"]]}
                onChange={(v) => act(() => updateDoc({ data: { documentId, precedenceStatus: v as any } }), "Saved")} />
              <DateField label="Effective date" disabled={!editable} value={doc.effective_date} onSave={(v) => act(() => updateDoc({ data: { documentId, effectiveDate: v } }), "Saved")} />
              <DateField label="Expiration" disabled={!editable} value={doc.expiration_date} onSave={(v) => act(() => updateDoc({ data: { documentId, expirationDate: v } }), "Saved")} />
              <div className="sm:col-span-2">
                <p className="mb-1 font-medium">Applies to</p>
                {d.offerings.length === 0 ? <p className="text-muted-foreground">Whole client (no funds linked).</p> : (
                  <div className="flex flex-wrap gap-3">
                    {d.offerings.map((o: any) => (
                      <label key={o.id} className="flex items-center gap-1">
                        <input type="checkbox" disabled={!editable} checked={doc.applies_to_offering_ids.includes(o.id)}
                          onChange={(e) => act(() => updateDoc({ data: { documentId, appliesToOfferingIds: e.target.checked ? [...doc.applies_to_offering_ids, o.id] : doc.applies_to_offering_ids.filter((x: string) => x !== o.id) } }), "Saved")} />
                        {o.name}
                      </label>
                    ))}
                  </div>
                )}
                <p className="mt-1 text-xs text-muted-foreground">Nothing ticked = whole client. A fund-specific SOW never applies to other funds.</p>
              </div>
            </CardContent>
          </Card>

          {doc.review_status === "manual_review_required" && (
            <Card><CardHeader><CardTitle className="text-base">Document requires manual review</CardTitle>
              <CardDescription>The text couldn't be read reliably (for example a scan). Nothing was extracted — enter terms from the original.</CardDescription></CardHeader></Card>
          )}

          {Object.entries(groupBy(d.terms)).map(([cat, terms]) => (
            <Card key={cat}>
              <CardHeader className="pb-2"><CardTitle className="text-base">{cat}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {(terms as any[]).map((t) => <TermRow key={t.id} t={t} editable={editable} services={d.services} onDone={refresh} />)}
              </CardContent>
            </Card>
          ))}

          {d.changes.length > 0 && (
            <Card><CardHeader><CardTitle className="text-base">Review history</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-xs text-muted-foreground">
                {d.changes.map((c: any) => (
                  <p key={c.id}>{new Date(c.changed_at).toLocaleString()} · {c.previous_status} → {c.new_status}{c.previous_value !== c.new_value ? ` · "${c.previous_value ?? "—"}" → "${c.new_value ?? "—"}"` : ""}{c.reason ? ` · ${c.reason}` : ""}</p>
                ))}
              </CardContent>
            </Card>
          )}
          {d.extractions[0] && <p className="text-xs text-muted-foreground">Read by {d.extractions[0].model} ({d.extractions[0].prompt_version}) · {d.extractions[0].status}</p>}
        </div>
      </div>
    </div>
  );
}

function groupBy(terms: any[]) {
  const out: Record<string, any[]> = {};
  for (const t of terms) (out[t.category] ??= []).push(t);
  return out;
}

function TermRow({ t, editable, services, onDone }: { t: any; editable: boolean; services: any[]; onDone: () => void }) {
  const review = useServerFn(reviewTerm);
  const [value, setValue] = useState<string>(t.current_value ?? "");
  const [amount, setAmount] = useState<string>(t.amount_cents != null ? String(t.amount_cents / 100) : "");
  const [svc, setSvc] = useState<string>(t.service_key ?? "");
  const [reason, setReason] = useState("");
  const isPricing = t.category === "Pricing";
  const save = async (status: string) => {
    const amountCents = amount.trim() ? Math.round(Number(amount) * 100) : null;
    try {
      await review({ data: { termId: t.id, status: status as any, value: value.trim() || null, amountCents: isPricing ? amountCents : undefined, serviceKey: isPricing ? svc || null : undefined, reason } });
      toast.success(STATUS[status]); onDone();
    } catch (e) { toast.error((e as Error).message); }
  };
  const ambiguous = t.basis === "inferred" || (t.basis === "explicit" && (t.confidence == null || t.confidence < 0.7));
  return (
    <div className="rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{t.label}{t.material ? " *" : ""}</span>
        <div className="flex gap-1">
          {t.basis === "not_found" ? <Badge variant="outline">Not Found</Badge> : <Badge variant="outline">{t.basis === "explicit" ? "Explicit" : "Inferred"}{t.confidence != null ? ` · ${Math.round(t.confidence * 100)}%` : ""}</Badge>}
          {ambiguous && t.status === "needs_review" && <Badge variant="destructive">Ambiguous</Badge>}
          <Badge variant={t.status === "needs_review" ? "secondary" : "default"}>{STATUS[t.status]}</Badge>
        </div>
      </div>
      {(t.source_page || t.source_section) && <p className="text-xs text-muted-foreground">Source: {t.source_page ? `page ${t.source_page}` : ""}{t.source_section ? ` · ${t.source_section}` : ""}</p>}
      {t.source_quote && <blockquote className="my-1 border-l-2 pl-2 text-xs italic text-muted-foreground">“{t.source_quote}”</blockquote>}
      {editable ? (
        <div className="mt-2 space-y-2">
          <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Not found" />
          {isPricing && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Exact amount (USD)" inputMode="decimal" />
              <select className="h-10 rounded-md border bg-background px-3" value={svc} onChange={(e) => setSvc(e.target.value)}>
                <option value="">Map to service…</option>
                {services.map((s: any) => <option key={s.key} value={s.key}>{s.name}</option>)}
              </select>
            </div>
          )}
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required when correcting)" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => save("confirmed")}>Confirm</Button>
            <Button size="sm" variant="outline" onClick={() => save("corrected")}>Save correction</Button>
            <Button size="sm" variant="ghost" onClick={() => save("not_applicable")}>Not applicable</Button>
          </div>
        </div>
      ) : (
        <p className="mt-1">{t.current_value ?? "Not found"}{t.amount_cents != null ? ` · $${(t.amount_cents / 100).toLocaleString()}` : ""}</p>
      )}
    </div>
  );
}

function Sel({ label, value, options, onChange, disabled }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <label className="space-y-1"><span className="font-medium">{label}</span>
      <select disabled={disabled} className="h-10 w-full rounded-md border bg-background px-3" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function DateField({ label, value, onSave, disabled }: { label: string; value: string | null; onSave: (v: string | null) => void; disabled?: boolean }) {
  return (
    <label className="space-y-1"><span className="font-medium">{label}</span>
      <Input type="date" disabled={disabled} defaultValue={value ?? ""} onBlur={(e) => { const v = e.target.value || null; if (v !== value) onSave(v); }} />
    </label>
  );
}
