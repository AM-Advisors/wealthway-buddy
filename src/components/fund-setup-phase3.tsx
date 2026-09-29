import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  attachWireDocumentFn,
  changeInvestmentClassFn,
  classAssignmentsFn,
  phase3OverviewFn,
  previewClassChangeFn,
  recordEinFn,
  reviewBankVersionFn,
  saveAdministrationFn,
  saveBankDetailsFn,
  saveSs4Fn,
  setBankingPathFn,
  setEinPathFn,
  setEinStatusFn,
  setHarmoniousBankStatusFn,
} from "@/lib/fund-setup-canonical.functions";
import {
  ADMIN_SERVICES,
  ADMIN_SERVICE_LABELS,
  BANK_VERSION_STATUS_LABELS,
  BANKING_PATH_LABELS,
  EIN_STATUSES,
  EIN_STATUS_LABELS,
  FILING_RESPONSIBILITY_LABELS,
  HARMONIOUS_BANK_STATUSES,
  HARMONIOUS_BANK_STATUS_LABELS,
  OWNER_LABELS,
  type AdminService,
  type BankingPath,
  type FilingResponsibility,
  type ServiceChoice,
} from "@/lib/fund-setup-phase3";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormationEvidenceSection, RegulatoryFilingsCard } from "@/components/fund-setup-extras";
import { RequiredHere } from "@/components/fund-setup-checklist";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type D = Awaited<ReturnType<typeof phase3OverviewFn>>;

async function uploadRestricted(offeringId: string, kind: string, file: File) {
  const path = `fund-setup-restricted/${offeringId}/${kind}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
  const { error } = await supabase.storage.from("fund-formation").upload(path, file);
  if (error) throw new Error("The file couldn't be uploaded.");
  return path;
}

function useRun(onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

function OwnerTag({ owner }: { owner: "harmonious" | "client" | null }) {
  if (!owner) return null;
  return <Badge variant={owner === "client" ? "default" : "secondary"}>{OWNER_LABELS[owner]}</Badge>;
}

export function FundSetupPhase3({ offeringId, onChanged }: { offeringId: string; onChanged?: () => void }) {
  const qc = useQueryClient();
  const load = useServerFn(phase3OverviewFn);
  const q = useQuery({ queryKey: ["fund-setup-p3", offeringId], queryFn: () => load({ data: { offeringId } }) });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["fund-setup-p3", offeringId] });
    onChanged?.();
  };
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error || !q.data) return <p className="text-sm text-destructive">This part of Fund Setup couldn't be loaded.</p>;
  const d = q.data;
  return (
    <div className="space-y-6">
      <EntityEinCard d={d} offeringId={offeringId} onChanged={refresh} />
      <BankingCard d={d} offeringId={offeringId} onChanged={refresh} />
      <AdminCard d={d} offeringId={offeringId} onChanged={refresh} />
      <RegulatoryFilingsCard offeringId={offeringId} />
      {d.canEdit && <ClassAssignmentCard offeringId={offeringId} />}
      <ReviewCard d={d} />
    </div>
  );
}

// ------------------------------------------------------------------ Banking

function BankingCard({ d, offeringId, onChanged }: { d: D; offeringId: string; onChanged: () => void }) {
  const setPath = useServerFn(setBankingPathFn);
  const setStatus = useServerFn(setHarmoniousBankStatusFn);
  const save = useServerFn(saveBankDetailsFn);
  const attach = useServerFn(attachWireDocumentFn);
  const review = useServerFn(reviewBankVersionFn);
  const { busy, run } = useRun(onChanged);
  const [reason, setReason] = useState("");
  const [intl, setIntl] = useState(false);
  const [f, setF] = useState({ bank_name: "", bank_address: "", account_name: "", account_number: "", routing_number: "", swift: "", memo: "" });
  const [method, setMethod] = useState("");
  const [note, setNote] = useState("");
  const b = d.banking;
  const current = b.versions[0];
  const field = (k: keyof typeof f, label: string, type = "text") => (
    <div className="space-y-1">
      <Label htmlFor={`bank-${k}`}>{label}</Label>
      <Input id={`bank-${k}`} type={type} autoComplete="off" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </div>
  );

  return (
    <Card id="setup-banking" className="scroll-mt-6">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Banking</CardTitle>
          <OwnerTag owner={b.section.owner} />
        </div>
        {b.section.next && <p className="text-sm text-muted-foreground">Next: {b.section.next}</p>}
      </CardHeader>
      <CardContent className="space-y-4">
        <RequiredHere section="setup-banking" />
        <div className="space-y-2">
          <p className="text-sm font-medium">How will this Fund's bank account be handled?</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(BANKING_PATH_LABELS) as BankingPath[]).map((p) => (
              <Button key={p} size="sm" variant={b.path === p ? "default" : "outline"} disabled={!d.canEdit || busy || p === "not_required"} onClick={() => run(() => setPath({ data: { offeringId, path: p } }), "Saved")}>
                {BANKING_PATH_LABELS[p]}
              </Button>
            ))}
          </div>
          {d.canEdit && b.path !== "not_required" && (
            <div className="flex flex-wrap items-end gap-2">
              <Input className="max-w-sm" placeholder="Reason banking isn't needed" value={reason} onChange={(e) => setReason(e.target.value)} />
              <Button size="sm" variant="ghost" disabled={busy || !reason.trim()} onClick={() => run(() => setPath({ data: { offeringId, path: "not_required", reason } }), "Marked not required")}>Mark banking not required</Button>
            </div>
          )}
        </div>

        {b.path === "harmonious" && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Establish Bank Account</p>
            <div className="flex flex-wrap gap-1">
              {HARMONIOUS_BANK_STATUSES.map((s) => (
                <Button key={s} size="sm" variant={b.harmoniousStatus === s ? "secondary" : "ghost"} disabled={!d.canEdit || busy} onClick={() => run(() => setStatus({ data: { offeringId, status: s } }), "Status updated")}>
                  {HARMONIOUS_BANK_STATUS_LABELS[s]}
                </Button>
              ))}
            </div>
          </div>
        )}

        {(b.path === "client" || b.path === "harmonious") && (
          <>
            <div className="space-y-1">
              <p className="text-sm font-medium">Wire instructions</p>
              {!current && <p className="text-sm text-muted-foreground">No instructions entered yet.</p>}
              {b.versions.map((v) => (
                <div key={v.version} className="rounded-md bg-muted/40 p-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Version {v.version} · {v.bankName ?? "Bank"} · {v.accountName ?? "—"} · account {v.accountMasked || "—"}
                      {v.routingMasked ? ` · routing ${v.routingMasked}` : ""}
                      {v.hasWireDocument ? " · document attached" : ""}
                    </span>
                    <Badge variant={v.status === "verified" ? "default" : "outline"}>{BANK_VERSION_STATUS_LABELS[v.status]}</Badge>
                  </div>
                  {v.ownershipReview === "review_required" && <p className="mt-1 text-xs text-destructive">Account ownership requires review: the account name differs from the fund's Legal Name.</p>}
                  {v.ownershipReview === "accepted" && d.canEdit && v.ownershipExplanation && <p className="mt-1 text-xs text-muted-foreground">Ownership accepted: {v.ownershipExplanation}</p>}
                  {v.status === "verified" && <p className="mt-1 text-xs text-muted-foreground">Verified {v.verifiedAt ? new Date(v.verifiedAt).toLocaleDateString() : ""} · {v.verificationMethod}</p>}
                  {v.status === "rejected" && d.canEdit && v.rejectionReason && <p className="mt-1 text-xs text-muted-foreground">Returned: {v.rejectionReason}</p>}
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                {b.releasable ? "Investors can receive the current verified instructions." : "Investors don't receive funding instructions until the current version is verified."}
              </p>
            </div>

            {d.canEdit && current && current.status === "pending_verification" && (
              <div className="space-y-2 rounded-md border p-3">
                <p className="text-sm font-medium">Review version {current.version}</p>
                <Label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm">
                  Upload Wire Instructions
                  <input type="file" accept="application/pdf,image/*" className="sr-only" disabled={busy} onChange={(e) => { const file = e.target.files?.[0]; if (file) run(async () => attach({ data: { offeringId, version: current.version, filePath: await uploadRestricted(offeringId, "wire", file) } }), "Document attached"); }} />
                </Label>
                <Input placeholder="Note (ownership explanation or correction needed)" value={note} onChange={(e) => setNote(e.target.value)} />
                {current.ownershipReview === "review_required" && (
                  <Button size="sm" variant="outline" disabled={busy || !note.trim()} onClick={() => run(() => review({ data: { offeringId, version: current.version, decision: "accept_ownership", note } }), "Ownership accepted")}>Accept account ownership</Button>
                )}
                <Input placeholder="How verified, e.g. call-back to bank on known number" value={method} onChange={(e) => setMethod(e.target.value)} />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={busy || !method.trim() || current.ownershipReview === "review_required"} onClick={() => run(() => review({ data: { offeringId, version: current.version, decision: "verify", method } }), "Verified")}>Mark verified</Button>
                  <Button size="sm" variant="ghost" disabled={busy || !note.trim()} onClick={() => run(() => review({ data: { offeringId, version: current.version, decision: "reject", note } }), "Returned for correction")}>Needs correction</Button>
                </div>
                <p className="text-xs text-muted-foreground">Someone other than the person who entered the instructions must verify them.</p>
              </div>
            )}

            {d.canEdit && (
              <div className="space-y-2 rounded-md border p-3">
                <p className="text-sm font-medium">{current ? "Enter new instructions (creates a new version)" : "Enter bank details"}</p>
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={intl} onChange={(e) => setIntl(e.target.checked)} /> International account</label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {field("bank_name", "Bank Name")}
                  {field("account_name", "Account Name")}
                  {!intl && field("routing_number", "Routing Number")}
                  {field("account_number", "Account Number")}
                  {intl && field("swift", "SWIFT/BIC")}
                  {field("bank_address", "Bank Address")}
                  {field("memo", "For Further Credit")}
                </div>
                <Button size="sm" disabled={busy || !f.account_number || !f.bank_name} onClick={() => run(() => save({ data: { offeringId, details: f } }).then(() => setF({ bank_name: "", bank_address: "", account_name: "", account_number: "", routing_number: "", swift: "", memo: "" })), "Saved — pending verification")}>Save instructions</Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ EIN

const SS4_QUESTIONS: { key: string; label: string; when?: (a: any) => boolean }[] = [
  { key: "responsible_party_name", label: "Responsible party (name)" },
  { key: "mailing_street", label: "Mailing address, if different" },
  { key: "mailing_city_state_zip", label: "Mailing city, state, ZIP" },
  { key: "reason", label: "Reason for applying (e.g. started new business, banking purpose)" },
  { key: "llc_members", label: "Number of LLC members", when: (a) => !!a.is_llc },
  { key: "employees_other", label: "Expected employees in next 12 months (0 if none)" },
  { key: "first_wages_date", label: "First date wages paid", when: (a) => Number(a.employees_other ?? 0) > 0 },
  { key: "principal_activity", label: "Principal activity (e.g. finance, other)" },
  { key: "principal_activity_other", label: "Describe the activity", when: (a) => a.principal_activity === "other" },
  { key: "principal_line", label: "Principal product or service" },
  { key: "previous_ein", label: "Prior EIN", when: (a) => !!a.previous_ein_applied },
  { key: "designee_name", label: "Third-party designee name (optional)" },
  { key: "designee_phone", label: "Designee phone", when: (a) => !!String(a.designee_name ?? "").trim() },
];

function EntityEinCard({ d, offeringId, onChanged }: { d: D; offeringId: string; onChanged: () => void }) {
  const setPath = useServerFn(setEinPathFn);
  const record = useServerFn(recordEinFn);
  const saveSs4 = useServerFn(saveSs4Fn);
  const setStatus = useServerFn(setEinStatusFn);
  const { busy, run } = useRun(onChanged);
  const e = d.ein;
  const [ein, setEin] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [answers, setAnswers] = useState<any>(e.ss4Answers);
  const [tin, setTin] = useState("");
  const submitEin = (received: boolean) =>
    run(async () => {
      if (!file) throw new Error("Upload the IRS EIN letter.");
      await record({ data: { offeringId, ein, letterPath: await uploadRestricted(offeringId, "ein-letter", file), received } });
      setEin("");
      setFile(null);
    }, received ? "EIN received and recorded" : "EIN recorded");

  return (
    <Card id="setup-entity" className="scroll-mt-6">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Entity & EIN</CardTitle>
          <OwnerTag owner={e.section.owner} />
        </div>
        <p className="text-sm text-muted-foreground">
          {e.hasEin ? `EIN on record: ${e.einMasked}` : "No EIN on record yet."}
          {e.section.next ? ` Next: ${e.section.next}` : ""}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <RequiredHere section="setup-entity" />
        <FormationEvidenceSection offeringId={offeringId} />
        <div className="space-y-2">
          <p className="text-sm font-medium">How will the EIN be handled?</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={e.path === "existing" ? "default" : "outline"} disabled={!d.canEdit || busy} onClick={() => run(() => setPath({ data: { offeringId, path: "existing" } }), "Saved")}>I already have an EIN</Button>
            <Button size="sm" variant={e.path === "harmonious" ? "default" : "outline"} disabled={!d.canEdit || busy} onClick={() => run(() => setPath({ data: { offeringId, path: "harmonious" } }), "Saved")}>Have Harmonious obtain the EIN</Button>
          </div>
        </div>

        {e.letters.length > 0 && (
          <p className="text-xs text-muted-foreground">
            IRS EIN letter: {e.letters.map((l) => `v${l.version}${l.current ? " (current)" : " (superseded)"}`).join(", ")} · Harmonious only, never shown to investors.
          </p>
        )}

        {d.canEdit && (e.path === "existing" || (e.path === "harmonious" && e.status === "submitted")) && (
          <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
            <div className="space-y-1">
              <Label htmlFor="ein-number">EIN Number</Label>
              <Input id="ein-number" autoComplete="off" placeholder="12-3456789" value={ein} onChange={(x) => setEin(x.target.value)} />
            </div>
            <Label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm">
              {file ? file.name : "Upload EIN Letter"}
              <input type="file" accept="application/pdf,image/*" className="sr-only" onChange={(x) => setFile(x.target.files?.[0] ?? null)} />
            </Label>
            <Button size="sm" disabled={busy || !ein || !file} onClick={() => submitEin(e.path === "harmonious")}>{e.path === "harmonious" ? "Record EIN received" : "Save EIN"}</Button>
          </div>
        )}

        {e.path === "harmonious" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">Obtain EIN:</span>
              <Badge variant="outline">{EIN_STATUS_LABELS[e.status ?? "information_needed"]}</Badge>
            </div>
            {e.ss4Prefilled.length > 0 && <p className="text-xs text-muted-foreground">Filled from Fund Setup (not asked again): {e.ss4Prefilled.join(", ").replaceAll("_", " ")}.</p>}
            {e.ss4Missing.length > 0 && <p className="text-xs text-muted-foreground">Still needed: {e.ss4Missing.join(", ").replaceAll("_", " ")}.</p>}
            {d.canEdit && (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  {SS4_QUESTIONS.filter((x) => !x.when || x.when(answers)).map((x) => (
                    <div key={x.key} className="space-y-1">
                      <Label htmlFor={`ss4-${x.key}`} className="text-xs">{x.label}</Label>
                      <Input id={`ss4-${x.key}`} value={String(answers[x.key] ?? "")} onChange={(v) => setAnswers({ ...answers, [x.key]: v.target.value })} />
                    </div>
                  ))}
                  <div className="space-y-1">
                    <Label htmlFor="ss4-tin" className="text-xs">Responsible party SSN / ITIN {e.hasResponsiblePartyTin ? "(on file — enter only to replace)" : ""}</Label>
                    <Input id="ss4-tin" type="password" autoComplete="off" value={tin} onChange={(v) => setTin(v.target.value)} />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!answers.previous_ein_applied} onChange={(v) => setAnswers({ ...answers, previous_ein_applied: v.target.checked })} /> Applied for an EIN before</label>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => saveSs4({ data: { offeringId, answers, responsiblePartyTin: tin || null } }).then(() => setTin("")), "SS-4 draft saved")}>Save SS-4 draft</Button>
                <div className="flex flex-wrap gap-1">
                  {EIN_STATUSES.filter((s) => s !== "ein_received").map((s) => (
                    <Button key={s} size="sm" variant={e.status === s ? "secondary" : "ghost"} disabled={busy} onClick={() => run(() => setStatus({ data: { offeringId, status: s } }), "Status updated")}>{EIN_STATUS_LABELS[s]}</Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Generating or signing the SS-4 doesn't submit it, and submitting doesn't issue an EIN. The EIN is recorded only from the IRS letter. Use the existing EIN card to generate the official SS-4 PDF.</p>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ Administration

function AdminCard({ d, offeringId, onChanged }: { d: D; offeringId: string; onChanged: () => void }) {
  const save = useServerFn(saveAdministrationFn);
  const { busy, run } = useRun(onChanged);
  const [services, setServices] = useState<Partial<Record<AdminService, ServiceChoice>>>(d.admin.services);
  const [formD, setFormD] = useState<FilingResponsibility | null>(d.admin.formD);
  const [blueSky, setBlueSky] = useState<FilingResponsibility | null>(d.admin.blueSky);
  const pick = (label: string, value: FilingResponsibility | null, set: (v: FilingResponsibility) => void) => (
    <div className="space-y-1">
      <p className="text-xs font-medium">{label}</p>
      <div className="flex flex-wrap gap-1">
        {(Object.keys(FILING_RESPONSIBILITY_LABELS) as FilingResponsibility[]).map((r) => (
          <Button key={r} size="sm" variant={value === r ? "secondary" : "ghost"} disabled={!d.canEdit} onClick={() => set(r)}>{FILING_RESPONSIBILITY_LABELS[r]}</Button>
        ))}
      </div>
    </div>
  );
  return (
    <Card id="setup-admin" className="scroll-mt-6">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Administration & Regulatory</CardTitle>
          <OwnerTag owner={d.admin.section.owner} />
        </div>
        <p className="text-sm text-muted-foreground">
          Offering exemption: {d.admin.regType ?? "not chosen yet (set in Offering)"}. Services are only included when confirmed here — nothing is assumed purchased.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <RequiredHere section="setup-admin" />
        {ADMIN_SERVICES.map((s) => (
          <div key={s} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-sm">
            <span>{ADMIN_SERVICE_LABELS[s]}</span>
            <div className="flex gap-1">
              {(["included", "not_included"] as ServiceChoice[]).map((c) => (
                <Button key={c} size="sm" variant={services[s] === c ? "secondary" : "ghost"} disabled={!d.canEdit} onClick={() => setServices({ ...services, [s]: c })}>{c === "included" ? "Included" : "Not included"}</Button>
              ))}
            </div>
          </div>
        ))}
        {pick("Form D", formD, setFormD)}
        {pick("Blue Sky", blueSky, setBlueSky)}
        {d.canEdit && <Button size="sm" disabled={busy} onClick={() => run(() => save({ data: { offeringId, services, formD, blueSky } }), "Saved")}>Save</Button>}
        <p className="text-xs text-muted-foreground">No filings are made and no filing fees are calculated here.</p>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ Class assignment

function ClassAssignmentCard({ offeringId }: { offeringId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(classAssignmentsFn);
  const preview = useServerFn(previewClassChangeFn);
  const change = useServerFn(changeInvestmentClassFn);
  const q = useQuery({ queryKey: ["class-assign", offeringId], queryFn: () => load({ data: { offeringId } }) });
  const [pending, setPending] = useState<{ id: string; key: string | null; warnings: string[]; blocked: boolean } | null>(null);
  if (!q.data || q.data.classes.length === 0) return null;
  const refresh = () => qc.invalidateQueries({ queryKey: ["class-assign", offeringId] });
  const start = async (id: string, key: string | null) => {
    try {
      const r = await preview({ data: { onboardingId: id } });
      if (r.warnings.length || r.blocked) return setPending({ id, key, warnings: r.warnings, blocked: r.blocked && !!r.current });
      await change({ data: { onboardingId: id, classKey: key, acknowledged: false } });
      toast.success("Class assigned");
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Investment Classes</CardTitle>
        <p className="text-sm text-muted-foreground">Only classes on the approved economics can be chosen. Class terms are shown for context and can't be edited here.</p>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {q.data.classes.map((c) => (
            <span key={c.key} className="rounded border px-2 py-1">
              {c.name}: fee {c.managementFee?.ratePercent ?? "default"}% · carry {c.carry?.ratePercent ?? "default"}%
            </span>
          ))}
        </div>
        {q.data.investments.map((i) => (
          <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
            <span>{i.investor}</span>
            <select className="rounded-md border bg-background px-2 py-1 text-sm" value={i.classKey ?? ""} onChange={(e) => start(i.id, e.target.value || null)} aria-label={`Class for ${i.investor}`}>
              <option value="">No class</option>
              {q.data.classes.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
            </select>
          </div>
        ))}
        {pending && (
          <div className="rounded-md border border-destructive/40 p-3 text-sm">
            <ul className="list-disc pl-5 text-muted-foreground">{pending.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            {pending.blocked ? (
              <p className="mt-2">This change would rewrite signed or funded history, so it needs Harmonious review instead.</p>
            ) : (
              <Button size="sm" className="mt-2" onClick={async () => { try { await change({ data: { onboardingId: pending.id, classKey: pending.key, acknowledged: true } }); toast.success("Class assigned"); setPending(null); refresh(); } catch (e: any) { toast.error(e.message); } }}>Change class anyway</Button>
            )}
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => setPending(null)}>Cancel</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ Review

function ReviewCard({ d }: { d: D }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Review</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-3">
          {d.ready.map((r) => (
            <div key={r.key} className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{r.label}</span>
                <Badge variant={r.ready ? "default" : "outline"}>{r.ready ? "Ready" : "Not yet"}</Badge>
              </div>
              {!r.ready && r.missing.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Needs: {r.missing.join(", ")}</p>}
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Each is checked on its own; unfinished sections don't block unrelated work. An unsigned Harmonious agreement never blocks setup, onboarding or funding.</p>
        {d.canEdit && d.activity.length > 0 && (
          <div>
            <p className="text-sm font-medium">Setup Activity</p>
            <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
              {d.activity.map((a, i) => <li key={i}>{new Date(a.at).toLocaleString()} — {a.summary}</li>)}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
