import { DRIVE_LABELS } from "@/lib/drive-labels";
import { DRIVE_REQUIREMENTS, requirementLabel } from "@/lib/drive-requirements";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  browseDrive,
  getAssociationOptions,
  getDriveIntakeAccess,
  importDriveFiles,
  listDriveImports,
  assignDriveRequirement,
  linkDriveDocsToPacket,
  openDriveImport,
  listDriveDocumentInvestors,
  setDriveDocumentDetails,
} from "@/lib/drive-intake.functions";
import { FUND_DOCUMENT_KINDS, SIGNATURE_STATUSES, SIGNER_ROLES, SUGGESTED_SUBSCRIPTION_BOXES, TAX_FORMS, detailsLabel, detailsProblems, type DocumentDetails, type SignatureBox } from "@/lib/drive-document-details";
import {
  DOCUMENT_TYPES,
  EXECUTION_LABELS,
  RESTRICTED_EVIDENCE_MESSAGE,
  classificationWarning,
  documentTypeLabel,
  isRestrictedEvidence,
  rowProblems,
  type AssociationRow,
  type DocumentCategory,
} from "@/lib/drive-intake";
import { CLASSIFICATION_LABELS, DRIVE_CLASSIFICATIONS, type DriveRepository } from "@/lib/drive-policy";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Item = { ref: string; name: string; folder: boolean; mimeType: string; modifiedTime: string | null; alreadyImported: boolean; prefill: { offeringId: string | null; profileId: string | null; fundName: string | null } };
type Row = AssociationRow & { name: string; importAsNewVersion?: boolean; addAssociationToExisting?: boolean };

const sel = "h-9 w-full rounded-md border bg-background px-2 text-sm";

/** Import from Google Drive - Super Administrators only (checked again on the server). */
export function DriveImportButton({ offeringId, investorUserId, label = "Import from Google Drive" }: { offeringId?: string | undefined; investorUserId?: string | undefined; label?: string }) {
  const access = useServerFn(getDriveIntakeAccess);
  const q = useQuery({ queryKey: ["drive-intake-access"], queryFn: () => access(), retry: false });
  const [open, setOpen] = useState(false);
  if (!q.data?.allowed) return null;
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>{label}</Button>
      {open ? <DriveImportDialog onClose={() => setOpen(false)} repositories={q.data.repositories} offeringId={offeringId} investorUserId={investorUserId} /> : null}
    </>
  );
}

function DriveImportDialog({ onClose, repositories, offeringId, investorUserId }: { onClose: () => void; repositories: { key: DriveRepository; label: string; configured: boolean }[]; offeringId?: string | undefined; investorUserId?: string | undefined }) {
  const browse = useServerFn(browseDrive);
  const optionsFn = useServerFn(getAssociationOptions);
  const importFn = useServerFn(importDriveFiles);
  const qc = useQueryClient();
  const [repo, setRepo] = useState<DriveRepository>(repositories.find((r) => r.configured)?.key ?? repositories[0]?.key ?? "fund");
  const [folder, setFolder] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState<string | undefined>();
  const [picked, setPicked] = useState<Record<string, Item>>({});
  const [rows, setRows] = useState<Row[] | null>(null);
  const [results, setResults] = useState<any[] | null>(null);

  const listing = useQuery({
    queryKey: ["drive-browse", repo, folder, term, offeringId],
    queryFn: () => browse({ data: { repository: repo, folderId: folder, search: term, offeringId } }),
    enabled: repositories.find((r) => r.key === repo)?.configured ?? false,
    retry: false,
  });
  const options = useQuery({ queryKey: ["drive-assoc-options", investorUserId], queryFn: () => optionsFn({ data: { investorUserId } }) });

  const start = () => {
    const preProfile = investorUserId ? options.data?.investments ?? [] : [];
    setRows(
      Object.values(picked).map((it) => {
        const profileId = it.prefill.profileId ?? (preProfile.length === 1 ? preProfile[0].profileId : null);
        const off = it.prefill.offeringId ?? offeringId ?? (preProfile.length === 1 ? preProfile[0].offeringId : null);
        const category: DocumentCategory | null = profileId || repo === "investor" || investorUserId ? "investor" : repo === "fund" ? "fund" : null;
        return {
          name: it.name, driveFileId: it.ref, repository: repo, offeringId: off, profileId, category,
          documentType: null, classification: category === "fund" ? "fund_general" : null, recordStatus: null, documentDate: null, description: null,
        };
      }),
    );
  };

  const run = useMutation({
    mutationFn: (payload: Row[]) => importFn({ data: { rows: payload.map(({ name, ...r }) => r) as any } }),
    onSuccess: (r) => {
      setResults(r.results);
      const ok = r.results.filter((x: any) => x.ok).length;
      toast.success(`${ok} of ${r.results.length} file(s) done.`);
      void qc.invalidateQueries({ queryKey: ["drive-imports"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Import failed."),
  });

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs!.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const problems: string[][] = useMemo(() => (rows ?? []).map((r) => rowProblems(r, r.name)), [rows]);
  const readyIdx = problems.map((p, i) => (p.length ? -1 : i)).filter((i) => i >= 0);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rows ? "Associate Drive Files" : "Import from Google Drive"}</DialogTitle>
          <DialogDescription>
            Harmonious keeps its own copy; the Drive original is never moved, changed or deleted. Nothing is associated until you confirm each row.
          </DialogDescription>
        </DialogHeader>

        {!rows ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {repositories.map((r) => (
                <Button key={r.key} size="sm" variant={repo === r.key ? "default" : "outline"} disabled={!r.configured} onClick={() => { setRepo(r.key); setFolder(undefined); setTerm(undefined); setPicked({}); }}>
                  {r.label}{r.configured ? "" : " (not configured)"}
                </Button>
              ))}
            </div>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setTerm(search.trim() || undefined); }}>
              <Input placeholder="Search file names in this repository" value={search} onChange={(e) => setSearch(e.target.value)} />
              <Button type="submit" size="sm" variant="outline">Search</Button>
            </form>
            <div className="flex flex-wrap items-center gap-1 text-sm">
              <button className="text-primary hover:underline" onClick={() => { setFolder(undefined); setTerm(undefined); }}>Top</button>
              {(listing.data?.trail ?? []).map((t) => (
                <span key={t.id}> / <button className="text-primary hover:underline" onClick={() => { setFolder(t.id); setTerm(undefined); }}>{t.name}</button></span>
              ))}
            </div>
            {listing.isError ? <p className="text-sm text-destructive">{(listing.error as any)?.message}</p> : null}
            {listing.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
            <ul className="divide-y rounded-md border">
              {(listing.data?.items ?? []).map((it: Item) => {
                const restricted = !it.folder && isRestrictedEvidence(it.name);
                return (
                  <li key={it.ref} className="flex items-center gap-3 px-3 py-2 text-sm">
                    {it.folder ? (
                      <button className="flex-1 text-left font-medium hover:underline" onClick={() => { setFolder(it.ref); setTerm(undefined); }}>📁 {it.name}</button>
                    ) : (
                      <>
                        <Checkbox disabled={restricted} checked={Boolean(picked[it.ref])} onCheckedChange={(c) => setPicked((p) => { const n = { ...p }; if (c) n[it.ref] = it; else delete n[it.ref]; return n; })} />
                        <span className="flex-1">{it.name}</span>
                        {restricted ? <Badge variant="destructive">{RESTRICTED_EVIDENCE_MESSAGE}</Badge> : null}
                        {it.alreadyImported ? <Badge variant="secondary">Already in Harmonious</Badge> : null}
                        {it.prefill.fundName ? <Badge variant="outline">{it.prefill.fundName}</Badge> : null}
                        <span className="text-xs text-muted-foreground">{it.modifiedTime ? new Date(it.modifiedTime).toLocaleDateString() : ""}</span>
                      </>
                    )}
                  </li>
                );
              })}
              {listing.data && !listing.data.items.length ? <li className="px-3 py-4 text-sm text-muted-foreground">Nothing here.</li> : null}
            </ul>
            <div className="flex justify-end">
              <Button disabled={!Object.keys(picked).length} onClick={start}>Associate {Object.keys(picked).length || ""} file(s)</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr><th className="p-1">File</th><th className="p-1">Fund</th><th className="p-1">Investor / Profile</th><th className="p-1">Type</th><th className="p-1">Classification</th><th className="p-1">Status</th></tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const warning = r.classification ? classificationWarning(r.classification, r.repository) : null;
                    const invs = (options.data?.investments ?? []).filter((x: any) => x.offeringId === r.offeringId);
                    const result = results?.find((x: any) => x.driveFileId === r.driveFileId);
                    return (
                      <tr key={r.driveFileId} className="border-t align-top">
                        <td className="p-1 font-medium">
                          {r.name}
                          <textarea className="mt-1 w-full rounded-md border bg-background p-1 text-xs" placeholder="Description (optional)" value={r.description ?? ""} onChange={(e) => update(i, { description: e.target.value })} />
                        </td>
                        <td className="p-1">
                          <select className={sel} value={r.offeringId ?? ""} onChange={(e) => update(i, { offeringId: e.target.value || null, profileId: null, onboardingId: null })}>
                            <option value="">Choose Fund…</option>
                            {(options.data?.funds ?? []).map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
                          </select>
                          <select className={`${sel} mt-1`} value={r.category ?? ""} onChange={(e) => update(i, { category: (e.target.value || null) as any, documentType: null, profileId: e.target.value === "fund" ? null : r.profileId ?? null })}>
                            <option value="">Category…</option><option value="fund">Fund</option><option value="investor">Investor</option>
                          </select>
                        </td>
                        <td className="p-1">
                          {r.category === "investor" ? (
                            <select className={sel} value={r.onboardingId ?? invs.find((x: any) => x.profileId === r.profileId)?.onboardingId ?? ""} onChange={(e) => { const inv = invs.find((x: any) => x.onboardingId === e.target.value); update(i, { onboardingId: inv?.onboardingId ?? null, profileId: inv?.profileId ?? null }); }}>
                              <option value="">Choose profile / investment…</option>
                              {invs.map((x: any) => <option key={x.onboardingId} value={x.onboardingId}>{x.label}</option>)}
                            </select>
                          ) : <span className="text-xs text-muted-foreground">Not applicable</span>}
                        </td>
                        <td className="p-1">
                          <select className={sel} value={r.documentType ?? ""} disabled={!r.category} onChange={(e) => update(i, { documentType: e.target.value || null })}>
                            <option value="">Type…</option>
                            {r.category ? Object.entries(DOCUMENT_TYPES[r.category]).map(([k, v]) => <option key={k} value={k}>{v}</option>) : null}
                          </select>
                          <Input className="mt-1 h-9" type="date" value={r.documentDate ?? ""} onChange={(e) => update(i, { documentDate: e.target.value || null })} />
                        </td>
                        <td className="p-1">
                          <select className={sel} value={r.classification ?? ""} onChange={(e) => update(i, { classification: (e.target.value || null) as any, acknowledgeBroadSource: false })}>
                            <option value="">Classification…</option>
                            {DRIVE_CLASSIFICATIONS.map((c) => <option key={c} value={c}>{CLASSIFICATION_LABELS[c]}</option>)}
                          </select>
                          {warning ? (
                            <label className="mt-1 flex gap-1 text-xs text-destructive">
                              <input type="checkbox" checked={Boolean(r.acknowledgeBroadSource)} onChange={(e) => update(i, { acknowledgeBroadSource: e.target.checked })} />
                              {warning}
                            </label>
                          ) : null}
                        </td>
                        <td className="p-1">
                          <select className={sel} value={r.recordStatus ?? ""} onChange={(e) => update(i, { recordStatus: (e.target.value || null) as any, historicalExecuted: false })}>
                            <option value="">Status…</option><option value="historical">Existing historical record</option><option value="active">Current active document</option>
                          </select>
                          {r.recordStatus === "historical" ? (
                            <label className="mt-1 flex gap-1 text-xs"><input type="checkbox" checked={Boolean(r.historicalExecuted)} onChange={(e) => update(i, { historicalExecuted: e.target.checked })} />Historical executed document (not Box-verified)</label>
                          ) : null}
                          {problems[i]?.length ? <p className="mt-1 text-xs text-destructive">{problems[i]?.join(" ")}</p> : <Badge className="mt-1" variant="secondary">Ready</Badge>}
                          {result ? (
                            <div className="mt-1 text-xs">
                              {result.ok ? <Badge>{result.outcome === "new_version" ? "Imported as new version" : result.outcome === "associated" ? "Association added" : "Imported"}</Badge> : <p className="text-destructive">{result.message}</p>}
                              {result.outcome === "changed_source" ? <Button size="sm" variant="outline" className="mt-1" onClick={() => update(i, { importAsNewVersion: true })}>Import as New Version</Button> : null}
                              {result.outcome === "already_imported" && r.category === "investor" ? <Button size="sm" variant="outline" className="mt-1" onClick={() => update(i, { addAssociationToExisting: true })}>Add this association</Button> : null}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="ghost" onClick={() => { setRows(null); setResults(null); }}>Back to files</Button>
              <Button disabled={!readyIdx.length || run.isPending} onClick={() => run.mutate(readyIdx.map((i) => rows[i]!))}>
                {run.isPending ? "Importing…" : `Import ${readyIdx.length} ready row(s)`}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Rows with problems are skipped; fix them and import again. Each file succeeds or fails on its own.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Imported documents with provenance. Shown only to Super Administrators. */
export function DriveImportsCard({ offeringId, investorUserId }: { offeringId?: string | undefined; investorUserId?: string | undefined }) {
  const list = useServerFn(listDriveImports);
  const open = useServerFn(openDriveImport);
  const access = useServerFn(getDriveIntakeAccess);
  const a = useQuery({ queryKey: ["drive-intake-access"], queryFn: () => access(), retry: false });
  const q = useQuery({ queryKey: ["drive-imports", offeringId, investorUserId], queryFn: () => list({ data: { offeringId, investorUserId } }), enabled: Boolean(a.data?.allowed) });
  if (!a.data?.allowed) return null;
  const go = async (id: string, source?: boolean) => {
    try {
      const r = await open({ data: { id, source } });
      if (r.url) window.open(r.url, "_blank", "noopener");
      else toast.error(r.message ?? "Not available.");
    } catch (e: any) { toast.error(e?.message ?? "Could not open."); }
  };
  const rows = q.data?.rows ?? [];
  const assign = useServerFn(assignDriveRequirement);
  const qc = useQueryClient();
  const setReq = async (id: string, requirement: string) => {
    try { await assign({ data: { documentId: id, requirement: requirement as any } }); toast.success(requirement === "none" ? "Unassigned." : `Assigned as ${requirementLabel(requirement)}.`); void qc.invalidateQueries({ queryKey: ["drive-imports", offeringId, investorUserId] }); }
    catch (e: any) { toast.error(e?.message ?? "Could not assign."); }
  };
  const linkFn = useServerFn(linkDriveDocsToPacket);
  const [linking, setLinking] = useState(false);
  const linkPacket = async () => {
    if (!offeringId) return;
    setLinking(true);
    try {
      const r = await linkFn({ data: { offeringId } });
      if (r.linked.length) toast.success(`Added ${r.linked.length} document(s) to the offering packet. Approve and activate them in Offering Documents so investors see them.`);
      else toast.info(r.skipped[0]?.reason ? `Nothing new to add. ${r.skipped[0].reason}` : "Nothing new to add.");
      void qc.invalidateQueries();
    } catch (e: any) { toast.error(e?.message ?? "Could not add to the packet."); }
    finally { setLinking(false); }
  };
  const filled = new Set(rows.map((r: any) => r.requirement).filter(Boolean));
  const missing = offeringId ? DRIVE_REQUIREMENTS.filter((x) => x.required && !filled.has(x.key)) : [];
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base">{DRIVE_LABELS.imported.title}</CardTitle>
          <p className="text-xs font-medium text-muted-foreground">{DRIVE_LABELS.imported.direction}</p>
          <CardDescription>{DRIVE_LABELS.imported.copy} Visible to Super Administrators only.</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          {offeringId && rows.length ? <Button size="sm" variant="outline" disabled={linking} onClick={linkPacket}>{linking ? "Adding..." : "Add to offering packet"}</Button> : null}
          <DriveImportButton offeringId={offeringId} investorUserId={investorUserId} label="Import from Drive" />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {!rows.length ? <p className="text-sm text-muted-foreground">No documents imported yet.</p> : null}
        {offeringId && rows.length ? (
          <div className="rounded-md bg-muted/50 p-2 text-xs">
            <span className="font-medium text-foreground">Required documents: </span>
            {DRIVE_REQUIREMENTS.filter((x) => x.required).map((x) => (
              <Badge key={x.key} variant={filled.has(x.key) ? "default" : "outline"} className="mr-1 mt-1">{filled.has(x.key) ? "✓ " : ""}{x.label}</Badge>
            ))}
            {missing.length ? <p className="mt-1 text-muted-foreground">{missing.length} still missing. Assign files below.</p> : <p className="mt-1 text-muted-foreground">All required documents are assigned.</p>}
          </div>
        ) : null}
        {rows.map((r: any) => (
          <div key={r.id} className="rounded-md border p-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{r.fileName}</span>
              <Badge variant="outline">{documentTypeLabel(r.category, r.documentType) ?? r.documentType}</Badge>
              <Badge variant="secondary">{CLASSIFICATION_LABELS[r.classification as keyof typeof CLASSIFICATION_LABELS]}</Badge>
              {r.details ? <Badge>{detailsLabel(r.details)}</Badge> : null}
              {r.details?.signatureStatus ? <Badge variant="outline">{SIGNATURE_STATUSES[r.details.signatureStatus as keyof typeof SIGNATURE_STATUSES]}</Badge> : null}
              {r.details?.sharedProfileId ? <Badge variant="secondary">In investor's files</Badge> : null}
              {r.version > 1 ? <Badge variant="outline">v{r.version}</Badge> : null}
              {r.reviewState === "evidence_received_needs_review" ? <Badge variant="destructive">Evidence received - needs review</Badge> : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {r.fundName}{r.profileLabel ? ` · ${r.profileLabel}` : ""} · {r.recordStatus === "historical" ? "Historical record" : "Current document"} · {EXECUTION_LABELS[r.executionEvidence as keyof typeof EXECUTION_LABELS]}
            </p>
            <p className="text-xs text-muted-foreground">Source: Google Drive · Imported {new Date(r.importedAt).toLocaleString()} by {r.importedBy}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Select value={r.requirement ?? "none"} onValueChange={(v) => setReq(r.id, v)}>
                <SelectTrigger className="h-8 w-60" aria-label={`Assign ${r.fileName} to a required document`}><SelectValue placeholder="Assign to required document" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not assigned</SelectItem>
                  {DRIVE_REQUIREMENTS.map((x) => <SelectItem key={x.key} value={x.key}>{x.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <DocumentDetailsButton row={r} onSaved={() => void qc.invalidateQueries({ queryKey: ["drive-imports", offeringId, investorUserId] })} />
              <Button size="sm" variant="outline" onClick={() => go(r.id)}>Open Harmonious copy</Button>
              <Button size="sm" variant="ghost" onClick={() => go(r.id, true)}>Open original file</Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

const EMPTY: DocumentDetails = { group: "fund_document", kind: "", otherName: null, signatureStatus: null, signatureBoxes: [], sharedProfileId: null };

/** Mark exactly what a file is: a fund document (with signature state) or a tax deliverable. */
function DocumentDetailsButton({ row, onSaved }: { row: any; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState<DocumentDetails>(row.details ?? EMPTY);
  const [saving, setSaving] = useState(false);
  const invFn = useServerFn(listDriveDocumentInvestors);
  const saveFn = useServerFn(setDriveDocumentDetails);
  const inv = useQuery({ queryKey: ["drive-doc-investors", row.offeringId], queryFn: () => invFn({ data: { offeringId: row.offeringId } }), enabled: open && Boolean(row.offeringId) });
  const isSub = d.group === "fund_document" && d.kind === "subscription_agreement";
  const investorPick = (d.group === "tax_deliverable" && d.kind === "investor_k1") || (isSub && d.signatureStatus === "signed_by_investor") || d.sharedProfileId;
  const problems = detailsProblems(d);
  const setBox = (i: number, patch: Partial<SignatureBox>) => setD({ ...d, signatureBoxes: d.signatureBoxes.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const save = async () => {
    setSaving(true);
    try { await saveFn({ data: d }); toast.success("Document details saved."); setOpen(false); onSaved(); }
    catch (e: any) { toast.error(e?.message ?? "Could not save."); }
    finally { setSaving(false); }
  };
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => { setD(row.details ?? EMPTY); setOpen(true); }}>{row.details ? "Edit details" : "Set document details"}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Document details</DialogTitle>
            <DialogDescription>{row.fileName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="flex gap-2">
              <Button size="sm" variant={d.group === "fund_document" ? "default" : "outline"} onClick={() => setD({ ...EMPTY, group: "fund_document" })}>Fund Documents</Button>
              <Button size="sm" variant={d.group === "tax_deliverable" ? "default" : "outline"} onClick={() => setD({ ...EMPTY, group: "tax_deliverable" })}>Tax deliverable</Button>
            </div>
            {d.group === "fund_document" ? (
              <>
                <Select value={d.kind} onValueChange={(v) => setD({ ...d, kind: v, signatureStatus: null, signatureBoxes: [] })}>
                  <SelectTrigger aria-label="Document type"><SelectValue placeholder="Choose document type" /></SelectTrigger>
                  <SelectContent>{Object.entries(FUND_DOCUMENT_KINDS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
                {d.kind === "other" ? <Input placeholder="Name this document" value={d.otherName ?? ""} onChange={(e) => setD({ ...d, otherName: e.target.value })} /> : null}
                {isSub ? (
                  <Select value={d.signatureStatus ?? ""} onValueChange={(v) => setD({ ...d, signatureStatus: v as any, signatureBoxes: v === "template" && !d.signatureBoxes.length ? SUGGESTED_SUBSCRIPTION_BOXES : d.signatureBoxes })}>
                    <SelectTrigger aria-label="Signature status"><SelectValue placeholder="Signature status" /></SelectTrigger>
                    <SelectContent>{Object.entries(SIGNATURE_STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                  </Select>
                ) : null}
                {isSub && d.signatureStatus === "template" ? (
                  <div className="space-y-2 rounded-md border p-2">
                    <p className="font-medium">Signature boxes</p>
                    <p className="text-xs text-muted-foreground">We've suggested an investor signature and a fund manager acceptance. Set the page each box goes on, and add or remove boxes.</p>
                    {d.signatureBoxes.map((b, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-2">
                        <Select value={b.role} onValueChange={(v) => setBox(i, { role: v as any })}>
                          <SelectTrigger className="h-8 w-36" aria-label="Who signs"><SelectValue /></SelectTrigger>
                          <SelectContent>{Object.entries(SIGNER_ROLES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                        </Select>
                        <Input className="h-8 w-44" value={b.label} onChange={(e) => setBox(i, { label: e.target.value })} aria-label="Box label" />
                        <Input className="h-8 w-20" type="number" min={1} value={b.page} onChange={(e) => setBox(i, { page: Math.max(1, Number(e.target.value) || 1) })} aria-label="Page" />
                        <label className="flex items-center gap-1 text-xs"><Checkbox checked={b.dateField} onCheckedChange={(c) => setBox(i, { dateField: Boolean(c) })} />Date</label>
                        <Button size="sm" variant="ghost" onClick={() => setD({ ...d, signatureBoxes: d.signatureBoxes.filter((_, j) => j !== i) })}>Remove</Button>
                      </div>
                    ))}
                    <Button size="sm" variant="outline" onClick={() => setD({ ...d, signatureBoxes: [...d.signatureBoxes, { role: "investor", label: "Signature", page: 1, dateField: true }] })}>Add signature box</Button>
                  </div>
                ) : null}
              </>
            ) : (
              <Select value={d.kind} onValueChange={(v) => setD({ ...d, kind: v })}>
                <SelectTrigger aria-label="Tax form"><SelectValue placeholder="Which tax form?" /></SelectTrigger>
                <SelectContent>{Object.entries(TAX_FORMS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            )}
            {investorPick ? (
              <div className="space-y-1">
                <p className="font-medium">Add to this investor's files</p>
                <Select value={d.sharedProfileId ?? "none"} onValueChange={(v) => setD({ ...d, sharedProfileId: v === "none" ? null : v })}>
                  <SelectTrigger aria-label="Investor"><SelectValue placeholder="Choose investor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Don't share</SelectItem>
                    {(inv.data?.investors ?? []).map((x: { id: string; label: string }) => <SelectItem key={x.id} value={x.id}>{x.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">The investor will see and download this file in their documents. Only that investor sees it.</p>
              </div>
            ) : null}
            {problems.length ? <p className="text-xs text-destructive">{problems[0]}</p> : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button disabled={saving || problems.length > 0} onClick={save}>{saving ? "Saving..." : "Save details"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
