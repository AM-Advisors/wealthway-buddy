import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { GOVERNING_DOC_TYPES, noticeDeadline } from "@/lib/contract-ingestion";
import { listClientContracts, uploadContract } from "@/lib/contract-intake.functions";
import { ContractFamilyPanel } from "@/components/contract-family";

export const REVIEW_LABEL: Record<string, string> = {
  uploaded: "Uploaded",
  awaiting_review: "Contract uploaded — terms awaiting review",
  manual_review_required: "Document requires manual review",
  extraction_failed: "Reading failed — manual review",
  approved: "Approved",
  superseded: "Superseded",
};
export const EXEC_LABEL: Record<string, string> = {
  needs_review: "Execution not confirmed",
  executed_confirmed: "Fully executed (confirmed)",
  not_executed: "Not executed",
};
const typeLabel = (v: string) => GOVERNING_DOC_TYPES.find((d) => d.value === v)?.label ?? v;
const money = (c: number | null | undefined) =>
  c == null ? "—" : `$${(c / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function UploadContractForm({
  clientId,
  parentDocumentId,
  supersedesId,
  defaultType = "msa",
  onDone,
}: {
  clientId: string;
  parentDocumentId?: string | null;
  supersedesId?: string | null;
  defaultType?: string;
  onDone?: (documentId: string) => void;
}) {
  const upload = useServerFn(uploadContract);
  const [docType, setDocType] = useState(defaultType);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!file) {
      toast.error("Choose a PDF or Word file.");
      return;
    }
    setBusy(true);
    try {
      const base64 = await fileToBase64(file);
      const res = await upload({
        data: {
          clientId,
          docType,
          title: title || file.name.replace(/\.(pdf|docx)$/i, ""),
          filename: file.name,
          mimeType: file.type,
          base64,
          parentDocumentId: parentDocumentId ?? null,
          supersedesId: supersedesId ?? null,
        },
      });
      toast.success(
        res.duplicate ? "This exact file was already uploaded — opening it." : "Uploaded. Terms are ready for review.",
      );
      onDone?.(res.documentId);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <Label htmlFor="doc-type">Document type</Label>
        <select
          id="doc-type"
          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          value={docType}
          onChange={(e) => setDocType(e.target.value)}
        >
          {GOVERNING_DOC_TYPES.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="doc-title">Title</Label>
        <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. MSA 2024" />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="doc-file">File (PDF or .docx, up to 25 MB)</Label>
        <Input
          id="doc-file"
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <p className="text-xs text-muted-foreground">
          The original is kept unchanged. Terms read from it stay proposals until someone approves them.
        </p>
      </div>
      <div className="sm:col-span-2">
        <Button onClick={submit} disabled={busy}>
          {busy ? "Uploading and reading…" : "Upload contract"}
        </Button>
      </div>
    </div>
  );
}

export function ClientContractsPanel({ clientId }: { clientId: string }) {
  const load = useServerFn(listClientContracts);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [uploading, setUploading] = useState<null | { parent?: string; supersedes?: string; type: string }>(null);
  const q = useQuery({ queryKey: ["client-contracts", clientId], queryFn: () => load({ data: { clientId } }) });
  if (q.isPending) return <Skeleton className="h-40 w-full" />;
  if (q.error) return <p className="text-sm text-muted-foreground">{(q.error as Error).message}</p>;
  const d = q.data as any;
  const current = d.documents.find(
    (x: any) => x.review_status === "approved" && (x.doc_type === "msa" || x.doc_type === "engagement"),
  );
  const fundName = (id: string) => d.offerings.find((o: any) => o.id === id)?.name ?? "Fund";
  const contractPricing = d.pricing.filter((p: any) => p.pricing_source === "contract" && !p.superseded_at);
  const deadline = current ? noticeDeadline(current.expiration_date, current.notice_days) : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Current agreement</CardTitle>
            <CardDescription>
              {current
                ? `${current.title} · effective ${current.effective_date ?? "—"}${current.expiration_date ? ` · expires ${current.expiration_date}` : ""}${current.notice_days != null ? ` · ${current.notice_days}-day notice` : ""}${deadline ? ` · notice deadline ${deadline}` : ""}`
                : "No approved master agreement yet."}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {d.mayUpload ? (
              <Button size="sm" onClick={() => setUploading({ type: "msa" })}>
                Import Existing Agreement
              </Button>
            ) : null}
            {d.mayGenerateStandard ? (
              <Button asChild size="sm" variant="outline">
                <Link to="/ops/contracts/standard" search={{ clientId }}>Use Harmonious Standard Agreement</Link>
              </Button>
            ) : null}
          </div>
        </CardHeader>
        {uploading ? (
          <CardContent>
            <UploadContractForm
              clientId={clientId}
              defaultType={uploading.type}
              parentDocumentId={uploading.parent ?? null}
              supersedesId={uploading.supersedes ?? null}
              onDone={(id) => {
                setUploading(null);
                qc.invalidateQueries({ queryKey: ["client-contracts", clientId] });
                navigate({ to: "/ops/contracts/$documentId", params: { documentId: id } });
              }}
            />
          </CardContent>
        ) : null}
      </Card>

      {d.documents.length ? <ContractFamilyPanel clientId={clientId} /> : null}

      {d.documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">No governing documents uploaded.</p>
      ) : (
        <div className="space-y-3">
          {d.documents.map((doc: any) => (
            <Card key={doc.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    {doc.title}{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      · {typeLabel(doc.doc_type)} · v{doc.version}
                    </span>
                  </CardTitle>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant={doc.review_status === "approved" ? "default" : "secondary"}>
                      {REVIEW_LABEL[doc.review_status] ?? doc.review_status}
                    </Badge>
                    <Badge variant="outline">{EXEC_LABEL[doc.execution_status]}</Badge>
                  </div>
                </div>
                <CardDescription>
                  Effective {doc.effective_date ?? "—"} · applies to{" "}
                  {doc.applies_to_offering_ids.length
                    ? doc.applies_to_offering_ids.map(fundName).join(", ")
                    : "the whole client"}
                  {doc.parent_document_id
                    ? ` · amends ${d.documents.find((x: any) => x.id === doc.parent_document_id)?.title ?? "an earlier agreement"}`
                    : ""}
                  {doc.precedence_status === "requires_review" ? " · Precedence requires review" : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {doc.alerts.length ? (
                  <div className="flex flex-wrap gap-1">
                    {doc.alerts.map((a: any) => (
                      <Badge key={a.kind} variant="destructive">
                        {a.title}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                {doc.keyTerms.length ? (
                  <ul className="text-sm">
                    {doc.keyTerms.map((t: any) => (
                      <li key={t.term_key}>
                        <span className="text-muted-foreground">{t.label}:</span> {t.current_value ?? "Not found"}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link to="/ops/contracts/$documentId" params={{ documentId: doc.id }}>
                      {doc.review_status === "approved" || doc.review_status === "superseded"
                        ? "View Original & Approved Terms"
                        : "Review terms"}
                    </Link>
                  </Button>
                  {doc.parent_document_id || doc.supersedes_id ? (
                    <Button asChild size="sm" variant="outline">
                      <Link to="/ops/contracts/compare" search={{ before: doc.supersedes_id ?? doc.parent_document_id, after: doc.id }}>
                        Compare Versions
                      </Link>
                    </Button>
                  ) : null}
                  {doc.source === "standard_template" ? (
                    <Button asChild size="sm" variant="outline">
                      <Link to="/ops/contracts/standard" search={{ clientId, draftId: doc.id }}>Standard agreement status</Link>
                    </Button>
                  ) : null}
                  {d.mayUpload && doc.review_status === "approved" ? (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setUploading({ parent: doc.id, type: "amendment" })}>
                        Upload Amendment
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setUploading({ parent: doc.id, type: "sow" })}>
                        Upload New SOW
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setUploading({ supersedes: doc.id, type: doc.doc_type })}>
                        Upload New Version
                      </Button>
                    </>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {d.mayViewPricing ? <Card>
        <CardHeader>
          <CardTitle className="text-base">Client contract pricing</CardTitle>
          <CardDescription>
            From approved contracts only. Standard Harmonious pricing is kept separately and never overrides these.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {contractPricing.length === 0 ? (
            <p className="text-sm text-muted-foreground">No contract-specific pricing yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {contractPricing.map((p: any) => (
                <li key={p.id} className="flex flex-wrap justify-between gap-2">
                  <span>
                    {p.label}{" "}
                    <Badge variant="outline" className="ml-1">
                      Contract-specific pricing
                    </Badge>
                    {p.offering_id ? (
                      <span className="ml-1 text-muted-foreground">· {fundName(p.offering_id)} only</span>
                    ) : null}
                  </span>
                  <span>
                    {money(p.contracted_cents)}{" "}
                    <span className="text-muted-foreground">
                      (standard {money(p.standard_cents)}) · from {p.effective_date ?? "—"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card> : null}
    </div>
  );
}

export function ClientContactsPanel({ clientId }: { clientId: string }) {
  const load = useServerFn(listClientContracts);
  const q = useQuery({ queryKey: ["client-contracts", clientId], queryFn: () => load({ data: { clientId } }) });
  if (q.isPending) return <Skeleton className="h-40 w-full" />;
  if (q.error) return <p className="text-sm text-muted-foreground">{(q.error as Error).message}</p>;
  const d = q.data as any;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Contact designations are for reference only — they never give anyone access or signing authority in Harmonious.
      </p>
      {d.contacts.length === 0 ? <p className="text-sm text-muted-foreground">No contacts recorded.</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {d.contacts.map((c: any) => (
          <Card key={c.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{c.full_name}</CardTitle>
              <CardDescription>{[c.title, c.email, c.phone].filter(Boolean).join(" · ") || "—"}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1">
              {(c.designations ?? []).map((x: string) => (
                <Badge key={x} variant="secondary">
                  {x}
                </Badge>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
      {d.mayUpload ? (
        <Button asChild size="sm" variant="outline">
          <Link to="/ops/clients/new" search={{ id: clientId, step: 2 }}>
            Edit contacts
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
