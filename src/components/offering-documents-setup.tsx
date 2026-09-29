import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  activateDocumentVersionFn,
  approveDocumentVersionFn,
  createSetupDocumentFn,
  listSetupDocumentsFn,
  decideChangeRequestFn,
  requestDocumentChangeFn,
  resolveResignItemFn,
  rolloutPreviewFn,
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
  ROLLOUT_LABELS,
  type RolloutScope,
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
  const preview = useServerFn(rolloutPreviewFn);
  const resolveResign = useServerFn(resolveResignItemFn);
  const decide = useServerFn(decideChangeRequestFn);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const needsSigning = doc.usage === "signature";
  const [effective, setEffective] = useState("");
  const [rollout, setRollout] = useState<{ version: number; r: Awaited<ReturnType<typeof rolloutPreviewFn>> } | null>(null);
  const [showRequest, setShowRequest] = useState(false);
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
      // Signature documents default to Signature Required so the blocks can be added right away.
      if (!doc.usage && (doc.category === "subscription_agreement" || doc.category === "operating_agreement")) {
        await setUsage({ data: { documentId: doc.id, usage: "signature", applicability: { profileTypes: [], classKeys: [] } } });
      }
      setOpen(true);
    }, "Document uploaded — now add the signature blocks, then approve");
  };

  const startActivate = async (version: number) => {
    try {
      setRollout({ version, r: await preview({ data: { documentId: doc.id } }) });
    } catch (e: any) {
      toast.error(e.message);
    }
  };
  const u = doc.usageCounts;
  const signedSummary = Object.entries(u.signedByVersion).sort((a, b) => Number(b[0]) - Number(a[0])).map(([v, n]) => `${n} signed on v${v}`);
  const appliesTo = (doc.applicability.profileTypes?.length || doc.applicability.classKeys?.length)
    ? [...(doc.applicability.profileTypes ?? []), ...(doc.applicability.classKeys ?? []).map((c) => `class ${c}`)].join(", ")
    : "All investors";
  const pendingRequests = doc.changeRequests.filter((r) => r.status === "pending");

  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{doc.title}</p>
          <p className="text-xs text-muted-foreground">
            {active ? `Fund template v${active.version} (in use)` : latest ? "Draft — not in use yet" : "Needs setup"}
            {" · "}{doc.usage ? DOCUMENT_USAGE_LABELS[doc.usage] : "Usage not chosen"}
            {" · "}{appliesTo}
          </p>
          {(signedSummary.length > 0 || u.waiting > 0 || u.notSent > 0) && (
            <p className="text-xs text-muted-foreground">
              {[...signedSummary, u.waiting ? `${u.waiting} waiting to sign` : null, u.notSent ? `${u.notSent} not sent` : null, u.individual ? `${u.individual} individual version(s)` : null].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {doc.resignOpen.length > 0 && <Badge variant="destructive">{doc.resignOpen.length} re-sign needed</Badge>}
          {pendingRequests.length > 0 && <Badge variant="secondary">{pendingRequests.length} change request(s)</Badge>}
          {latest && <Badge variant={latest.state === "ready_for_use" ? "default" : "secondary"}>{VERSION_STATE_LABELS[latest.state]}</Badge>}
          {!data.canEdit && active && <Button size="sm" variant="outline" onClick={() => setShowRequest(!showRequest)}>Request a change</Button>}
          {data.canEdit && active && <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Replace</Button>}
          <Button size="sm" variant={latest ? "ghost" : "default"} onClick={() => setOpen(!open)}>{open ? "Hide" : latest ? "Manage" : "Set up"}</Button>
        </div>
      </div>

      {showRequest && !data.canEdit && <ChangeRequestForm doc={doc} offeringId={offeringId} onDone={() => { setShowRequest(false); onChanged(); }} />}

      {doc.changeRequests.length > 0 && (
        <div className="mt-3 space-y-1 rounded-md bg-muted/40 p-2 text-xs">
          <p className="font-medium">Change requests</p>
          {doc.changeRequests.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>{new Date(r.requestedAt).toLocaleDateString()} · {r.fileName} · {ROLLOUT_LABELS[r.scope]}{r.note ? ` · "${r.note}"` : ""} · <span className="capitalize">{r.status}</span>{r.decisionNote ? ` (${r.decisionNote})` : ""}</span>
              {data.canEdit && r.status === "pending" && (r.mine ? <span className="text-muted-foreground">Another team member must decide</span> : (
                <span className="flex gap-1">
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => decide({ data: { id: r.id, decision: "accept" } }), "Added as a new version — review, set signature blocks and approve").then(() => setOpen(true))}>Accept as new version</Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => { const note = window.prompt("Reason for declining"); if (note) void run(() => decide({ data: { id: r.id, decision: "decline", note } }), "Request declined"); }}>Decline</Button>
                </span>
              ))}
            </div>
          ))}
        </div>
      )}

      {data.canEdit && doc.resignOpen.length > 0 && (
        <div className="mt-3 space-y-1 rounded-md border border-destructive/40 p-2 text-xs">
          <p className="font-medium">Re-sign needed ({doc.resignOpen.length})</p>
          <p className="text-muted-foreground">Send each investor the new version with the usual send button, then mark it here. Nothing is sent automatically.</p>
          {doc.resignOpen.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>Investment {r.onboardingId.slice(0, 8)} · v{r.from ?? "?"} → v{r.to}</span>
              <span className="flex gap-1">
                {(["sent", "signed", "waived"] as const).map((st) => (
                  <Button key={st} size="sm" variant="ghost" disabled={busy} className="capitalize" onClick={() => run(() => resolveResign({ data: { id: r.id, status: st } }), "Updated")}>{st === "waived" ? "Not needed" : `Mark ${st}`}</Button>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="mt-3 space-y-4">
          <Step n={1} title="Upload the document" done={doc.versions.length > 0}>
            {data.canEdit && (
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor={`eff-${doc.id}`}>Effective date (optional)</Label>
                  <Input id={`eff-${doc.id}`} type="date" value={effective} onChange={(e) => setEffective(e.target.value)} />
                </div>
                <Label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm">
                  {busy ? "Uploading…" : latest ? "Upload new version" : "Upload Document"}
                  <input type="file" accept="application/pdf" className="sr-only" disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} />
                </Label>
              </div>
            )}
            {latest && <p className="text-xs text-muted-foreground">Latest: Version {latest.version} · {latest.fileName ?? "file"}</p>}
          </Step>

          <Step n={2} title="How it is used and who it applies to" done={!!doc.usage}>
            <UsageEditor doc={doc} data={data} busy={busy} onSave={(usage, applicability) => run(() => setUsage({ data: { documentId: doc.id, usage, applicability } }), "Usage saved")} />
          </Step>

          {needsSigning && (
            <Step n={3} title="Signature blocks" done={latest?.signingStatus === "confirmed"}>
              {!latest ? <p className="text-sm text-muted-foreground">Upload the document first, then add its signature blocks here.</p>
                : <SigningEditor key={`${latest.version}-${latest.signingStatus}`} doc={doc} version={latest} data={data} onChanged={onChanged} />}
            </Step>
          )}

          <Step n={needsSigning ? 4 : 3} title="Approve and put in use" done={!!active && active.version === latest?.version}>
            {doc.versions.length === 0 && <p className="text-sm text-muted-foreground">No file uploaded yet.</p>}
            {doc.versions.map((v) => (
              <div key={v.version} className="rounded-md bg-muted/40 p-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Version {v.version} · {v.fileName ?? "file"} · {new Date(v.uploadedAt).toLocaleDateString()}
                    {v.effectiveDate ? ` · effective ${v.effectiveDate}` : ""}
                  </span>
                  <Badge variant="outline">{v.isActive ? "In use (template)" : v.rolloutScope === "single" && v.approval === "approved" ? "Individual version" : VERSION_STATE_LABELS[v.state]}</Badge>
                </div>
                {data.canEdit && v.approval !== "superseded" && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {v.approval === "uploaded_review_required" && (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => approve({ data: { documentId: doc.id, version: v.version } }), "Approved for use")}>Approve for use</Button>
                    )}
                    {v.approval === "approved" && !v.isActive && v.rolloutScope !== "single" && (
                      <Button size="sm" disabled={busy || (needsSigning && v.signingStatus !== "confirmed")} onClick={() => startActivate(v.version)}>Use this version</Button>
                    )}
                    {needsSigning && v.signingStatus !== "confirmed" && !v.isActive && (
                      <span className="text-xs text-muted-foreground">Confirm the signature blocks first.</span>
                    )}
                  </div>
                )}
                {needsSigning && v !== latest && v.approval !== "superseded" && (
                  <SigningEditor doc={doc} version={v} data={data} onChanged={onChanged} />
                )}
              </div>
            ))}
          </Step>

          {rollout && (
            <RolloutDialog
              version={rollout.version}
              preview={rollout.r}
              busy={busy}
              onCancel={() => setRollout(null)}
              onConfirm={(scope, targetOnboardingId, note) =>
                run(() => activate({ data: { documentId: doc.id, version: rollout.version, scope, targetOnboardingId, note } }), scope === "single" ? "Individual version assigned" : "Version is now the Fund template").then(() => setRollout(null))
              }
            />
          )}
        </div>
      )}
    </div>
  );
}

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: ReactNode }) {
  return (
    <section className="rounded-md border p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium ${done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{done ? "✓" : n}</span>
        <p className="text-sm font-medium">{title}</p>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
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
      {data.canEdit && signers.length === 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-2">
          <span className="text-xs text-muted-foreground">Quick start:</span>
          <Button size="sm" variant="outline" onClick={() => setSigners([
            { role: "investor", fields: ["signature", "printed_name", "date_signed"], order: 1 },
            { role: "fund_signatory", fields: ["signature", "printed_name", "title", "entity_name", "date_signed"], order: 2 },
          ])}>Investor + Fund Signatory</Button>
          <Button size="sm" variant="outline" onClick={() => setSigners([
            { role: "investor", fields: ["signature", "printed_name", "date_signed"], order: 1 },
            { role: "joint_investor", fields: ["signature", "printed_name", "date_signed"], order: 2 },
            { role: "entity_authorized_signer", fields: ["signature", "printed_name", "title", "entity_name", "date_signed"], order: 3 },
            { role: "fund_signatory", fields: ["signature", "printed_name", "title", "entity_name", "date_signed"], order: 4 },
          ])}>All investor types + Fund Signatory</Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Choose who signs, then the fields in each signature block.</p>
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
        <p className="text-xs text-destructive">Add a Fund Signatory in the Fund Signatories section first.</p>
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

function ScopePicker({ scope, setScope, counts, hasActive, investors, target, setTarget }: {
  scope: RolloutScope; setScope: (s: RolloutScope) => void; counts?: { new_only: number; all: number; resign: number } | undefined; hasActive: boolean;
  investors: { onboardingId: string; name: string }[]; target: string; setTarget: (s: string) => void;
}) {
  const help: Record<RolloutScope, string> = {
    new_only: "New investors and anyone not yet sent get this version. Anyone already sent or signed keeps theirs.",
    all: "Becomes the template, and everyone already sent or signed is listed as needing to re-sign.",
    single: "Used only for one investor (e.g. a side letter or corrected copy). The Fund template doesn't change.",
  };
  const opts: RolloutScope[] = hasActive ? ["new_only", "all", "single"] : ["new_only", "single"];
  return (
    <div className="space-y-2">
      {opts.map((o) => (
        <label key={o} className={`flex cursor-pointer gap-2 rounded-md border p-2 ${scope === o ? "border-primary" : ""}`}>
          <input type="radio" checked={scope === o} onChange={() => setScope(o)} />
          <span>
            <span className="font-medium">{o === "new_only" && !hasActive ? "All investors (first template)" : ROLLOUT_LABELS[o]}</span>
            {counts && o !== "single" && <span className="text-muted-foreground"> · {o === "all" ? `${counts.all} investor(s), ${counts.resign} to re-sign` : `${counts.new_only} investor(s) not yet sent`}</span>}
            <span className="block text-xs text-muted-foreground">{help[o]}</span>
          </span>
        </label>
      ))}
      {scope === "single" && (
        <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Choose the investor…</option>
          {investors.map((i) => <option key={i.onboardingId} value={i.onboardingId}>{i.name} · {i.onboardingId.slice(0, 8)}</option>)}
        </select>
      )}
    </div>
  );
}

function RolloutDialog({ version, preview, busy, onCancel, onConfirm }: {
  version: number; preview: Awaited<ReturnType<typeof rolloutPreviewFn>>; busy: boolean; onCancel: () => void;
  onConfirm: (scope: RolloutScope, target: string | null, note: string | null) => void;
}) {
  const [scope, setScope] = useState<RolloutScope>("new_only");
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");
  return (
    <div className="space-y-3 rounded-md border border-primary/40 p-3 text-sm">
      <p className="font-medium">Who should get Version {version}?</p>
      <ScopePicker scope={scope} setScope={setScope} counts={preview.counts} hasActive={preview.hasActive} investors={preview.investors} target={target} setTarget={setTarget} />
      <Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <p className="text-xs text-muted-foreground">Signed documents never change and nothing is emailed or sent automatically.</p>
      <div className="flex gap-2">
        <Button size="sm" disabled={busy || (scope === "single" && !target)} onClick={() => onConfirm(scope, scope === "single" ? target : null, note || null)}>Confirm</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function ChangeRequestForm({ doc, offeringId, onDone }: { doc: Doc; offeringId: string; onDone: () => void }) {
  const request = useServerFn(requestDocumentChangeFn);
  const [file, setFile] = useState<File | null>(null);
  const [scope, setScope] = useState<RolloutScope>("new_only");
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const path = `${offeringId}/requests/${doc.id}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
      const { error } = await supabase.storage.from("offering-files").upload(path, file);
      if (error) throw new Error(error.message);
      await request({ data: { documentId: doc.id, filePath: path, fileName: file.name, fileSizeBytes: file.size, scope, targetOnboardingId: scope === "single" ? target || null : null, note: note || null } });
      toast.success("Change request sent to Harmonious");
      onDone();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="mt-3 space-y-2 rounded-md border p-3 text-sm">
      <p className="font-medium">Request a change to {doc.title}</p>
      <Label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm">
        {file ? file.name : "Choose the new file (PDF)"}
        <input type="file" accept="application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </Label>
      <ScopePicker scope={scope} setScope={setScope} hasActive investors={[]} target={target} setTarget={setTarget} />
      {scope === "single" && <Input placeholder="Which investor? (name)" value={note} onChange={(e) => setNote(e.target.value)} />}
      {scope !== "single" && <Input placeholder="Note for Harmonious (optional)" value={note} onChange={(e) => setNote(e.target.value)} />}
      <p className="text-xs text-muted-foreground">Harmonious reviews the file, sets its signature blocks and puts it in use.</p>
      <Button size="sm" disabled={busy || !file} onClick={submit}>Send request</Button>
    </div>
  );
}
