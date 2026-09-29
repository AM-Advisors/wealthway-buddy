import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  activateDocumentVersionFn,
  approveDocumentVersionFn,
  createSetupDocumentFn,
  listSetupDocumentsFn,
  previewVersionImpactFn,
  saveSigningConfigFn,
  setDocumentUsageFn,
  uploadDocumentVersionFn,
} from "@/lib/fund-setup-canonical.functions";
import {
  BLOCK_FIELDS,
  BLOCK_FIELD_LABELS,
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_USAGES,
  DOCUMENT_USAGE_LABELS,
  SIGNER_ROLES,
  SIGNER_ROLE_LABELS,
  VERSION_STATE_LABELS,
  type BlockField,
  type DocumentCategory,
  type DocumentUsage,
  type SignerConfig,
  type SignerRole,
} from "@/lib/offering-document-model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CORE: DocumentCategory[] = ["operating_agreement", "subscription_agreement", "ppm"];
const PROFILE_TYPES = ["individual", "joint", "trust", "llc", "corporation", "partnership", "ira"];

type Data = Awaited<ReturnType<typeof listSetupDocumentsFn>>;
type Doc = Data["documents"][number];

export function OfferingDocumentsSetup({ offeringId, onChanged }: { offeringId: string; onChanged?: () => void }) {
  const qc = useQueryClient();
  const load = useServerFn(listSetupDocumentsFn);
  const create = useServerFn(createSetupDocumentFn);
  const q = useQuery({ queryKey: ["offering-docs-setup", offeringId], queryFn: () => load({ data: { offeringId } }) });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["offering-docs-setup", offeringId] });
    onChanged?.();
  };
  const [otherName, setOtherName] = useState("");

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading offering documents…</p>;
  if (q.error || !q.data) return <p className="text-sm text-destructive">Offering documents couldn't be loaded.</p>;
  const d = q.data;
  const add = async (category: DocumentCategory, title?: string) => {
    try {
      await create({ data: { offeringId, category, title: title ?? null } });
      setOtherName("");
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  };
  const byCategory = (c: DocumentCategory) => d.documents.find((x) => x.category === c);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Offering Documents</CardTitle>
        <p className="text-sm text-muted-foreground">
          The uploaded file is the document. Each replacement becomes a new version; earlier versions and signed copies are kept.
          {!d.canEdit && " Only Harmonious can change this section."}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {CORE.map((c) => {
          const doc = byCategory(c);
          return doc ? (
            <DocumentRow key={c} doc={doc} data={d} offeringId={offeringId} onChanged={refresh} />
          ) : (
            <div key={c} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed p-3">
              <span className="text-sm">{DOCUMENT_CATEGORY_LABELS[c]} <span className="text-muted-foreground">— not added</span></span>
              {d.canEdit && <Button size="sm" variant="outline" onClick={() => add(c)}>Add</Button>}
            </div>
          );
        })}
        {d.documents.filter((x) => x.category === "other").map((doc) => (
          <DocumentRow key={doc.id} doc={doc} data={d} offeringId={offeringId} onChanged={refresh} />
        ))}
        {d.canEdit && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="grow space-y-1">
              <Label htmlFor="other-doc">Other Offering Document</Label>
              <Input id="other-doc" placeholder="Document name, e.g. Side Letter Form" value={otherName} onChange={(e) => setOtherName(e.target.value)} />
            </div>
            <Button size="sm" variant="outline" disabled={!otherName.trim()} onClick={() => add("other", otherName)}>Add document</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DocumentRow({ doc, data, offeringId, onChanged }: { doc: Doc; data: Data; offeringId: string; onChanged: () => void }) {
  const upload = useServerFn(uploadDocumentVersionFn);
  const approve = useServerFn(approveDocumentVersionFn);
  const setUsage = useServerFn(setDocumentUsageFn);
  const activate = useServerFn(activateDocumentVersionFn);
  const impact = useServerFn(previewVersionImpactFn);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [effective, setEffective] = useState("");
  const [impactView, setImpactView] = useState<{ version: number; r: Awaited<ReturnType<typeof previewVersionImpactFn>> } | null>(null);
  const latest = doc.versions[0];
  const active = doc.versions.find((v) => v.isActive);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const path = `${offeringId}/setup/${doc.id}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
    await run(async () => {
      const { error } = await supabase.storage.from("offering-files").upload(path, file);
      if (error) throw new Error(error.message);
      await upload({ data: { documentId: doc.id, filePath: path, fileName: file.name, fileSizeBytes: file.size, effectiveDate: effective || null } });
    }, "New version uploaded — review required");
  };

  const startActivate = async (version: number) => {
    if (active && active.version !== version) {
      try {
        setImpactView({ version, r: await impact({ data: { documentId: doc.id } }) });
      } catch (e: any) {
        toast.error(e.message);
      }
      return;
    }
    await run(() => activate({ data: { documentId: doc.id, version, impactAcknowledged: false } }), "Version is now in use");
  };

  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{doc.title}</p>
          <p className="text-xs text-muted-foreground">
            {doc.usage ? DOCUMENT_USAGE_LABELS[doc.usage] : "Usage not chosen"}
            {active ? ` · Version ${active.version} in use` : " · No version in use"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {latest && <Badge variant={latest.state === "ready_for_use" ? "default" : "secondary"}>{VERSION_STATE_LABELS[latest.state]}</Badge>}
          <Button size="sm" variant="ghost" onClick={() => setOpen(!open)}>{open ? "Hide" : "Details"}</Button>
        </div>
      </div>

      {open && (
        <div className="mt-3 space-y-4">
          {data.canEdit && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor={`eff-${doc.id}`}>Effective date (optional)</Label>
                <Input id={`eff-${doc.id}`} type="date" value={effective} onChange={(e) => setEffective(e.target.value)} />
              </div>
              <Label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm">
                {busy ? "Uploading…" : "Upload Document"}
                <input type="file" accept="application/pdf" className="sr-only" disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} />
              </Label>
            </div>
          )}

          <UsageEditor doc={doc} data={data} busy={busy} onSave={(usage, applicability) => run(() => setUsage({ data: { documentId: doc.id, usage, applicability } }), "Usage saved")} />

          <div className="space-y-2">
            <p className="text-sm font-medium">Versions</p>
            {doc.versions.length === 0 && <p className="text-sm text-muted-foreground">No file uploaded yet.</p>}
            {doc.versions.map((v) => (
              <div key={v.version} className="rounded-md bg-muted/40 p-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Version {v.version} · {v.fileName ?? "file"} · {new Date(v.uploadedAt).toLocaleDateString()}
                    {v.effectiveDate ? ` · effective ${v.effectiveDate}` : ""}
                  </span>
                  <Badge variant="outline">{v.isActive ? "In use" : VERSION_STATE_LABELS[v.state]}</Badge>
                </div>
                {data.canEdit && v.approval !== "superseded" && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {v.approval === "uploaded_review_required" && (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => approve({ data: { documentId: doc.id, version: v.version } }), "Approved for use")}>Approve for use</Button>
                    )}
                    {v.approval === "approved" && !v.isActive && (
                      <Button size="sm" disabled={busy || (doc.usage === "signature" && v.signingStatus !== "confirmed")} onClick={() => startActivate(v.version)}>Use this version</Button>
                    )}
                  </div>
                )}
                {doc.usage === "signature" && v.approval !== "superseded" && (
                  <SigningEditor doc={doc} version={v} data={data} onChanged={onChanged} />
                )}
              </div>
            ))}
          </div>

          {impactView && (
            <div className="rounded-md border border-destructive/40 p-3 text-sm">
              <p className="font-medium">Investor Impact</p>
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                <li>{impactView.r.executedOldVersion} investment(s) already executed the current version — they keep it.</li>
                <li>{impactView.r.awaitingSignature} investment(s) are awaiting signature on the current version.</li>
                <li>{impactView.r.notYetSent} investment(s) have not been sent documents yet.</li>
                {impactView.r.profileTypes.length > 0 && <li>Profile types affected: {impactView.r.profileTypes.join(", ")}</li>}
                {impactView.r.classKeys.length > 0 && <li>Classes affected: {impactView.r.classKeys.join(", ")}</li>}
              </ul>
              <p className="mt-2 text-muted-foreground">Nothing is re-sent automatically. Signed investments are never moved to the new version.</p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" disabled={busy} onClick={() => run(() => activate({ data: { documentId: doc.id, version: impactView.version, impactAcknowledged: true } }), "Version is now in use").then(() => setImpactView(null))}>Use Version {impactView.version}</Button>
                <Button size="sm" variant="ghost" onClick={() => setImpactView(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UsageEditor({ doc, data, busy, onSave }: { doc: Doc; data: Data; busy: boolean; onSave: (u: DocumentUsage, a: { profileTypes: string[]; classKeys: string[] }) => void }) {
  const [usage, setUsage] = useState<DocumentUsage | "">(doc.usage ?? "");
  const [profiles, setProfiles] = useState<string[]>(doc.applicability.profileTypes ?? []);
  const [classes, setClasses] = useState((doc.applicability.classKeys ?? []).join(", "));
  const toggle = (p: string) => setProfiles((xs) => (xs.includes(p) ? xs.filter((x) => x !== p) : [...xs, p]));
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">How is this document used?</p>
      <div className="flex flex-wrap gap-2">
        {DOCUMENT_USAGES.map((u) => (
          <Button key={u} size="sm" variant={usage === u ? "default" : "outline"} disabled={!data.canEdit} onClick={() => setUsage(u)}>{DOCUMENT_USAGE_LABELS[u]}</Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Applies to profile types (none selected = all):</p>
      <div className="flex flex-wrap gap-1">
        {PROFILE_TYPES.map((p) => (
          <Button key={p} size="sm" variant={profiles.includes(p) ? "secondary" : "ghost"} disabled={!data.canEdit} onClick={() => toggle(p)} className="capitalize">{p}</Button>
        ))}
      </div>
      {data.hasMultipleClasses && (
        <div className="space-y-1">
          <Label htmlFor={`cls-${doc.id}`} className="text-xs">Applies to classes (comma-separated keys, blank = all)</Label>
          <Input id={`cls-${doc.id}`} value={classes} disabled={!data.canEdit} onChange={(e) => setClasses(e.target.value)} />
        </div>
      )}
      {data.canEdit && (
        <Button size="sm" variant="outline" disabled={busy || !usage} onClick={() => usage && onSave(usage, { profileTypes: profiles, classKeys: classes.split(",").map((s) => s.trim()).filter(Boolean) })}>Save usage</Button>
      )}
    </div>
  );
}

function SigningEditor({ doc, version, data, onChanged }: { doc: Doc; version: Doc["versions"][number]; data: Data; onChanged: () => void }) {
  const save = useServerFn(saveSigningConfigFn);
  const [signers, setSigners] = useState<SignerConfig[]>(version.signingConfig?.signers ?? []);
  const has = (r: SignerRole) => signers.find((s) => s.role === r);
  const toggleRole = (r: SignerRole) =>
    setSigners((xs) => (has(r) ? xs.filter((s) => s.role !== r) : [...xs, { role: r, fields: ["signature", "printed_name", "date_signed"], order: xs.length + 1 }]));
  const toggleField = (r: SignerRole, f: BlockField) =>
    setSigners((xs) => xs.map((s) => (s.role !== r ? s : { ...s, fields: s.fields.includes(f) ? s.fields.filter((x) => x !== f) : [...s.fields, f] })));
  const submit = async (confirm: boolean) => {
    try {
      await save({ data: { documentId: doc.id, version: version.version, config: { signers }, confirm } });
      toast.success(confirm ? "Signing setup confirmed" : "Signing setup saved");
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    }
  };
  return (
    <div className="mt-2 space-y-2 border-t pt-2">
      <p className="text-xs font-medium">
        Signing setup for Version {version.version}
        {version.signingStatus === "needs_review" && <span className="text-destructive"> — Signing Setup Needs Review</span>}
      </p>
      <div className="flex flex-wrap gap-1">
        {SIGNER_ROLES.map((r) => (
          <Button key={r} size="sm" variant={has(r) ? "secondary" : "ghost"} disabled={!data.canEdit} onClick={() => toggleRole(r)}>{SIGNER_ROLE_LABELS[r]}</Button>
        ))}
      </div>
      {signers.map((s) => (
        <div key={s.role} className="flex flex-wrap items-center gap-1 text-xs">
          <span className="w-40 font-medium">{SIGNER_ROLE_LABELS[s.role]}</span>
          {BLOCK_FIELDS.map((f) => (
            <label key={f} className="inline-flex items-center gap-1 rounded border px-2 py-1">
              <input type="checkbox" checked={s.fields.includes(f)} disabled={!data.canEdit} onChange={() => toggleField(s.role, f)} />
              {BLOCK_FIELD_LABELS[f]}
            </label>
          ))}
        </div>
      ))}
      {has("fund_signatory") && !data.hasFundSignatory && (
        <p className="text-xs text-destructive">Choose the Fund Signatory in Fund Details first.</p>
      )}
      {data.canEdit && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => submit(false)}>Save draft</Button>
          <Button size="sm" onClick={() => submit(true)}>Confirm signing setup</Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Field placement on the page is done in the signing provider's editor for this version.</p>
    </div>
  );
}
