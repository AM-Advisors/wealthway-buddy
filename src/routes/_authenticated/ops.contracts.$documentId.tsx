import { useEffect, useState } from "react";
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
  applyContractPricing,
  approveContractTerms,
  getContractReview,
  rereadContract,
  reviewTerm,
  updateContractDocument,
} from "@/lib/contract-intake.functions";
import { RELATIONSHIP_TYPES } from "@/lib/contract-intelligence";
import { docLabel, parseMoneyToCents, PRICE_INPUT_MESSAGE, relatedDocumentOptions } from "@/lib/contract-coverage";
import { decideContractRelationship, recordContractRelationship, retireContractRelationship } from "@/lib/contract-intelligence.functions";

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
  const applyPricing = useServerFn(applyContractPricing);

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
          {doc.review_status === "approved" && d.mayConfigurePricing && !doc.applied_at && (
            <Button variant="outline" onClick={() => act(() => applyPricing({ data: { documentId } }), "Contract pricing applied")}>Apply contract pricing</Button>
          )}
          {editable && doc.source !== "standard_template" && <Button variant="outline" onClick={() => act(() => reread({ data: { documentId } }), "Re-read")}>Re-read terms</Button>}
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
              <Sel label="Execution" disabled={!editable || !d.mayConfirmExecution} value={doc.execution_status}
                options={[["needs_review", "Not confirmed"], ["executed_confirmed", "Fully executed — I checked every signature"], ["not_executed", "Not executed"]]}
                onChange={(v) => act(() => updateDoc({ data: { documentId, executionStatus: v as any } }), "Saved")} />
              <PrecedenceField doc={doc} disabled={!editable || !d.mayReviewPrecedence}
                onSave={(status, note, source) => act(() => updateDoc({ data: { documentId, precedenceStatus: status as any, precedenceNote: note, precedenceSource: source } }), "Precedence recorded")} />
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
              <div className="sm:col-span-2">
                <p className="mb-1 font-medium">Applies to services</p>
                <div className="flex flex-wrap gap-3">
                  {d.services.map((s: any) => {
                    const keys: string[] = doc.applies_to_service_keys ?? [];
                    return (
                      <label key={s.key} className="flex items-center gap-1">
                        <input type="checkbox" disabled={!editable} checked={keys.includes(s.key)}
                          onChange={(e) => act(() => updateDoc({ data: { documentId, appliesToServiceKeys: e.target.checked ? [...keys, s.key] : keys.filter((x) => x !== s.key) } }), "Saved")} />
                        {s.name}
                      </label>
                    );
                  })}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Nothing ticked = all contracted services.</p>
              </div>
            </CardContent>
          </Card>

          <RelationshipsCard d={d} documentId={documentId} onDone={refresh} />

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
    const amountCents = amount.trim() ? parseMoneyToCents(amount) : null;
    if (isPricing && amount.trim() && amountCents == null) { toast.error(PRICE_INPUT_MESSAGE); return; }
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

function PrecedenceField({ doc, disabled, onSave }: { doc: any; disabled: boolean; onSave: (status: string, note: string | null, source: string | null) => void }) {
  const [status, setStatus] = useState<string>(doc.precedence_status);
  const [note, setNote] = useState<string>(doc.precedence_note ?? "");
  const [source, setSource] = useState("");
  return (
    <div className="space-y-1 sm:col-span-2">
      <span className="font-medium">Precedence (decided by a person, never by AI)</span>
      <select disabled={disabled} className="h-10 w-full rounded-md border bg-background px-3" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="requires_review">Precedence requires review</option>
        <option value="confirmed">Confirmed by reviewer</option>
        <option value="not_applicable">Not applicable</option>
      </select>
      {!disabled && (
        <>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason / determination (required to confirm)" />
          <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Source provision, e.g. MSA §14.2" />
          <Button size="sm" variant="outline" onClick={() => onSave(status, note.trim() || null, source.trim() || null)}>Record precedence</Button>
        </>
      )}
    </div>
  );
}

function RelationshipsCard({ d, documentId, onDone }: { d: any; documentId: string; onDone: () => void }) {
  const record = useServerFn(recordContractRelationship);
  const retire = useServerFn(retireContractRelationship);
  const decide = useServerFn(decideContractRelationship);
  const initialType = d.doc.doc_type === "sow" ? "sow_governed_by_msa" : d.doc.doc_type === "msa" ? "msa_governs_sow" : d.doc.doc_type === "pricing_schedule" ? "fee_schedule_supplements" : "amends";
  const [type, setType] = useState<string>(initialType);
  const rel = relatedDocumentOptions(d.doc, d.related, type);
  const [related, setRelated] = useState<string>(rel.defaultId ?? "");
  useEffect(() => { setRelated(relatedDocumentOptions(d.doc, d.related, type).defaultId ?? ""); }, [type, d.doc.id]);
  const [provision, setProvision] = useState("");
  const [scope, setScope] = useState<"client_wide" | "fund" | "service" | "provision">("client_wide");
  const [fund, setFund] = useState("");
  const [svc, setSvc] = useState("");
  const [reason, setReason] = useState("");
  const [source, setSource] = useState("");
  const titleOf = (id: string | null) => (id === documentId ? d.doc.title : d.related.find((x: any) => x.id === id)?.title ?? "—");
  const typeLabel = (t: string) => RELATIONSHIP_TYPES.find((r) => r.value === t)?.label ?? t;
  const submit = async () => {
    try {
      await record({ data: { documentId, relatedDocumentId: related || null, relationshipType: type as any, scope, offeringIds: scope === "fund" && fund ? [fund] : [], serviceKeys: scope === "service" && svc ? [svc] : [], reason: reason || null, sourceReference: source || null, provisionReference: scope === "provision" ? provision || null : null } });
      toast.success("Relationship recorded — awaiting approval by a different reviewer"); setReason(""); setSource(""); onDone();
    } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Relationships & precedence history</CardTitle>
        <CardDescription>For: <span className="font-medium text-foreground">{docLabel(d.doc)}</span>. Recorded by one reviewer, approved by another. Previous determinations are kept permanently.</CardDescription></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {d.relationships.length === 0 ? <p className="text-muted-foreground">No relationships recorded.</p> : (
          <ul className="space-y-1">
            {d.relationships.map((r: any) => (
              <li key={r.id} className={r.status === "retired" ? "text-muted-foreground line-through" : ""}>
                {titleOf(r.document_id)} — {typeLabel(r.relationship_type)} {r.related_document_id ? titleOf(r.related_document_id) : ""} · {r.scope.replace("_", "-")}
                {r.provision_reference ? ` · provision ${r.provision_reference}` : ""}
                {r.reason ? ` · ${r.reason}` : ""}{r.source_reference ? ` (${r.source_reference})` : ""}
                {r.approval_status === "pending_approval" ? <Badge variant="secondary" className="ml-2">Awaiting approval</Badge> : r.approval_status === "rejected" ? <Badge variant="outline" className="ml-2">Rejected</Badge> : null}
                {r.status === "active" && r.approval_status === "pending_approval" && d.mayApprovePrecedence && r.recorded_by !== d.me ? (
                  <span className="ml-2 space-x-2 text-xs">
                    <button className="underline" onClick={async () => { try { await decide({ data: { id: r.id, approve: true } }); onDone(); } catch (e) { toast.error((e as Error).message); } }}>Approve</button>
                    <button className="underline" onClick={async () => { const n = window.prompt("Why reject?"); if (!n) return; try { await decide({ data: { id: r.id, approve: false, note: n } }); onDone(); } catch (e) { toast.error((e as Error).message); } }}>Reject</button>
                  </span>
                ) : null}
                {r.status === "active" && d.mayReviewPrecedence ? (
                  <button className="ml-2 text-xs underline" onClick={async () => {
                    const why = window.prompt("Why retire this relationship?");
                    if (!why) return;
                    try { await retire({ data: { id: r.id, reason: why } }); onDone(); } catch (e) { toast.error((e as Error).message); }
                  }}>Retire</button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {d.mayReviewPrecedence && (
          <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
            <select className="h-10 rounded-md border bg-background px-3" value={type} onChange={(e) => setType(e.target.value)}>
              {RELATIONSHIP_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <select className="h-10 rounded-md border bg-background px-3" value={related} onChange={(e) => setRelated(e.target.value)}>
              <option value="">{rel.options.length ? "Choose the related document…" : "No other documents for this client"}</option>
              {rel.options.map((o) => <option key={o.id} value={o.id}>{o.label}{o.suggested ? " (suggested)" : ""}</option>)}
            </select>
            {rel.hint ? <p className="text-xs text-muted-foreground sm:col-span-2">{rel.hint}</p> : null}
            <select className="h-10 rounded-md border bg-background px-3" value={scope} onChange={(e) => setScope(e.target.value as any)}>
              <option value="client_wide">Client-wide</option>
              <option value="fund">Only a Fund</option>
              <option value="service">Only a Service</option>
              <option value="provision">Only a Provision</option>
            </select>
            {scope === "fund" ? (
              <select className="h-10 rounded-md border bg-background px-3" value={fund} onChange={(e) => setFund(e.target.value)}>
                <option value="">Fund…</option>
                {d.offerings.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            ) : scope === "service" ? (
              <select className="h-10 rounded-md border bg-background px-3" value={svc} onChange={(e) => setSvc(e.target.value)}>
                <option value="">Service…</option>
                {d.services.map((s: any) => <option key={s.key} value={s.key}>{s.name}</option>)}
              </select>
            ) : scope === "provision" ? (
              <Input value={provision} onChange={(e) => setProvision(e.target.value)} placeholder="Provision (e.g. Section 4.2)" />
            ) : <span />}
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
            <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Source provision" />
            <Button size="sm" className="sm:col-span-2" onClick={submit}>Record relationship</Button>
          </div>
        )}
        {d.precedenceHistory.length > 0 && (
          <div className="space-y-1 text-xs text-muted-foreground">
            {d.precedenceHistory.map((h: any) => (
              <p key={h.id}>{new Date(h.decided_at).toLocaleString()} · precedence {h.previous_status} → {h.new_status}{h.note ? ` · ${h.note}` : ""}{h.source_reference ? ` (${h.source_reference})` : ""}</p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
