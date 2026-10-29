import { useEffect, useState, type ReactNode } from "react";
import { invalidateFund } from "@/lib/fund-query-keys";
import { ServiceProvidersSection } from "@/components/fund-setup-extras";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  getFundSetupOverview,
  saveFundSetupFieldsFn,
  previewLegalNameChangeFn,
  changeLegalNameFn,
  saveFundEconomicsFn,
} from "@/lib/fund-setup-canonical.functions";
import { approveEconomicsFn } from "@/lib/fund-setup.functions";
import {
  CANONICAL_SECTIONS,
  CANONICAL_SECTION_LABELS,
  SECTION_STATUS_LABELS,
  FUND_TYPES,
  FEE_FREQUENCY_CHOICES,
  FEE_FREQUENCY_LABEL,
  type FundClass,
  type EconomicTerms,
  type EconomicTermKey,
  classCountError,
  classDifferences,
  multipleClassesFromAnswer,
} from "@/lib/fund-setup-canonical";
import { OfferingDocumentsSetup } from "@/components/offering-documents-setup";
import { ClassAssignmentCard, FundSetupPhase3 } from "@/components/fund-setup-phase3";
import { FundServicesCard } from "@/components/fund-services-card";
import { FormationRecordCard } from "@/components/formation-record-card";
import { RequiredHere, LaunchRequirements } from "@/components/fund-setup-checklist";
import { staffSetupApplies } from "@/lib/staff-setup-applicability";
import { FundSignatoriesCard } from "@/components/fund-signatories-card";
import { Pencil, Plus, Save, CheckCircle2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { SideLetterRegistry } from "@/components/side-letter-registry";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const tone = (s: string) =>
  (s === "complete" ? "default" : s === "needs_attention" ? "destructive" : s === "not_applicable" ? "outline" : "secondary") as any;
const toCents = (v: string) => (v.trim() === "" ? null : Math.round(Number(v.replace(/[^0-9.]/g, "")) * 100));
const fromCents = (v: number | null | undefined) => (v == null ? "" : String(v / 100));
const num = (v: string) => (v.trim() === "" ? null : Number(v));

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

export function FundSetupCanonical({ offeringId, staffOnly = false, hideLaunch = false }: { offeringId: string; staffOnly?: boolean; hideLaunch?: boolean }) {
  const qc = useQueryClient();
  const load = useServerFn(getFundSetupOverview);
  const q = useQuery({ queryKey: ["fund-setup-canonical", offeringId], queryFn: () => load({ data: { offeringId } }) });
  const refresh = () => invalidateFund(qc, offeringId);

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading fund setup…</p>;
  if (q.error || !q.data) return <p className="text-sm text-destructive">Fund setup couldn't be loaded.</p>;
  const d = q.data;
  const applies = staffSetupApplies({ fundType: d.offering.fundType, hasMultipleClasses: (d.offering as any).hasMultipleClasses });

  if (staffOnly) return (
    <div className="space-y-6">
      <LegalNameCard d={d} offeringId={offeringId} onSaved={refresh} />
      <FundSetupPhase3 offeringId={offeringId} onChanged={refresh} hideBanking={!applies.banking} showClasses={applies.classAssignment} />
      <FormationRecordCard offeringId={offeringId} />
      <FundServicesCard offeringId={offeringId} onChanged={refresh} />
      {(applies.launch || !hideLaunch) && <LaunchRequirements />}
    </div>
  );
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Fund Setup</CardTitle>
          <p className="text-sm text-muted-foreground">
            Setup status for the fund itself. It is separate from each investor's readiness.
          </p>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {CANONICAL_SECTIONS.map((s) => {
            const r = (d.statuses as any)[s];
            const target = SECTION_ANCHOR[s];
            return (
              <a key={s} href={`#${target}`} onClick={jump(target ?? "")} className="rounded-md border p-3 transition-colors hover:border-primary/50 hover:bg-muted/40">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{CANONICAL_SECTION_LABELS[s]}</span>
                  <Badge variant={tone(r.status)}>{(SECTION_STATUS_LABELS as any)[r.status]}</Badge>
                </div>
                {r.next && <p className="mt-1 text-xs text-muted-foreground">{r.next} <span className="text-primary">Go →</span></p>}
              </a>
            );
          })}
        </CardContent>
      </Card>

      <GuidedSetup
        steps={[
          { label: "Basics", body: <>
            <LegalNameCard d={d} offeringId={offeringId} onSaved={refresh} />
            <div id="setup-details" className="scroll-mt-32 space-y-2"><RequiredHere section="setup-details" /><DetailsCard d={d} offeringId={offeringId} onSaved={refresh} /></div>
            <div id="setup-signatories" className="scroll-mt-32 space-y-2"><RequiredHere section="setup-signatories" /><FundSignatoriesCard offeringId={offeringId} onChanged={refresh} /></div>
          </> },
          { label: "Fees & terms", body: <div id="setup-economics" className="scroll-mt-32 space-y-2"><RequiredHere section="setup-economics" /><EconomicsCard d={d} offeringId={offeringId} onSaved={refresh} /></div> },
          { label: "Documents & questions", body: <div id="setup-documents" className="scroll-mt-32 space-y-2"><RequiredHere section="setup-documents" /><OfferingDocumentsSetup offeringId={offeringId} onChanged={refresh} /></div> },
          { label: "Banking", body: <FundSetupPhase3 offeringId={offeringId} onChanged={refresh} showClasses={false} /> },
          { label: "Review & approve", body: <>
            <FormationRecordCard offeringId={offeringId} />
            <FundServicesCard offeringId={offeringId} onChanged={refresh} />
            <LaunchRequirements />
          </> },
        ]}
      />
    </div>
  );
}

const jump = (id: string) => (e: React.MouseEvent) => {
  e.preventDefault();
  window.dispatchEvent(new CustomEvent("fund-setup-jump", { detail: id }));
  setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  return;
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
};

const SECTION_ANCHOR: Record<string, string> = {
  fund_details: "setup-details",
  entity_ein: "setup-entity",
  offering_economics: "setup-economics",
  classes: "setup-economics",
  offering_documents: "setup-documents",
  banking: "setup-banking",
  administration: "setup-admin",
  review: "setup-launch",
};

const JUMP_LINKS: [string, string][] = [
  ["setup-details", "Details"],
  ["setup-signatories", "Signatories"],
  ["setup-economics", "Economics"],
  ["setup-documents", "Documents"],
  ["setup-entity", "Entity & EIN"],
  ["setup-banking", "Banking"],
  ["setup-admin", "Regulatory"],
  ["setup-services", "Services"],
  ["setup-launch", "Launch"],
];

type D = Awaited<ReturnType<typeof getFundSetupOverview>>;

function LegalNameCard({ d, offeringId, onSaved }: { d: D; offeringId: string; onSaved: () => void }) {
  const preview = useServerFn(previewLegalNameChangeFn);
  const change = useServerFn(changeLegalNameFn);
  const [name, setName] = useState(d.offering.legalName ?? "");
  const [effective, setEffective] = useState("");
  const [reason, setReason] = useState("");
  const [warning, setWarning] = useState<string | null>(null);
  const dirty = name.trim() !== (d.offering.legalName ?? "");

  const submit = async () => {
    try {
      if (!warning) {
        const r = await preview({ data: { offeringId, legalName: name } });
        if (r.warning) return setWarning(r.warning);
      }
      await change({ data: { offeringId, legalName: name, effectiveDate: effective || null, reason: reason || null } });
      toast.success("Legal Name saved");
      setWarning(null);
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Legal Name</CardTitle>
        <p className="text-sm text-muted-foreground">Entered once and used on every document, bank record and report for this fund.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Legal Name"><Input value={name} disabled={!d.canEdit} onChange={(e) => { setName(e.target.value); setWarning(null); }} /></Field>
          {dirty && d.offering.legalName && (
            <>
              <Field label="Effective date"><Input type="date" value={effective} onChange={(e) => setEffective(e.target.value)} /></Field>
              <Field label="Reason for change"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            </>
          )}
        </div>
        {warning && <p className="rounded-md border border-destructive/40 p-3 text-sm">{warning}</p>}
        {d.canEdit && dirty && <Button onClick={submit}>{warning ? "Confirm name change" : "Save Legal Name"}</Button>}
        {d.legalNameHistory.length > 0 && (
          <div className="text-xs text-muted-foreground">
            <p className="font-medium">Earlier names</p>
            <ul className="mt-1 space-y-0.5">
              {d.legalNameHistory.map((h, i) => (
                <li key={i}>{h.previous ?? "(none)"} → {h.next} · effective {h.effectiveDate}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DetailsCard({ d, offeringId, onSaved }: { d: D; offeringId: string; onSaved: () => void }) {
  const save = useServerFn(saveFundSetupFieldsFn);
  const o = d.offering;
  const [f, setF] = useState<any>({});
  useEffect(() => {
    setF({
      displayName: o.displayName ?? "", fundType: o.fundType ?? "", gpName: o.gpName ?? "",
      signatoryPersonId: o.signatoryPersonId ?? "", signatoryTitle: o.signatoryTitle ?? "", signatoryCapacity: o.signatoryCapacity ?? "",
      signatoryEntityName: o.signatoryEntityName ?? "", fiscalYearEnd: d.setup?.fiscalYearEnd ?? "",
      fundTermMonths: d.setup?.fundTermMonths?.toString() ?? "", investmentPeriodMonths: d.setup?.investmentPeriodMonths?.toString() ?? "",
      entityType: o.entityType ?? "", jurisdiction: o.jurisdiction ?? "", formationDate: o.formationDate ?? "",
      registeredAgent: o.registeredAgent ?? "", principalAddress: o.principalAddress ?? "", taxClassification: o.taxClassification ?? "",
      regType: o.regType ?? "506b", targetRaise: fromCents(o.targetRaiseCents), maxOffering: fromCents(o.maxOfferingCents),
      minInvestment: fromCents(o.minInvestmentCents), maxInvestment: fromCents(o.maxInvestmentCents),
      offeringOpenDate: o.offeringOpenDate ?? "", offeringCloseDate: o.offeringCloseDate ?? "",
      rollingCloses: o.rollingCloses ? "yes" : o.rollingCloses === false ? "no" : "",
      driveFolderUrl: o.driveFolderUrl ?? "",
    });
    setLinks((o.driveLinks ?? []).map((l: any) => ({ label: l.label ?? "", url: l.url ?? "" })));
  }, [d]);
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [links, setLinks] = useState<{ label: string; url: string }[]>([]);
  const bind = (k: string) => ({ value: f[k] ?? "", disabled: !d.canEdit, onChange: (e: any) => setF({ ...f, [k]: e.target.value }) });
  const sel = (k: string, opts: [string, string][]) => (
    <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" {...bind(k)}>
      <option value="">-</option>
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );

  const submit = async () => {
    try {
      await save({
        data: {
          offeringId,
          fields: {
            displayName: f.displayName, fundType: f.fundType || null, gpName: f.gpName || null,
            signatoryEntityName: f.signatoryEntityName || null,
            entityType: f.entityType || null, jurisdiction: f.jurisdiction || null, formationDate: f.formationDate || null,
            registeredAgent: f.registeredAgent || null, principalAddress: f.principalAddress || null,
            taxClassification: f.taxClassification || null, regType: f.regType as any,
            targetRaiseCents: toCents(f.targetRaise ?? ""), maxOfferingCents: toCents(f.maxOffering ?? ""),
            minInvestmentCents: toCents(f.minInvestment ?? "") ?? 0, maxInvestmentCents: toCents(f.maxInvestment ?? ""),
            offeringOpenDate: f.offeringOpenDate || null, offeringCloseDate: f.offeringCloseDate || null,
            rollingCloses: f.rollingCloses === "" ? null : f.rollingCloses === "yes",
            driveFolderUrl: f.driveFolderUrl?.trim() || null,
            driveLinks: links.filter((l) => l.url.trim()).map((l) => ({ label: l.label.trim(), url: l.url.trim() })),
          },
          setupFields: {
            fiscalYearEnd: f.fiscalYearEnd || null,
            ...(d.termApplies ? { fundTermMonths: num(f.fundTermMonths ?? ""), investmentPeriodMonths: num(f.investmentPeriodMonths ?? "") } : {}),
          },
        },
      });
      toast.success("Fund setup saved");
      setEditing(new Set());
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Fund Details, Entity & Offering</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <EditableSection id="basics" title="Fund basics" keys={["displayName","fundType","gpName","signatoryEntityName","fiscalYearEnd","fundTermMonths","investmentPeriodMonths"]} f={f} labels={LABELS} editing={editing} setEditing={setEditing} canEdit={d.canEdit}>
        <section className="grid gap-3 sm:grid-cols-3">
          <Field label="Display name"><Input {...bind("displayName")} /></Field>
          <Field label="Fund Type">{sel("fundType", FUND_TYPES.map((t) => [t, t]))}</Field>
          <Field label="Fund Manager / GP"><Input {...bind("gpName")} /></Field>
          <Field label="Signing entity"><Input {...bind("signatoryEntityName")} /></Field>
          <Field label="Fiscal year end (MM-DD)"><Input placeholder="12-31" {...bind("fiscalYearEnd")} /></Field>
          {d.termApplies && <Field label="Fund term (months)"><Input inputMode="numeric" {...bind("fundTermMonths")} /></Field>}
          {d.termApplies && <Field label="Investment period (months)"><Input inputMode="numeric" {...bind("investmentPeriodMonths")} /></Field>}
        </section>
        </EditableSection>
        <EditableSection id="entity" title="Entity" keys={["entityType","jurisdiction","formationDate","registeredAgent","principalAddress","taxClassification"]} f={f} labels={LABELS} editing={editing} setEditing={setEditing} canEdit={d.canEdit}>
        <section className="grid gap-3 sm:grid-cols-3">
          <Field label="Entity type">{sel("entityType", ["LLC", "LP", "Series LLC", "Master LLC", "Corporation", "Trust", "Other"].map((t) => [t, t]))}</Field>
          <Field label="Jurisdiction of formation"><Input {...bind("jurisdiction")} /></Field>
          <Field label="Formation date"><Input type="date" {...bind("formationDate")} /></Field>
          <Field label="Registered agent"><Input {...bind("registeredAgent")} /></Field>
          <Field label="Principal business address"><Input {...bind("principalAddress")} /></Field>
          <Field label="Tax classification"><Input placeholder="e.g. Partnership" {...bind("taxClassification")} /></Field>
        </section>
        </EditableSection>
        <ServiceProvidersSection offeringId={offeringId} />
        <EditableSection id="drive" title="Google Drive" keys={["driveFolderUrl"]} f={f} labels={LABELS} editing={editing} setEditing={setEditing} canEdit={d.canEdit}>
        <section className="grid gap-3 sm:grid-cols-3">
          <Field label="Main Google Drive folder"><Input placeholder="https://drive.google.com/drive/folders/…" {...bind("driveFolderUrl")} /></Field>
        </section>
        </EditableSection>
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Other Google Drive links</h3>
            {d.canEdit && <Button type="button" size="sm" variant="outline" onClick={() => setLinks([...links, { label: "", url: "" }])}>Add link</Button>}
          </div>
          {links.length === 0 && <p className="text-xs text-muted-foreground">No other links yet. Add folders like Tax Docs, Fund Docs or Formation Docs.</p>}
          {links.map((l, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto] items-center">
              <Input placeholder="Label, e.g. Tax Docs" value={l.label} disabled={!d.canEdit} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <Input placeholder="https://drive.google.com/…" value={l.url} disabled={!d.canEdit} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
              <div className="flex gap-1">
                {l.url && <Button type="button" size="sm" variant="ghost" asChild><a href={l.url} target="_blank" rel="noreferrer">Open</a></Button>}
                {d.canEdit && <Button type="button" size="sm" variant="ghost" onClick={() => setLinks(links.filter((_, j) => j !== i))}>Remove</Button>}
              </div>
            </div>
          ))}
        </section>
        <p className="text-xs text-muted-foreground">The Drive link is a reference for the team only; it never changes Drive permissions and is never shown to investors.</p>
        <p className="text-xs text-muted-foreground">The EIN and EIN letter stay in the locked Entity & EIN card; they are never shown to investors.</p>
        <EditableSection id="offering" title="Offering" keys={["regType","targetRaise","maxOffering","minInvestment","maxInvestment","rollingCloses","offeringOpenDate","offeringCloseDate"]} f={f} labels={LABELS} editing={editing} setEditing={setEditing} canEdit={d.canEdit}>
        <section className="grid gap-3 sm:grid-cols-3">
          <Field label="Offering exemption">{sel("regType", [["506b", "Rule 506(b)"], ["506c", "Rule 506(c)"], ["regcf", "Reg CF"], ["rega", "Reg A"], ["regaplus", "Reg A+"]])}</Field>
          <Field label="Target raise ($)"><Input inputMode="decimal" {...bind("targetRaise")} /></Field>
          <Field label="Maximum offering ($)"><Input inputMode="decimal" {...bind("maxOffering")} /></Field>
          <Field label="Minimum investment ($)"><Input inputMode="decimal" {...bind("minInvestment")} /></Field>
          <Field label="Maximum investment ($)"><Input inputMode="decimal" {...bind("maxInvestment")} /></Field>
          <Field label="Rolling closes">{sel("rollingCloses", [["yes", "Permitted"], ["no", "Not permitted"]])}</Field>
          <Field label="Offering opens"><Input type="date" {...bind("offeringOpenDate")} /></Field>
          <Field label="Offering closes"><Input type="date" {...bind("offeringCloseDate")} /></Field>
        </section>
        </EditableSection>
        <p className="text-xs text-muted-foreground">The exemption is chosen by you and counsel; it is never picked automatically from the fund type.</p>
        {d.canEdit && (
          <div className="flex gap-2">
            <Button onClick={submit}>Save</Button>
            {editing.size > 0 && <Button variant="ghost" onClick={() => { setEditing(new Set()); onSaved(); }}>Cancel</Button>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const LABELS: Record<string, string> = {
  displayName: "Display name", fundType: "Fund Type", gpName: "Fund Manager / GP", signatoryEntityName: "Signing entity",
  fiscalYearEnd: "Fiscal year end", fundTermMonths: "Fund term (months)", investmentPeriodMonths: "Investment period (months)",
  entityType: "Entity type", jurisdiction: "Jurisdiction", formationDate: "Formation date", registeredAgent: "Registered agent",
  principalAddress: "Principal address", taxClassification: "Tax classification", driveFolderUrl: "Google Drive folder",
  regType: "Offering exemption", targetRaise: "Target raise", maxOffering: "Maximum offering", minInvestment: "Minimum investment",
  maxInvestment: "Maximum investment", rollingCloses: "Rolling closes", offeringOpenDate: "Offering opens", offeringCloseDate: "Offering closes",
};
const MONEY = new Set(["targetRaise", "maxOffering", "minInvestment", "maxInvestment"]);
const REG: Record<string, string> = { "506b": "Rule 506(b)", "506c": "Rule 506(c)", regcf: "Reg CF", rega: "Reg A", regaplus: "Reg A+" };
function show(k: string, v: string) {
  if (MONEY.has(k)) return `$${Number(v).toLocaleString()}`;
  if (k === "regType") return REG[v] ?? v;
  if (k === "rollingCloses") return v === "yes" ? "Permitted" : "Not permitted";
  return v;
}

/** Shows saved values as a summary; tap to switch that section into edit mode. Empty sections open in edit mode. */
function EditableSection({ id, title, keys, f, labels, editing, setEditing, canEdit, children }: {
  id: string; title: string; keys: string[]; f: Record<string, string>; labels: Record<string, string>;
  editing: Set<string>; setEditing: (s: Set<string>) => void; canEdit: boolean; children: React.ReactNode;
}) {
  const filled = keys.filter((k) => (f[k] ?? "") !== "");
  if (filled.length === 0 || editing.has(id)) return <>{children}</>;
  const open = () => { if (canEdit) setEditing(new Set([...editing, id])); };
  return (
    <button type="button" onClick={open} disabled={!canEdit} className="block w-full rounded-md border p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/40 disabled:cursor-default">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        {canEdit && <span className="text-xs text-primary">Edit</span>}
      </div>
      <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-3">
        {filled.map((k) => (
          <div key={k} className="min-w-0">
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{labels[k] ?? k}</dt>
            <dd className="truncate text-sm">{show(k, f[k]!)}</dd>
          </div>
        ))}
      </dl>
    </button>
  );
}

const emptyFee = { ratePercent: null, basis: null, frequency: null };

const FEE_PRESETS = [0.5, 1, 1.5, 2, 2.5];
const CARRY_PRESETS = [10, 15, 20, 25, 30];
const HURDLE_PRESETS = [6, 7, 8, 10];
const MIN_PRESETS = [1000, 5000, 10000, 25000, 50000, 100000, 250000];
const ORG_EXPENSE_PRESETS = ["Borne by the Fund", "Borne by the Manager", "Borne by the Fund up to a cap", "Reimbursed to the Manager at closing"];
const DISTRIBUTION_PRESETS = ["As realized", "Quarterly", "Semi-annually", "Annually", "At the Manager's discretion"];

function toggle(c: FundClass, k: EconomicTermKey, on: boolean): EconomicTermKey[] {
  const s = new Set(c.notApplicable ?? []);
  if (on) s.add(k); else s.delete(k);
  return [...s];
}

const selCls = "h-9 w-full rounded-md border bg-background px-2 text-sm";

/** Numeric dropdown: common values, Other (custom), Not applicable, and optionally "Same as fund default". */
function PresetSelect({ options, value, na, onChange, disabled, suffix = "", prefix = "", allowDefault }: {
  options: number[]; value: number | null; na: boolean; onChange: (v: number | null, na: boolean) => void; disabled?: boolean; suffix?: string; prefix?: string; allowDefault?: boolean;
}) {
  const [custom, setCustom] = useState(false);
  const isPreset = value != null && options.includes(value);
  const mode = na ? "na" : value == null ? (custom ? "other" : "") : isPreset && !custom ? String(value) : "other";
  return (
    <div className="space-y-1">
      <select className={selCls} disabled={disabled} value={mode} onChange={(e) => {
        const v = e.target.value;
        if (v === "na") { setCustom(false); onChange(null, true); }
        else if (v === "other") { setCustom(true); onChange(value, false); }
        else if (v === "") { setCustom(false); onChange(null, false); }
        else { setCustom(false); onChange(Number(v), false); }
      }}>
        <option value="">{allowDefault ? "Same as fund default" : "Not set"}</option>
        {options.map((o) => <option key={o} value={String(o)}>{prefix}{o.toLocaleString()}{suffix}</option>)}
        <option value="other">Other…</option>
        <option value="na">Not applicable</option>
      </select>
      {mode === "other" && <Input inputMode="decimal" disabled={disabled} placeholder={`Enter ${suffix ? "%" : "amount"}`} value={value ?? ""} onChange={(e) => onChange(num(e.target.value), false)} />}
    </div>
  );
}

function TextPresetSelect({ options, value, na, onChange, disabled }: { options: string[]; value: string | null; na: boolean; onChange: (v: string | null, na: boolean) => void; disabled?: boolean }) {
  const [custom, setCustom] = useState(false);
  const mode = na ? "na" : !value ? (custom ? "other" : "") : options.includes(value) && !custom ? value : "other";
  return (
    <div className="space-y-1">
      <select className={selCls} disabled={disabled} value={mode} onChange={(e) => {
        const v = e.target.value;
        if (v === "na") { setCustom(false); onChange(null, true); }
        else if (v === "other") { setCustom(true); onChange(value && !options.includes(value) ? value : null, false); }
        else if (v === "") { setCustom(false); onChange(null, false); }
        else { setCustom(false); onChange(v, false); }
      }}>
        <option value="">Not set</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
        <option value="other">Other…</option>
        <option value="na">Not applicable</option>
      </select>
      {mode === "other" && <Input disabled={disabled} placeholder="Describe" value={value ?? ""} onChange={(e) => onChange(e.target.value || null, false)} />}
    </div>
  );
}

export function EconomicsCard({ d, offeringId, onSaved }: { d: D; offeringId: string; onSaved: () => void }) {
  const save = useServerFn(saveFundEconomicsFn);
  const saveFields = useServerFn(saveFundSetupFieldsFn);
  const approve = useServerFn(approveEconomicsFn);
  const [terms, setTerms] = useState<EconomicTerms>({ managementFee: emptyFee as any, carry: { ratePercent: null } });
  const [classes, setClasses] = useState<FundClass[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  useEffect(() => {
    setTerms({ managementFee: (d.economics.terms?.managementFee ?? emptyFee) as any, carry: d.economics.terms?.carry ?? { ratePercent: null }, preferredReturnPercent: d.economics.terms?.preferredReturnPercent ?? null, orgExpenseTreatment: d.economics.terms?.orgExpenseTreatment ?? null, distributionFrequency: d.economics.terms?.distributionFrequency ?? null, notApplicable: d.economics.terms?.notApplicable ?? [] });
    setClasses(d.economics.classes ?? []);
    setSavedSnapshot(JSON.stringify({ terms: { managementFee: (d.economics.terms?.managementFee ?? emptyFee), carry: d.economics.terms?.carry ?? { ratePercent: null }, preferredReturnPercent: d.economics.terms?.preferredReturnPercent ?? null, orgExpenseTreatment: d.economics.terms?.orgExpenseTreatment ?? null, distributionFrequency: d.economics.terms?.distributionFrequency ?? null, notApplicable: d.economics.terms?.notApplicable ?? [] }, classes: d.economics.classes ?? [] }));
  }, [d]);
  const fee = terms.managementFee ?? (emptyFee as any);
  const setFee = (p: any) => setTerms({ ...terms, managementFee: { ...fee, ...p } });
  const multi = d.offering.hasMultipleClasses;
  const planned = (d.offering as any).plannedClassCount as number | null;
  const [multiAnswer, setMultiAnswer] = useState(multi || planned === 1);
  const [countDraft, setCountDraft] = useState(String(planned ?? (multi ? 2 : "")));
  const [confirmed, setConfirmed] = useState(false);
  const [sideLettersOpen, setSideLettersOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setMultiAnswer(multi || planned === 1); setCountDraft(String(planned ?? (multi ? 2 : ""))); }, [multi, planned]);
  const saveClassAnswer = (yes: boolean, count: number | null) => {
    const a = multipleClassesFromAnswer({ yes, count });
    return run(() => saveFields({ data: { offeringId, fields: { hasMultipleClasses: a.hasMultipleClasses, plannedClassCount: a.plannedClassCount } } }), "Saved");
  };
  const countErr = multi ? classCountError(planned, classes) : null;
  const diffs = classDifferences({ ...terms, minInvestmentCents: d.offering.minInvestmentCents ?? null }, classes);
  const unsaved = savedSnapshot !== "" && JSON.stringify({ terms, classes }) !== savedSnapshot;
  const isNa = (k: EconomicTermKey) => !!terms.notApplicable?.includes(k);
  const setNa = (k: EconomicTermKey, on: boolean, patch: Partial<EconomicTerms> = {}) =>
    setTerms((t) => {
      const cur = new Set(t.notApplicable ?? []);
      if (on) cur.add(k); else cur.delete(k);
      return { ...t, ...patch, notApplicable: [...cur] };
    });

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); onSaved(); } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <section className="min-w-0 space-y-5" aria-label="Fees and terms">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Fees and terms</h2>
          <p className="text-sm text-muted-foreground">{d.offering.legalName || "Fund terms"}</p>
        </div>
        <Badge variant={d.economics.status === "approved" && !unsaved ? "default" : "secondary"}>
          {unsaved ? "Unsaved changes · " : ""}
          {d.economics.status === "draft" ? `Draft v${d.economics.version}` : d.economics.approvedVersion ? `Approved v${d.economics.approvedVersion}` : "Not recorded"}
        </Badge>
      </header>
      <div className="border-l-2 border-primary bg-muted/40 px-4 py-3 text-sm">
        <p className="font-medium">{d.economics.status === "draft" ? "Pending approval" : d.economics.approvedVersion ? "Approved terms in use" : "Terms not yet saved"}</p>
        <p className="mt-1 text-muted-foreground">{d.economics.status === "draft" ? `Ready for an authorized approval.${d.economics.approvedVersion ? ` Approved v${d.economics.approvedVersion} remains in use.` : " Classes cannot be assigned until approval."}` : "Saving changes creates a draft. Signed records and approved terms remain unchanged."}</p>
      </div>
      <Tabs defaultValue={multi ? "classes" : "defaults"} className="min-w-0">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="defaults">Fund defaults</TabsTrigger>
          {multi && <TabsTrigger value="classes">Classes ({classes.length})</TabsTrigger>}
          {multi && <TabsTrigger value="investors">Investor assignments</TabsTrigger>}
        </TabsList>
        <TabsContent value="defaults" className="space-y-5 pt-3">
        <section className="space-y-2 border-b pb-4">
          <Label>Will this fund have multiple classes?</Label>
          <div className="flex flex-wrap items-end gap-3">
            <select aria-label="Multiple classes" className="h-9 rounded-md border bg-background px-2 text-sm" disabled={!d.canEdit} value={multiAnswer ? "yes" : "no"}
              onChange={(e) => { const yes = e.target.value === "yes"; setMultiAnswer(yes); if (!yes) saveClassAnswer(false, null); }}>
              <option value="no">No</option><option value="yes">Yes</option>
            </select>
            {multiAnswer && (
              <Field label="How many classes?">
                <Input type="number" min={1} max={20} className="w-28" disabled={!d.canEdit} value={countDraft}
                  onChange={(e) => setCountDraft(e.target.value)} onBlur={() => { const n = Number(countDraft); if (Number.isInteger(n) && n >= 1 && n <= 20) saveClassAnswer(true, n); }} />
              </Field>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{multi ? `Enter each of the ${planned ?? "planned"} classes below and confirm how they differ.` : "Fund default terms apply unless an investor has separately approved side-letter exceptions."}</p>
        </section>
        <h3 className="text-sm font-medium">{multi ? "Fund defaults" : "Fund default terms"}</h3>
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Management fee (%)">
            <PresetSelect disabled={!d.canEdit} options={FEE_PRESETS} na={isNa("managementFee")} value={fee.ratePercent}
              onChange={(v, na) => { setNa("managementFee", na); setFee(na ? { ratePercent: null, basis: null, frequency: null } : { ratePercent: v, basis: fee.basis ?? (v != null ? "committed_capital" : null), frequency: fee.frequency ?? (v != null ? "annual" : null) }); }} suffix="%" />
          </Field>
          <Field label="Basis">
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" disabled={!d.canEdit || isNa("managementFee")} value={isNa("managementFee") ? "na" : fee.basis ?? ""} onChange={(e) => setFee({ basis: e.target.value || null })}>
              {isNa("managementFee") ? <option value="na">Not applicable</option> : <option value="">-</option>}
              <option value="committed_capital">Committed capital</option><option value="invested_capital">Invested capital</option><option value="capital_account_balance">Capital account balance</option><option value="nav">NAV</option><option value="flat">Flat amount</option>
            </select>
          </Field>
          <Field label="Frequency">
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" disabled={!d.canEdit || isNa("managementFee")} value={isNa("managementFee") ? "na" : fee.frequency ?? ""} onChange={(e) => setFee({ frequency: e.target.value || null })}>
              {isNa("managementFee") ? <option value="na">Not applicable</option> : <option value="">-</option>}
              {FEE_FREQUENCY_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              {fee.frequency === "quarterly" || fee.frequency === "monthly" ? <option value={fee.frequency}>{FEE_FREQUENCY_LABEL[fee.frequency]} (older setting)</option> : null}
            </select>
          </Field>
          <Field label="Carry (%)">
            <PresetSelect disabled={!d.canEdit} options={CARRY_PRESETS} na={isNa("carry")} value={terms.carry?.ratePercent ?? null}
              onChange={(v, na) => { setNa("carry", na, { carry: { ...(terms.carry ?? {}), ratePercent: na ? null : v } }); }} suffix="%" />
          </Field>
          <Field label="Preferred return / hurdle (%)">
            <PresetSelect disabled={!d.canEdit} options={HURDLE_PRESETS} na={isNa("preferredReturn")} value={terms.preferredReturnPercent ?? null}
              onChange={(v, na) => setNa("preferredReturn", na, { preferredReturnPercent: na ? null : v })} suffix="%" />
          </Field>
          <Field label="Formation expense treatment">
            <TextPresetSelect disabled={!d.canEdit} options={ORG_EXPENSE_PRESETS} na={isNa("orgExpense")} value={terms.orgExpenseTreatment ?? null}
              onChange={(v, na) => setNa("orgExpense", na, { orgExpenseTreatment: na ? null : v })} />
          </Field>
          <Field label="Distribution frequency">
            <TextPresetSelect disabled={!d.canEdit} options={DISTRIBUTION_PRESETS} na={isNa("distributionFrequency")} value={terms.distributionFrequency ?? null}
              onChange={(v, na) => setNa("distributionFrequency", na, { distributionFrequency: na ? null : v })} />
          </Field>
        </section>
        </TabsContent>
        {multi && (
          <TabsContent value="classes" className="min-w-0 space-y-4 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-medium">Class comparison</h3>
              {d.canEdit && (planned == null || classes.length < planned) && <Button size="sm" variant="outline" onClick={() => { setClasses([...classes, { key: "", name: `Class ${String.fromCharCode(65 + classes.length)}` }]); setEditingClass(classes.length); }}><Plus className="size-4" />Add class</Button>}
            </div>
            {classes.length > 0 ? <Table aria-label="Class terms comparison" className="min-w-[660px]">
              <TableHeader><TableRow className="bg-muted/50"><TableHead className="w-44">Term</TableHead><TableHead className="min-w-36">Fund default</TableHead>{classes.map((c, i) => <TableHead key={i} className="min-w-36"><div className="flex items-center gap-2"><span className="font-semibold text-foreground">{c.name || "Unnamed class"}</span>{d.canEdit && <Button size="icon" variant="ghost" aria-label={`Edit ${c.name || "class"}`} title={`Edit ${c.name || "class"}`} onClick={() => setEditingClass(i)}><Pencil className="size-4" /></Button>}</div></TableHead>)}</TableRow></TableHeader>
              <TableBody>{diffs.map((r) => <TableRow key={r.term}><TableCell className="font-medium">{r.term}</TableCell><TableCell className="text-muted-foreground">{r.fundDefault === "-" ? "Not set" : r.fundDefault}</TableCell>{r.perClass.map((v, i) => <TableCell key={i} className={v.differs ? "font-medium text-primary" : "text-muted-foreground"}>{v.value === "-" ? "Not set" : v.value}</TableCell>)}</TableRow>)}<TableRow><TableCell className="font-medium">Maximum investment (exclusive)</TableCell><TableCell className="text-muted-foreground">No maximum</TableCell>{classes.map((c, i) => <TableCell key={i}>{c.maxInvestmentCents == null ? "No maximum" : `$${(c.maxInvestmentCents / 100).toLocaleString("en-US")}`}</TableCell>)}</TableRow></TableBody>
            </Table> : <p className="py-6 text-sm text-muted-foreground">No classes recorded.</p>}
            {countErr && <p role="alert" className="text-sm text-destructive">{countErr}</p>}
            {classes.map((c, i) => {
              const upd = (p: Partial<FundClass>) => setClasses(classes.map((x, j) => (j === i ? { ...x, ...p } : x)));
              const cNa = (k: EconomicTermKey) => !!c.notApplicable?.includes(k);
              if (editingClass !== i) return null;
              return (
                <Dialog key={i} open onOpenChange={(open) => { if (!open) setEditingClass(null); }}>
                <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
                <DialogHeader><DialogTitle>{c.name || "New class"}</DialogTitle><DialogDescription>Changes are part of the fees and terms draft, not live terms.</DialogDescription></DialogHeader>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2 flex flex-wrap items-end gap-3 border-b pb-3">
                    <Field label="Class name"><Input className="w-56 font-medium" disabled={!d.canEdit} value={c.name} placeholder="e.g. Series A-1" onChange={(e) => upd({ name: e.target.value })} /></Field>
                    
                  </div>
                  <Field label="Fee basis">
                    <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" disabled={!d.canEdit || cNa("managementFee") || !c.managementFee} value={c.managementFee?.basis ?? ""} onChange={(e) => upd({ managementFee: { ...(c.managementFee ?? fee), basis: (e.target.value || null) as any } })}>
                      <option value="">Same as shared</option><option value="committed_capital">Committed capital</option><option value="invested_capital">Invested capital</option><option value="capital_account_balance">Capital account balance</option><option value="nav">NAV</option><option value="flat">Flat amount</option>
                    </select>
                  </Field>
                  <Field label="Fee frequency">
                    <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" disabled={!d.canEdit || cNa("managementFee") || !c.managementFee} value={c.managementFee?.frequency ?? ""} onChange={(e) => upd({ managementFee: { ...(c.managementFee ?? fee), frequency: (e.target.value || null) as any } })}>
                      <option value="">Same as shared</option>
                      {FEE_FREQUENCY_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </Field>
                  <Field label="Preferred return / hurdle (%)">
                    <PresetSelect disabled={!d.canEdit} options={HURDLE_PRESETS} allowDefault na={cNa("preferredReturn")} value={c.preferredReturnPercent ?? null}
                      onChange={(v, na) => upd({ notApplicable: toggle(c, "preferredReturn", na), preferredReturnPercent: na ? null : v })} suffix="%" />
                  </Field>
                  <Field label="Mgmt fee (%)">
                    <PresetSelect disabled={!d.canEdit} options={FEE_PRESETS} allowDefault na={cNa("managementFee")} value={c.managementFee?.ratePercent ?? null}
                      onChange={(v, na) => upd({ notApplicable: toggle(c, "managementFee", na), managementFee: na || v == null ? null : { ...(c.managementFee ?? fee), ratePercent: v } })} suffix="%" />
                  </Field>
                  <Field label="Carry (%)">
                    <PresetSelect disabled={!d.canEdit} options={CARRY_PRESETS} allowDefault na={cNa("carry")} value={c.carry?.ratePercent ?? null}
                      onChange={(v, na) => upd({ notApplicable: toggle(c, "carry", na), carry: na || v == null ? null : { ratePercent: v } })} suffix="%" />
                  </Field>
                  <Field label="Minimum ($)">
                    <PresetSelect disabled={!d.canEdit} options={MIN_PRESETS} allowDefault na={cNa("minInvestment")} value={c.minInvestmentCents != null ? c.minInvestmentCents / 100 : null}
                      onChange={(v, na) => upd({ notApplicable: toggle(c, "minInvestment", na), minInvestmentCents: na || v == null ? null : Math.round(v * 100) })} prefix="$" />
                  </Field>
                  <Field label="Up to, not including ($), blank for no top">
                    <Input disabled={!d.canEdit} inputMode="numeric" value={c.maxInvestmentCents != null ? String(c.maxInvestmentCents / 100) : ""} placeholder="No top"
                      onChange={(e) => { const n = Number(e.target.value.replace(/[^0-9.]/g, "")); upd({ maxInvestmentCents: e.target.value.trim() && Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null }); }} />
                  </Field>
                  <Field label="Applies to (which investors)"><Input disabled={!d.canEdit} value={c.appliesTo ?? ""} placeholder="e.g. Founding investors" onChange={(e) => upd({ appliesTo: e.target.value })} /></Field>
                  <Field label="Organizational expenses"><Input disabled={!d.canEdit} value={c.orgExpenseTreatment ?? ""} placeholder="Same as fund default" onChange={(e) => upd({ orgExpenseTreatment: e.target.value || null })} /></Field>
                  <Field label="Distribution frequency"><Input disabled={!d.canEdit} value={c.distributionFrequency ?? ""} placeholder="Same as fund default" onChange={(e) => upd({ distributionFrequency: e.target.value || null })} /></Field>
                  <Field label="Assets / allocation"><Input disabled={!d.canEdit} value={c.assetScope ?? ""} placeholder="All fund assets" onChange={(e) => upd({ assetScope: e.target.value || null })} /></Field>
                  <div className="sm:col-span-2"><Field label="Other differences"><Textarea rows={2} disabled={!d.canEdit} value={c.otherDifferences ?? ""} placeholder="Anything else that's different for this class" onChange={(e) => upd({ otherDifferences: e.target.value || null })} /></Field></div>
                                  </div>
                <div className="flex justify-between gap-3 border-t pt-4">
                  {d.canEdit && <Button variant="ghost" onClick={() => { setClasses(classes.filter((_, j) => j !== i)); setEditingClass(null); }}>Remove class</Button>}
                  <Button onClick={() => setEditingClass(null)}>Done</Button>
                </div>
                </DialogContent></Dialog>
              );
            })}
            {classes.length > 0 && d.canEdit && (
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} />
                <span>I've reviewed how each class differs from the fund default for its group of investors.</span>
              </label>
            )}
          </TabsContent>
        )}
        {multi && <TabsContent value="investors" className="pt-3"><ClassAssignmentCard offeringId={offeringId} /></TabsContent>}
        </Tabs>

        <section className="border-t pt-4">
          <h3 className="mb-2 text-sm font-medium">Investor-specific waivers / changes</h3>
          <Button variant="outline" onClick={() => setSideLettersOpen(true)}>Associate side-letter exceptions</Button>
        </section>
        {sideLettersOpen && <Dialog open onOpenChange={setSideLettersOpen}>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Investor side-letter exceptions</DialogTitle><DialogDescription>Associate waivers and changed terms with the investor separately from fund defaults and class definitions.</DialogDescription></DialogHeader>
            <SideLetterRegistry fundId={offeringId} />
          </DialogContent>
        </Dialog>}

        {d.canEdit && (
          <div className="flex flex-wrap items-center gap-3 border-t py-4">
            <Button disabled={busy} onClick={() => run(() => save({ data: { offeringId, terms: terms as any, classes: multi ? (classes as any) : [], classDifferencesConfirmed: confirmed } }), "Economics saved as a draft")}><Save className="size-4" />{busy ? "Saving…" : "Save terms draft"}</Button>
            {d.canEdit && d.economics.canApprove && unsaved && (
              <Button variant="outline" disabled={busy}
                onClick={() => void run(async () => {
                  const saved: any = await save({ data: { offeringId, terms: terms as any, classes: multi ? (classes as any) : [], classDifferencesConfirmed: confirmed } });
                  const versionId = saved?.id ?? d.economics.versionId;
                  if (!versionId) throw new Error("Saved, but the version could not be approved. Approve it from the approvals list.");
                  await approve({ data: { versionId } });
                }, "Economics saved and approved")}>
                <CheckCircle2 className="size-4" />{busy ? "Saving…" : "Save & approve"}
              </Button>
            )}
            {d.economics.canApprove && d.economics.status === "draft" && d.economics.versionId && (
              <Button variant="outline" disabled={busy || unsaved} title={unsaved ? "Save changes before reviewing this version" : undefined}
                onClick={() => { const versionId = d.economics.versionId; if (versionId) void run(() => approve({ data: { versionId } }), "Economics approved"); }}>
                <CheckCircle2 className="size-4" />Approve saved version
              </Button>
            )}
          </div>
        )}
    </section>
  );
}

const ANCHOR_STEP: Record<string, number> = { "setup-details": 0, "setup-signatories": 0, "setup-economics": 1, "setup-documents": 2 };

function GuidedSetup({ steps }: { steps: { label: string; body: ReactNode }[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const onJump = (e: Event) => { const id = (e as CustomEvent<string>).detail; setI(ANCHOR_STEP[id] ?? 3); };
    window.addEventListener("fund-setup-jump", onJump);
    return () => window.removeEventListener("fund-setup-jump", onJump);
  }, []);
  const go = (n: number) => { setI(n); requestAnimationFrame(() => document.getElementById("guided-setup")?.scrollIntoView({ behavior: "smooth", block: "start" })); };
  return (
    <div id="guided-setup" className="scroll-mt-20 space-y-4">
      <ol aria-label="Fund setup steps" className="sticky top-16 z-20 flex gap-1 overflow-x-auto rounded-md border bg-background/95 p-1 backdrop-blur">
        {steps.map((s, n) => (
          <li key={s.label} className="shrink-0">
            <button type="button" onClick={() => go(n)} aria-current={n === i ? "step" : undefined}
              className={`flex items-center gap-2 rounded px-2.5 py-1.5 text-xs ${n === i ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
              <span className="font-medium">{n + 1}</span>{s.label}
            </button>
          </li>
        ))}
      </ol>
      <div className="space-y-6">{steps[i].body}</div>
      <div className="flex justify-between gap-2 border-t pt-4">
        <Button variant="outline" disabled={i === 0} onClick={() => go(i - 1)}>Back</Button>
        {i < steps.length - 1 ? <Button onClick={() => go(i + 1)}>Next: {steps[i + 1].label}</Button> : null}
      </div>
    </div>
  );
}
