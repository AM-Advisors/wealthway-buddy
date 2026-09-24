import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  certifyFn,
  certifyTaxFormFn,
  investorComplianceFn,
  myTaxDocumentUrlFn,
  previewTaxFormFn,
  submitAmlFn,
  submitBadActorFn,
  submitDemographicsFn,
  submitEligibilityFn,
  submitTaxFactsFn,
} from "@/lib/onboarding-compliance.functions";
import { BAD_ACTOR_CATEGORIES, ELIGIBILITY_REQUIREMENT_TYPES } from "@/lib/onboarding-compliance-model";
import { DEMOGRAPHIC_QUESTIONS, PREFER_NOT, SOURCE_OF_FUNDS, SOURCE_OF_WEALTH, taxIntakeQuestions } from "@/lib/onboarding-intake-model";

function useCompliance(onboardingId: string) {
  const fn = useServerFn(investorComplianceFn);
  return useQuery({ queryKey: ["onboard-compliance", onboardingId], queryFn: () => fn({ data: { onboardingId } }) });
}

function Pending() {
  return (
    <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
      Wording pending Harmonious legal/compliance approval.
    </p>
  );
}

const TAX_Q_LABEL: Record<string, string> = {
  usPerson: "Are you (or is this investing entity) a U.S. person for U.S. federal tax purposes?",
  taxResidenceCountry: "Country of tax residence",
  citizenshipCountry: "Country of citizenship",
  capacity: "Is this entity receiving the income for itself, or on behalf of others?",
  exemptStatus: "Is this entity one of the following?",
  effectivelyConnected: "Is the income from this investment effectively connected with a U.S. trade or business you conduct?",
};
const CAPACITY_OPTIONS = [
  ["beneficial_owner", "For itself (beneficial owner)"],
  ["intermediary", "As an intermediary for others"],
  ["flow_through", "As a flow-through entity (e.g. foreign partnership or grantor trust)"],
  ["branch", "Through a U.S. branch acting as intermediary"],
  ["unsure", "I'm not sure"],
] as const;
const EXEMPT_OPTIONS = [
  ["none", "None of these"],
  ["foreign_government", "A foreign government"],
  ["international_organization", "An international organization"],
  ["foreign_central_bank", "A foreign central bank of issue"],
  ["foreign_tax_exempt_organization", "A foreign tax-exempt organization"],
  ["foreign_private_foundation", "A foreign private foundation"],
  ["government_of_us_possession", "Government of a U.S. possession"],
  ["unsure", "I'm not sure"],
] as const;

function Choice({ value, options, onChange }: { value?: string | undefined; options: readonly (readonly [string, string])[]; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([v, l]) => (
        <Button key={v} type="button" size="sm" variant={value === v ? "default" : "outline"} onClick={() => onChange(v)}>{l}</Button>
      ))}
    </div>
  );
}
const YNU = [["yes", "Yes"], ["no", "No"], ["unsure", "I'm not sure"]] as const;

/** About You: short adaptive tax questions. The server decides the form. */
function TaxIntakeCard({ onboardingId, d, refresh }: { onboardingId: string; d: any; refresh: () => void }) {
  const fn = useServerFn(submitTaxFactsFn);
  const [a, setA] = useState<Record<string, string>>(d.taxIntake.answers ?? {});
  const questions = taxIntakeQuestions(d.profileType, a as any);
  const m = useMutation({
    mutationFn: () => fn({ data: { onboardingId, answers: a as any } }),
    onSuccess: (r: any) => { r.status === "determined" ? toast.success(`Next: review ${r.form} in the Sign step`) : toast.message("Tax Classification — Needs Review"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (d.taxIntake.state === "not_applicable") return null;
  const done = d.taxIntake.state === "valid";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Tax information</CardTitle>
        <CardDescription>
          {done ? `Done — ${d.tax.form?.title ?? "your tax form"} will be ready to review and sign in the Sign step.` : "A few factual questions so we can prepare the right IRS form. We can't give tax advice; if you're unsure, say so and Harmonious will follow up, or ask your tax adviser."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {d.taxIntake.state === "review_required" ? (
          <p className="rounded-md border p-3 text-sm"><strong>Tax Classification — Needs Review.</strong> {d.taxIntake.reason} Harmonious will contact you. You may wish to consult your tax adviser.</p>
        ) : null}
        {questions.map((q) => (
          <div key={q} className="space-y-2">
            <Label>{TAX_Q_LABEL[q]}</Label>
            {q === "taxResidenceCountry" || q === "citizenshipCountry" ? (
              <Input value={a[q] ?? ""} onChange={(e) => setA({ ...a, [q]: e.target.value })} maxLength={60} placeholder="Country" />
            ) : q === "capacity" ? (
              <Choice value={a[q]} options={CAPACITY_OPTIONS} onChange={(v) => setA({ ...a, [q]: v })} />
            ) : q === "exemptStatus" ? (
              <Choice value={a[q]} options={EXEMPT_OPTIONS} onChange={(v) => setA({ ...a, [q]: v })} />
            ) : (
              <Choice value={a[q]} options={YNU} onChange={(v) => setA({ ...a, [q]: v })} />
            )}
          </div>
        ))}
        <Button disabled={m.isPending || questions.some((q) => !a[q])} onClick={() => m.mutate()}>{done ? "Update answers" : "Save"}</Button>
      </CardContent>
    </Card>
  );
}

const AML_LABEL: Record<string, string> = {
  citizenship: "Country of citizenship",
  residence: "Country of residence",
  occupation: "Occupation / employer",
  businessNature: "Nature of the entity's business",
  sourceOfFunds: "Where is the money for this investment coming from?",
  sourceOfFundsDetail: "Please describe the source of funds",
  fundsOriginCountry: "Country the funds are coming from",
  thirdPartyFunding: "Is anyone other than the investor providing the funds?",
  politicallyExposed: "Is the investor, a close family member or associate a senior public official (a politically exposed person)?",
  expectedActivity: "Expected activity",
  sourceOfWealth: "How was the investor's overall wealth built?",
  sourceOfWealthDetail: "Brief description of source of wealth",
};

/** Verify: BSA/AML questions that apply to this investment only. */
function AmlCard({ onboardingId, d, refresh }: { onboardingId: string; d: any; refresh: () => void }) {
  const fn = useServerFn(submitAmlFn);
  const [a, setA] = useState<Record<string, string>>({});
  const [sig, setSig] = useState("");
  const m = useMutation({
    mutationFn: () => fn({ data: { onboardingId, answers: a, certifiedName: sig } }),
    onSuccess: (r: any) => { r.reviewStatus === "review_required" ? toast.message("Thanks — Compliance Review Required. Harmonious will follow up.") : toast.success("Saved"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (d.aml.state === "valid" || d.aml.state === "not_applicable") return null;
  if (d.aml.state === "review_required") {
    return <Card><CardContent className="pt-6 text-sm"><strong>Compliance Review Required.</strong> Harmonious is reviewing your financial background answers.</CardContent></Card>;
  }
  const fields: string[] = [...d.aml.fields];
  if (a.sourceOfFunds === "other" && !fields.includes("sourceOfFundsDetail")) fields.splice(fields.indexOf("sourceOfFunds") + 1, 0, "sourceOfFundsDetail");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Financial background</CardTitle>
        <CardDescription>Required by anti-money-laundering rules. We only ask what we don't already have.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {fields.map((f) => (
          <div key={f} className="space-y-2">
            <Label>{AML_LABEL[f] ?? f}</Label>
            {f === "sourceOfFunds" ? (
              <Choice value={a[f]} options={SOURCE_OF_FUNDS.map((o) => [o.value, o.label] as const)} onChange={(v) => setA({ ...a, [f]: v })} />
            ) : f === "sourceOfWealth" ? (
              <Choice value={a[f]} options={SOURCE_OF_WEALTH.map((o) => [o.value, o.label] as const)} onChange={(v) => setA({ ...a, [f]: v })} />
            ) : f === "thirdPartyFunding" || f === "politicallyExposed" ? (
              <Choice value={a[f]} options={[["no", "No"], ["yes", "Yes"]]} onChange={(v) => setA({ ...a, [f]: v })} />
            ) : f === "expectedActivity" ? (
              <Choice value={a[f]} options={[["single_investment", "This single investment"], ["ongoing", "Ongoing investments and capital calls"]]} onChange={(v) => setA({ ...a, [f]: v })} />
            ) : (
              <Input value={a[f] ?? ""} onChange={(e) => setA({ ...a, [f]: e.target.value })} maxLength={600} />
            )}
          </div>
        ))}
        <div><Label>Type your full name to confirm these answers are accurate</Label><Input value={sig} onChange={(e) => setSig(e.target.value)} maxLength={200} /></div>
        <Button disabled={m.isPending || sig.trim().length < 2} onClick={() => m.mutate()}>Save</Button>
      </CardContent>
    </Card>
  );
}

/** Optional. Never blocks, never affects any compliance outcome, never shown to managers. */
function DemographicsCard({ onboardingId, d, refresh }: { onboardingId: string; d: any; refresh: () => void }) {
  const fn = useServerFn(submitDemographicsFn);
  const [open, setOpen] = useState(false);
  const [a, setA] = useState<Record<string, string>>({});
  const m = useMutation({
    mutationFn: () => fn({ data: { onboardingId, answers: a } }),
    onSuccess: () => { toast.success("Thank you"); setOpen(false); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (d.demographics.submitted) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">About you — Optional</CardTitle>
        <CardDescription>Optional demographic questions. Skipping them, or choosing "Prefer not to answer", never affects your investment, verification or eligibility, and fund managers never see them.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!open ? <Button variant="outline" onClick={() => setOpen(true)}>Answer optional questions</Button> : (
          <>
            {DEMOGRAPHIC_QUESTIONS.map((q) => (
              <div key={q.key} className="space-y-2">
                <Label>{q.label} (Optional)</Label>
                <Choice value={a[q.key]} options={q.options.map((o) => [o, o === PREFER_NOT ? "Prefer not to answer" : o.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())] as const)} onChange={(v) => setA({ ...a, [q.key]: v })} />
              </div>
            ))}
            <Button disabled={m.isPending} onClick={() => m.mutate()}>Save</Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function BadActorCard({ onboardingId, d, refresh }: { onboardingId: string; d: any; refresh: () => void }) {
  const baFn = useServerFn(submitBadActorFn);
  const [answers, setAnswers] = useState<Record<string, "yes" | "no">>({});
  const [baSig, setBaSig] = useState("");
  const ba = useMutation({
    mutationFn: () => baFn({ data: { onboardingId, answers, certifiedName: baSig } }),
    onSuccess: () => { toast.success("Questionnaire submitted"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!d.badActor.applies || d.badActor.state !== "missing") return null;
  // Placeholder category headings are never shown to investors as final legal questions.
  if (d.badActor.wordingStatus !== "approved") {
    return (
      <Card>
        <CardHeader><CardTitle className="text-lg">Compliance questionnaire</CardTitle></CardHeader>
        <CardContent className="text-sm">Legal/Compliance Approval Required. This questionnaire applies to your role in this offering; Harmonious will send it to you once its wording is approved.</CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">Compliance questionnaire</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {BAD_ACTOR_CATEGORIES.map((c) => (
          <div key={c.key} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm">{c.heading}</span>
            <Choice value={answers[c.key]} options={[["no", "No"], ["yes", "Yes"]]} onChange={(v) => setAnswers((x) => ({ ...x, [c.key]: v as "yes" | "no" }))} />
          </div>
        ))}
        <div><Label>Type your full name to certify</Label><Input value={baSig} onChange={(e) => setBaSig(e.target.value)} maxLength={200} /></div>
        <Button disabled={ba.isPending || !baSig} onClick={() => ba.mutate()}>Submit</Button>
      </CardContent>
    </Card>
  );
}

/** About You / Verify: tax facts, BSA/AML, applicable questionnaire, optional demographics. */
export function TaxAndCompliancePanel({ onboardingId, done }: { onboardingId: string; done: () => void }) {
  const q = useCompliance(onboardingId);
  const qc = useQueryClient();
  const refresh = () => { qc.invalidateQueries({ queryKey: ["onboard-compliance", onboardingId] }); done(); };
  if (!q.data) return null;
  const d = q.data;
  return (
    <div className="space-y-4">
      <TaxIntakeCard key={JSON.stringify(d.taxIntake.answers)} onboardingId={onboardingId} d={d} refresh={refresh} />
      <AmlCard onboardingId={onboardingId} d={d} refresh={refresh} />
      <BadActorCard onboardingId={onboardingId} d={d} refresh={refresh} />
      <DemographicsCard onboardingId={onboardingId} d={d} refresh={refresh} />
    </div>
  );
}

const OUTCOME_LABEL: Record<string, string> = {
  satisfied: "Satisfied",
  needs_review: "Needs Review",
  needs_information: "Needs Information",
  not_started: "To answer",
};

/** Accreditation & Eligibility: only this offering's applicable requirements. */
export function EligibilityPanel({ onboardingId, done }: { onboardingId: string; done: () => void }) {
  const q = useCompliance(onboardingId);
  const qc = useQueryClient();
  const fn = useServerFn(submitEligibilityFn);
  const [name, setName] = useState("");
  const m = useMutation({
    mutationFn: (v: { key: string; answer: "yes" | "no" | "unsure" }) => fn({ data: { onboardingId, ...v, certifiedName: name } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["onboard-compliance", onboardingId] }); done(); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!q.data) return null;
  const items = q.data.eligibility.filter((e: any) => e.outcome !== "not_applicable");
  if (!items.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Eligibility for this fund</CardTitle>
        <CardDescription>Only the requirements this fund has.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.some((e: any) => e.asked) ? <Pending /> : null}
        {items.some((e: any) => e.asked && e.outcome === "not_started") ? (
          <div><Label>Your full name</Label><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} /></div>
        ) : null}
        {items.map((e: any) => (
          <div key={e.key} className="space-y-2 rounded-md border p-3">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm">{e.asked ? e.prompt : ELIGIBILITY_REQUIREMENT_TYPES[e.key as keyof typeof ELIGIBILITY_REQUIREMENT_TYPES]?.label}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{OUTCOME_LABEL[e.outcome] ?? e.outcome}</span>
            </div>
            {e.asked && e.outcome === "not_started" ? (
              <Choice value={undefined} options={YNU} onChange={(v) => name.trim().length >= 2 ? m.mutate({ key: e.key, answer: v as any }) : toast.error("Type your full name first.")} />
            ) : null}
            {!e.asked && e.key === "minimum_investment" && e.outcome === "needs_review" ? (
              <p className="text-xs text-muted-foreground">Your amount is below this fund's minimum. Harmonious will review.</p>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Sign: review the populated official IRS form, then Certify & Sign. No countersignature. */
export function TaxSignPanel({ onboardingId, done }: { onboardingId: string; done: () => void }) {
  const q = useCompliance(onboardingId);
  const qc = useQueryClient();
  const previewFn = useServerFn(previewTaxFormFn);
  const taxFn = useServerFn(certifyTaxFormFn);
  const docFn = useServerFn(myTaxDocumentUrlFn);
  const [legalName, setLegalName] = useState("");
  const [tin, setTin] = useState("");
  const [foreignTin, setForeignTin] = useState("");
  const [sig, setSig] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  const form = q.data?.tax.form;
  const preview = useMutation({
    mutationFn: () => previewFn({ data: { onboardingId, formType: form!.formType, legalName, tin: tin || null, foreignTin: foreignTin || null } }),
    onSuccess: (r) => {
      const bytes = Uint8Array.from(atob(r.pdfBase64), (c) => c.charCodeAt(0));
      setPreviewUrl(URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })));
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const sign = useMutation({
    mutationFn: () => taxFn({ data: { onboardingId, formType: form!.formType, legalName, tin: tin || null, foreignTin: foreignTin || null, certifiedName: sig, acknowledgedRevision: form!.revision } }),
    onSuccess: () => { toast.success(`${form!.title} signed`); setTin(""); setPreviewUrl(null); qc.invalidateQueries({ queryKey: ["onboard-compliance", onboardingId] }); done(); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!q.data) return null;
  const d = q.data;
  if (d.tax.state === "valid") {
    return (
      <Card><CardContent className="flex flex-col gap-2 pt-6 text-sm sm:flex-row sm:items-center sm:justify-between">
        <span>{d.tax.current ? `${d.tax.current.formType.toUpperCase()} signed (${d.tax.current.revision})${d.tax.current.tinMasked ? ` · TIN ${d.tax.current.tinMasked}` : ""}` : "Tax form on file"}</span>
        <Button size="sm" variant="outline" onClick={async () => { try { const r = await docFn({ data: { onboardingId } }); if (r.url) window.open(r.url, "_blank", "noopener"); } catch (e) { toast.error((e as Error).message); } }}>View signed form</Button>
      </CardContent></Card>
    );
  }
  if (d.tax.state === "not_applicable" || !form) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Review {form.title}</CardTitle>
        <CardDescription>The official IRS {form.title} ({form.revision}), filled in with your details. Review it, then certify and sign.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div><Label>Name as shown on your tax return</Label><Input value={legalName} onChange={(e) => setLegalName(e.target.value)} maxLength={200} /></div>
        {d.tax.needsTin ? (
          <div><Label>{d.tax.tinKind === "ssn" ? "Social Security number" : "Employer identification number (EIN)"}</Label><Input value={tin} onChange={(e) => setTin(e.target.value)} inputMode="numeric" autoComplete="off" maxLength={11} type="password" /></div>
        ) : form.formType === "w8ben" ? (
          <div><Label>Foreign tax identifying number (if any)</Label><Input value={foreignTin} onChange={(e) => setForeignTin(e.target.value)} autoComplete="off" maxLength={40} /></div>
        ) : null}
        <Button variant="outline" disabled={preview.isPending || legalName.trim().length < 2 || (d.tax.needsTin && tin.replace(/\D/g, "").length !== 9)} onClick={() => preview.mutate()}>
          {preview.isPending ? "Preparing…" : `Review ${form.title}`}
        </Button>
        {previewUrl ? (
          <>
            <iframe title={`${form.title} preview`} src={previewUrl} className="h-[70vh] w-full rounded-md border" />
            <a className="text-sm underline" href={previewUrl} target="_blank" rel="noreferrer">Open the form in a new tab</a>
            <p className="text-sm text-muted-foreground">By typing your name you sign the certification printed on the form above, exactly as issued by the IRS, under penalties of perjury.</p>
            <div><Label>Type your full name to sign</Label><Input value={sig} onChange={(e) => setSig(e.target.value)} maxLength={200} /></div>
            <Button className="w-full sm:w-auto" disabled={sign.isPending || sig.trim().length < 2} onClick={() => sign.mutate()}>Certify & Sign</Button>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Sign step: each legally distinct certification is its own confirmation. */
export function CertificationsPanel({ onboardingId, done }: { onboardingId: string; done: () => void }) {
  const q = useCompliance(onboardingId);
  const qc = useQueryClient();
  const fn = useServerFn(certifyFn);
  const [name, setName] = useState("");
  const m = useMutation({
    mutationFn: (key: string) => fn({ data: { onboardingId, key: key as any, certifiedName: name } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["onboard-compliance", onboardingId] }); done(); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!q.data || q.data.certifications.missing.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Review & certify</CardTitle>
        <CardDescription>Confirm each statement separately before signing your fund documents.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Pending />
        <div><Label>Your full name</Label><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} /></div>
        {q.data.certifications.required.map((c) => {
          const missing = q.data!.certifications.missing.includes(c.key as any);
          return (
            <div key={c.key} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm">{c.heading}</span>
              {missing ? (
                <Button size="sm" disabled={m.isPending || name.trim().length < 2} onClick={() => m.mutate(c.key)}>I certify</Button>
              ) : (
                <span className="text-sm text-muted-foreground">Certified</span>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
