import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { staffTaxEvidenceFn } from "@/lib/onboarding-compliance.functions";
import {
  createPolicyDraftFn,
  createWordingDraftFn,
  decidePolicyEntryFn,
  decideWordingFn,
  listCompliancePolicyFn,
  listLegalWordingFn,
  staffTaxReviewListFn,
} from "@/lib/onboarding-ops.functions";

export const Route = createFileRoute("/_authenticated/ops/tax-review")({
  head: () => ({
    meta: [
      { title: "Investor tax review — Harmonious Operations" },
      { name: "description", content: "Tax classification, IRS form status, compliance policy and approved legal wording for investor onboarding." },
      { property: "og:title", content: "Investor tax review — Harmonious Operations" },
      { property: "og:description", content: "Masked tax status with audited access to signed IRS forms." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: TaxReviewPage,
});

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : "—");

function TaxReviewPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground">Investor tax & compliance setup</h1>
        <p className="text-sm text-muted-foreground">Each tab re-checks your permissions on every request.</p>
      </div>
      <Tabs defaultValue="tax">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="tax">Investor tax review</TabsTrigger>
          <TabsTrigger value="policy">Compliance policy</TabsTrigger>
          <TabsTrigger value="wording">Legal wording</TabsTrigger>
        </TabsList>
        <TabsContent value="tax"><TaxList /></TabsContent>
        <TabsContent value="policy"><PolicyBoard /></TabsContent>
        <TabsContent value="wording"><WordingBoard /></TabsContent>
      </Tabs>
    </div>
  );
}

function ErrorNote({ error }: { error: unknown }) {
  return <p className="rounded-md border border-border bg-muted p-4 text-sm text-muted-foreground">{(error as Error)?.message ?? "Not available."}</p>;
}

function TaxList() {
  const list = useServerFn(staffTaxReviewListFn);
  const evidence = useServerFn(staffTaxEvidenceFn);
  const q = useQuery({ queryKey: ["ops-tax-review"], queryFn: () => list(), retry: false });
  const [tin, setTin] = useState<Record<string, string>>({});
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error) return <ErrorNote error={q.error} />;
  const canSensitive = q.data!.permissions.includes("access_sensitive_tax_records");

  const open = async (taxFormId: string, kind: "document" | "tin") => {
    const purpose = window.prompt(kind === "tin" ? "Reason for viewing the full tax ID (logged):" : "Reason for opening the signed form (logged):");
    if (!purpose || purpose.trim().length < 5) return;
    try {
      const r: any = await evidence({ data: { taxFormId, kind, purpose } });
      if (kind === "document" && r.url) window.open(r.url, "_blank", "noopener");
      if (kind === "tin" && r.tin) {
        setTin((s) => ({ ...s, [taxFormId]: r.tin }));
        setTimeout(() => setTin((s) => { const n = { ...s }; delete n[taxFormId]; return n; }), 30000);
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (!q.data!.rows.length) return <p className="text-sm text-muted-foreground">No investor tax records yet.</p>;
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[880px] text-sm">
        <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
          <tr>{["Investor / profile", "Classification", "Required form", "Status", "Revision", "Signed", "Refresh by", "Tax ID", "Review", ""].map((h) => <th key={h} className="p-2">{h}</th>)}</tr>
        </thead>
        <tbody>
          {q.data!.rows.map((r) => (
            <tr key={r.profileId} className="border-t border-border align-top">
              <td className="p-2"><div className="font-medium text-foreground">{r.profileName}</div><div className="text-xs text-muted-foreground">{r.profileType}</div></td>
              <td className="p-2">{r.classification ?? "—"}</td>
              <td className="p-2">{r.requiredForm ?? "—"}</td>
              <td className="p-2"><Badge variant="secondary">{r.formStatus}</Badge></td>
              <td className="p-2">{r.revision ?? "—"}</td>
              <td className="p-2">{fmt(r.signedAt)}</td>
              <td className="p-2">{r.expiresOn ? fmt(r.expiresOn) : "—"}</td>
              <td className="p-2 font-mono">{r.tinMasked ?? "—"}</td>
              <td className="p-2 text-xs">{r.reviewStatus}</td>
              <td className="space-y-1 p-2">
                {canSensitive && r.taxFormId && r.hasDocument && <Button size="sm" variant="outline" onClick={() => open(r.taxFormId!, "document")}>View Tax Form</Button>}
                {canSensitive && r.taxFormId && r.tinMasked && (
                  tin[r.taxFormId]
                    ? <div className="font-mono text-xs">{tin[r.taxFormId]}</div>
                    : <Button size="sm" variant="ghost" onClick={() => open(r.taxFormId!, "tin")}>Reveal tax ID</Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PolicyBoard() {
  const qc = useQueryClient();
  const list = useServerFn(listCompliancePolicyFn);
  const create = useServerFn(createPolicyDraftFn);
  const decide = useServerFn(decidePolicyEntryFn);
  const q = useQuery({ queryKey: ["ops-policy"], queryFn: () => list(), retry: false });
  const [f, setF] = useState({ kind: "high_risk_jurisdiction", countryCode: "", riskClassification: "", threshold: "", effectiveDate: "", sourceReference: "", reason: "" });
  const save = useMutation({
    mutationFn: () => create({ data: {
      kind: f.kind as any, scope: "global",
      countryCode: f.kind === "high_risk_jurisdiction" ? f.countryCode : null,
      riskClassification: f.kind === "high_risk_jurisdiction" ? f.riskClassification : null,
      thresholdCents: f.kind === "edd_amount_threshold" ? Math.round(Number(f.threshold) * 100) : null,
      currency: f.kind === "edd_amount_threshold" ? "USD" : null,
      effectiveDate: f.effectiveDate, sourceReference: f.sourceReference, reason: f.reason || null,
    } }),
    onSuccess: () => { toast.success("Draft saved. A different person must approve it."); qc.invalidateQueries({ queryKey: ["ops-policy"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const act = useMutation({
    mutationFn: (v: { id: string; action: "approve" | "retire" }) => decide({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops-policy"] }),
    onError: (e) => toast.error((e as Error).message),
  });
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error) return <ErrorNote error={q.error} />;
  const approved = (q.data!.entries as any[]).filter((e) => e.status === "approved");
  return (
    <div className="space-y-6">
      {!approved.length && <p className="rounded-md border border-border bg-muted p-3 text-sm">No approved policy. No country is treated as high risk and no amount triggers extra checks.</p>}
      <div className="grid gap-2 rounded-md border border-border p-4 md:grid-cols-3">
        <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
          <option value="high_risk_jurisdiction">High-risk jurisdiction</option>
          <option value="edd_amount_threshold">Enhanced-review amount threshold (USD)</option>
        </select>
        {f.kind === "high_risk_jurisdiction" ? (
          <>
            <Input placeholder="Country code (e.g. XX)" maxLength={2} value={f.countryCode} onChange={(e) => setF({ ...f, countryCode: e.target.value })} />
            <Input placeholder="Risk classification" value={f.riskClassification} onChange={(e) => setF({ ...f, riskClassification: e.target.value })} />
          </>
        ) : (
          <Input placeholder="Threshold amount (USD)" inputMode="decimal" value={f.threshold} onChange={(e) => setF({ ...f, threshold: e.target.value })} />
        )}
        <Input type="date" value={f.effectiveDate} onChange={(e) => setF({ ...f, effectiveDate: e.target.value })} />
        <Input placeholder="Source / policy reference" value={f.sourceReference} onChange={(e) => setF({ ...f, sourceReference: e.target.value })} />
        <Input placeholder="Reason (optional)" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
        <Button onClick={() => save.mutate()} disabled={save.isPending}>Save draft</Button>
      </div>
      <PolicyTable rows={q.data!.entries as any[]} canApprove={q.data!.canApprove} me={q.data!.me} onAct={(id, action) => act.mutate({ id, action })} />
    </div>
  );
}

function PolicyTable({ rows, canApprove, me, onAct }: { rows: any[]; canApprove: boolean; me: string; onAct: (id: string, a: "approve" | "retire") => void }) {
  if (!rows.length) return null;
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-muted text-left text-xs uppercase text-muted-foreground"><tr>{["Rule", "Effective", "Source", "Status", ""].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} className="border-t border-border">
              <td className="p-2">{e.kind === "high_risk_jurisdiction" ? `${e.country_code} — ${e.risk_classification}` : `≥ ${(Number(e.threshold_cents) / 100).toLocaleString()} ${e.currency}`}</td>
              <td className="p-2">{e.effective_date}</td>
              <td className="p-2 text-xs">{e.source_reference}</td>
              <td className="p-2"><Badge variant="secondary">{e.status}</Badge></td>
              <td className="p-2">
                {canApprove && e.status === "draft" && e.created_by !== me && <Button size="sm" onClick={() => onAct(e.id, "approve")}>Approve</Button>}
                {canApprove && e.status === "approved" && <Button size="sm" variant="outline" onClick={() => onAct(e.id, "retire")}>Retire</Button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const WORDING_OPTIONS = [
  { key: "bad_actor_questionnaire", label: "Bad Actor questionnaire" },
  { key: "certification:accuracy", label: "Certification — accuracy" },
  { key: "certification:authority_capacity", label: "Certification — authority & capacity" },
  { key: "certification:electronic_records", label: "Certification — electronic records" },
  { key: "certification:privacy_terms", label: "Certification — privacy & terms" },
  { key: "certification:offering_representations", label: "Certification — offering representations" },
];

function WordingBoard() {
  const qc = useQueryClient();
  const list = useServerFn(listLegalWordingFn);
  const create = useServerFn(createWordingDraftFn);
  const decide = useServerFn(decideWordingFn);
  const q = useQuery({ queryKey: ["ops-wording"], queryFn: () => list(), retry: false });
  const [f, setF] = useState({ requirementKey: WORDING_OPTIONS[0]!.key, title: "", wording: "", effectiveDate: "" });
  const save = useMutation({
    mutationFn: () => create({ data: f }),
    onSuccess: () => { toast.success("Draft saved. Legal must approve it before investors see it."); qc.invalidateQueries({ queryKey: ["ops-wording"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const act = useMutation({
    mutationFn: (v: { id: string; action: "approve" | "retire" }) => decide({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops-wording"] }),
    onError: (e) => toast.error((e as Error).message),
  });
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error) return <ErrorNote error={q.error} />;
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">Enter wording exactly as approved by counsel. Investors only ever see approved versions; records already certified keep the version they certified.</p>
      <div className="grid gap-2 rounded-md border border-border p-4">
        <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={f.requirementKey} onChange={(e) => setF({ ...f, requirementKey: e.target.value })}>
          {WORDING_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <Input placeholder="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <Textarea rows={6} placeholder="Exact approved wording" value={f.wording} onChange={(e) => setF({ ...f, wording: e.target.value })} />
        <Input type="date" value={f.effectiveDate} onChange={(e) => setF({ ...f, effectiveDate: e.target.value })} />
        <Button onClick={() => save.mutate()} disabled={save.isPending}>Save draft</Button>
      </div>
      {(q.data!.rows as any[]).map((w) => (
        <div key={w.id} className="rounded-md border border-border p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{w.title}</span>
            <Badge variant="secondary">{w.requirement_key} v{w.version}</Badge>
            <Badge>{w.status}</Badge>
            <span className="text-xs text-muted-foreground">effective {w.effective_date}</span>
            <span className="ml-auto flex gap-2">
              {q.data!.canApprove && w.status === "draft" && w.created_by !== q.data!.me && <Button size="sm" onClick={() => act.mutate({ id: w.id, action: "approve" })}>Approve</Button>}
              {q.data!.canApprove && w.status === "approved" && <Button size="sm" variant="outline" onClick={() => act.mutate({ id: w.id, action: "retire" })}>Retire</Button>}
            </span>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{w.wording}</p>
        </div>
      ))}
    </div>
  );
}
