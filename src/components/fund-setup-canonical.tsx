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
  type FundClass,
  type EconomicTerms,
} from "@/lib/fund-setup-canonical";
import { OfferingDocumentsSetup } from "@/components/offering-documents-setup";
import { FundSetupPhase3 } from "@/components/fund-setup-phase3";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

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

export function FundSetupCanonical({ offeringId }: { offeringId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(getFundSetupOverview);
  const q = useQuery({ queryKey: ["fund-setup-canonical", offeringId], queryFn: () => load({ data: { offeringId } }) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["fund-setup-canonical", offeringId] });

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading fund setup…</p>;
  if (q.error || !q.data) return <p className="text-sm text-destructive">Fund setup couldn't be loaded.</p>;
  const d = q.data;

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
            return (
              <div key={s} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{CANONICAL_SECTION_LABELS[s]}</span>
                  <Badge variant={tone(r.status)}>{(SECTION_STATUS_LABELS as any)[r.status]}</Badge>
                </div>
                {r.next && <p className="mt-1 text-xs text-muted-foreground">{r.next}</p>}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <LegalNameCard d={d} offeringId={offeringId} onSaved={refresh} />
      <DetailsCard d={d} offeringId={offeringId} onSaved={refresh} />
      <EconomicsCard d={d} offeringId={offeringId} onSaved={refresh} />
      <OfferingDocumentsSetup offeringId={offeringId} onChanged={refresh} />
      <FundSetupPhase3 offeringId={offeringId} onChanged={refresh} />
      <Card>
        <CardHeader><CardTitle className="text-base">Banking and Administration</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          These sections use the fund's existing Banking tab for now. Bank verification and administration settings come in the next phase.
        </CardContent>
      </Card>
    </div>
  );
}

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
    });
  }, [d]);
  const bind = (k: string) => ({ value: f[k] ?? "", disabled: !d.canEdit, onChange: (e: any) => setF({ ...f, [k]: e.target.value }) });
  const sel = (k: string, opts: [string, string][]) => (
    <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" {...bind(k)}>
      <option value="">—</option>
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
            signatoryPersonId: f.signatoryPersonId || null, signatoryTitle: f.signatoryTitle || null,
            signatoryCapacity: f.signatoryCapacity || null, signatoryEntityName: f.signatoryEntityName || null,
            entityType: f.entityType || null, jurisdiction: f.jurisdiction || null, formationDate: f.formationDate || null,
            registeredAgent: f.registeredAgent || null, principalAddress: f.principalAddress || null,
            taxClassification: f.taxClassification || null, regType: f.regType as any,
            targetRaiseCents: toCents(f.targetRaise ?? ""), maxOfferingCents: toCents(f.maxOffering ?? ""),
            minInvestmentCents: toCents(f.minInvestment ?? "") ?? 0, maxInvestmentCents: toCents(f.maxInvestment ?? ""),
            offeringOpenDate: f.offeringOpenDate || null, offeringCloseDate: f.offeringCloseDate || null,
            rollingCloses: f.rollingCloses === "" ? null : f.rollingCloses === "yes",
          },
          setupFields: {
            fiscalYearEnd: f.fiscalYearEnd || null,
            ...(d.termApplies ? { fundTermMonths: num(f.fundTermMonths ?? ""), investmentPeriodMonths: num(f.investmentPeriodMonths ?? "") } : {}),
          },
        },
      });
      toast.success("Fund setup saved");
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Fund Details, Entity & Offering</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <section className="grid gap-3 sm:grid-cols-3">
          <Field label="Display name"><Input {...bind("displayName")} /></Field>
          <Field label="Fund Type">{sel("fundType", FUND_TYPES.map((t) => [t, t]))}</Field>
          <Field label="Fund Manager / GP"><Input {...bind("gpName")} /></Field>
          <Field label="Fund Signatory">{sel("signatoryPersonId", d.signatoryOptions.map((p) => [p.id, p.name]))}</Field>
          <Field label="Signatory title"><Input {...bind("signatoryTitle")} /></Field>
          <Field label="Capacity"><Input placeholder="e.g. Managing Member of the GP" {...bind("signatoryCapacity")} /></Field>
          <Field label="Signing entity"><Input {...bind("signatoryEntityName")} /></Field>
          <Field label="Fiscal year end (MM-DD)"><Input placeholder="12-31" {...bind("fiscalYearEnd")} /></Field>
          {d.termApplies && <Field label="Fund term (months)"><Input inputMode="numeric" {...bind("fundTermMonths")} /></Field>}
          {d.termApplies && <Field label="Investment period (months)"><Input inputMode="numeric" {...bind("investmentPeriodMonths")} /></Field>}
        </section>
        {d.signatoryOptions.length === 0 && (
          <p className="text-xs text-muted-foreground">No signatory can be chosen yet: none of this fund's managers has a person record.</p>
        )}
        <section className="grid gap-3 sm:grid-cols-3">
          <Field label="Entity type">{sel("entityType", ["LLC", "LP", "Series LLC", "Master LLC", "Corporation", "Trust", "Other"].map((t) => [t, t]))}</Field>
          <Field label="Jurisdiction of formation"><Input {...bind("jurisdiction")} /></Field>
          <Field label="Formation date"><Input type="date" {...bind("formationDate")} /></Field>
          <Field label="Registered agent"><Input {...bind("registeredAgent")} /></Field>
          <Field label="Principal business address"><Input {...bind("principalAddress")} /></Field>
          <Field label="Tax classification"><Input placeholder="e.g. Partnership" {...bind("taxClassification")} /></Field>
        </section>
        <p className="text-xs text-muted-foreground">The EIN and EIN letter stay in the locked Entity & EIN card; they are never shown to investors.</p>
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
        <p className="text-xs text-muted-foreground">The exemption is chosen by you and counsel; it is never picked automatically from the fund type.</p>
        {d.canEdit && <Button onClick={submit}>Save</Button>}
      </CardContent>
    </Card>
  );
}

const emptyFee = { ratePercent: null, basis: null, frequency: null };

function EconomicsCard({ d, offeringId, onSaved }: { d: D; offeringId: string; onSaved: () => void }) {
  const save = useServerFn(saveFundEconomicsFn);
  const saveFields = useServerFn(saveFundSetupFieldsFn);
  const approve = useServerFn(approveEconomicsFn);
  const [terms, setTerms] = useState<EconomicTerms>({ managementFee: emptyFee as any, carry: { ratePercent: null } });
  const [classes, setClasses] = useState<FundClass[]>([]);
  useEffect(() => {
    setTerms({ managementFee: (d.economics.terms?.managementFee ?? emptyFee) as any, carry: d.economics.terms?.carry ?? { ratePercent: null }, preferredReturnPercent: d.economics.terms?.preferredReturnPercent ?? null, orgExpenseTreatment: d.economics.terms?.orgExpenseTreatment ?? null, distributionFrequency: d.economics.terms?.distributionFrequency ?? null });
    setClasses(d.economics.classes ?? []);
  }, [d]);
  const fee = terms.managementFee ?? (emptyFee as any);
  const setFee = (p: any) => setTerms({ ...terms, managementFee: { ...fee, ...p } });
  const multi = d.offering.hasMultipleClasses;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.success(ok); onSaved(); } catch (e: any) { toast.error(e.message); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Economics & Classes</CardTitle>
        <p className="text-sm text-muted-foreground">
          {d.economics.status === "draft" ? `Draft v${d.economics.version} — needs approval by a second Harmonious reviewer.` : d.economics.approvedVersion ? `Approved v${d.economics.approvedVersion}. Saving creates a new draft; the approved version stays in use until the new one is approved.` : "No economics recorded yet."}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <section className="grid gap-3 sm:grid-cols-4">
          <Field label="Management fee (%)"><Input inputMode="decimal" disabled={!d.canEdit} value={fee.ratePercent ?? ""} onChange={(e) => setFee({ ratePercent: num(e.target.value) })} /></Field>
          <Field label="Basis">
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" disabled={!d.canEdit} value={fee.basis ?? ""} onChange={(e) => setFee({ basis: e.target.value || null })}>
              <option value="">—</option><option value="committed_capital">Committed capital</option><option value="invested_capital">Invested capital</option><option value="nav">NAV</option><option value="flat">Flat amount</option>
            </select>
          </Field>
          <Field label="Frequency">
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" disabled={!d.canEdit} value={fee.frequency ?? ""} onChange={(e) => setFee({ frequency: e.target.value || null })}>
              <option value="">—</option><option value="one_time">One time</option><option value="annual">Annual</option><option value="quarterly">Quarterly</option><option value="monthly">Monthly</option>
            </select>
          </Field>
          <Field label="Carry (%)"><Input inputMode="decimal" disabled={!d.canEdit} value={terms.carry?.ratePercent ?? ""} onChange={(e) => setTerms({ ...terms, carry: { ...(terms.carry ?? {}), ratePercent: num(e.target.value) } })} /></Field>
          <Field label="Preferred return / hurdle (%)"><Input inputMode="decimal" disabled={!d.canEdit} value={terms.preferredReturnPercent ?? ""} onChange={(e) => setTerms({ ...terms, preferredReturnPercent: num(e.target.value) })} /></Field>
          <Field label="Formation expense treatment"><Input disabled={!d.canEdit} value={terms.orgExpenseTreatment ?? ""} onChange={(e) => setTerms({ ...terms, orgExpenseTreatment: e.target.value || null })} /></Field>
          <Field label="Distribution frequency"><Input disabled={!d.canEdit} value={terms.distributionFrequency ?? ""} onChange={(e) => setTerms({ ...terms, distributionFrequency: e.target.value || null })} /></Field>
        </section>

        <div className="flex items-center gap-3">
          <Switch checked={multi} disabled={!d.canEdit} onCheckedChange={(v) => run(() => saveFields({ data: { offeringId, fields: { hasMultipleClasses: v } } }), "Saved")} id="multi" />
          <Label htmlFor="multi">Does this fund have multiple classes?</Label>
        </div>
        {multi && (
          <section className="space-y-3">
            {classes.map((c, i) => {
              const upd = (p: Partial<FundClass>) => setClasses(classes.map((x, j) => (j === i ? { ...x, ...p } : x)));
              return (
                <div key={i} className="grid gap-3 rounded-md border p-3 sm:grid-cols-5">
                  <Field label="Class name"><Input disabled={!d.canEdit} value={c.name} onChange={(e) => upd({ name: e.target.value })} /></Field>
                  <Field label="Mgmt fee (%) — blank uses default"><Input inputMode="decimal" disabled={!d.canEdit} value={c.managementFee?.ratePercent ?? ""} onChange={(e) => upd({ managementFee: e.target.value === "" ? null : { ...(c.managementFee ?? fee), ratePercent: num(e.target.value) } })} /></Field>
                  <Field label="Carry (%)"><Input inputMode="decimal" disabled={!d.canEdit} value={c.carry?.ratePercent ?? ""} onChange={(e) => upd({ carry: e.target.value === "" ? null : { ratePercent: num(e.target.value) } })} /></Field>
                  <Field label="Minimum ($)"><Input inputMode="decimal" disabled={!d.canEdit} value={fromCents(c.minInvestmentCents)} onChange={(e) => upd({ minInvestmentCents: toCents(e.target.value) })} /></Field>
                  {d.canEdit && <Button variant="ghost" className="self-end" onClick={() => setClasses(classes.filter((_, j) => j !== i))}>Remove</Button>}
                </div>
              );
            })}
            {d.canEdit && <Button variant="outline" onClick={() => setClasses([...classes, { key: "", name: `Class ${String.fromCharCode(65 + classes.length)}` }])}>Add class</Button>}
          </section>
        )}

        {d.canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => run(() => save({ data: { offeringId, terms: terms as any, classes: multi ? (classes as any) : [] } }), "Economics saved as a draft")}>Save economics draft</Button>
            {d.economics.status === "draft" && d.economics.versionId && (
              <Button variant="outline" disabled={d.economics.preparedByMe} title={d.economics.preparedByMe ? "A different Harmonious reviewer must approve" : undefined}
                onClick={() => run(() => approve({ data: { versionId: d.economics.versionId! } }), "Economics approved")}>
                {d.economics.preparedByMe ? "Awaiting second reviewer" : "Approve economics"}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
