import { useState } from "react";
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
  submitBadActorFn,
} from "@/lib/onboarding-compliance.functions";
import { BAD_ACTOR_CATEGORIES } from "@/lib/onboarding-compliance-model";

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

/** About You / Verify: tax form and (when applicable) the compliance questionnaire. */
export function TaxAndCompliancePanel({ onboardingId, done }: { onboardingId: string; done: () => void }) {
  const q = useCompliance(onboardingId);
  const qc = useQueryClient();
  const taxFn = useServerFn(certifyTaxFormFn);
  const baFn = useServerFn(submitBadActorFn);
  const [legalName, setLegalName] = useState("");
  const [tin, setTin] = useState("");
  const [sig, setSig] = useState("");
  const [answers, setAnswers] = useState<Record<string, "yes" | "no">>({});
  const [baSig, setBaSig] = useState("");
  const refresh = () => { qc.invalidateQueries({ queryKey: ["onboard-compliance", onboardingId] }); done(); };

  const tax = useMutation({
    mutationFn: () => taxFn({ data: {
      onboardingId, formType: q.data!.tax.form!.formType, legalName, tin: tin || null, certifiedName: sig,
      acknowledgedRevision: q.data!.tax.form!.revision,
    } }),
    onSuccess: () => { toast.success("Tax form certified"); setTin(""); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const ba = useMutation({
    mutationFn: () => baFn({ data: { onboardingId, answers, certifiedName: baSig } }),
    onSuccess: () => { toast.success("Questionnaire submitted"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!q.data) return null;
  const d = q.data;
  const showTax = d.tax.state !== "valid" && d.tax.state !== "not_applicable";
  const showBa = d.badActor.applies && d.badActor.state === "missing";
  if (!showTax && !showBa && d.tax.state !== "review_required") return null;

  return (
    <div className="space-y-4">
      {d.tax.state === "review_required" ? (
        <Card><CardContent className="pt-6 text-sm">Tax classification — Needs Review. {d.tax.reason} Harmonious will be in touch.</CardContent></Card>
      ) : null}
      {showTax && d.tax.form ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Tax Information</CardTitle>
            <CardDescription>
              Complete {d.tax.form.title} ({d.tax.form.revision}) for {d.profileName || "this investing profile"}.{" "}
              <a className="underline" href={d.tax.form.sourceUrl} target="_blank" rel="noreferrer">Read the official IRS form</a>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Name as shown on your tax return</Label><Input value={legalName} onChange={(e) => setLegalName(e.target.value)} maxLength={200} /></div>
            {d.tax.form.formType === "w9" ? (
              <div><Label>Taxpayer identification number (SSN or EIN)</Label><Input value={tin} onChange={(e) => setTin(e.target.value)} inputMode="numeric" autoComplete="off" maxLength={11} /></div>
            ) : null}
            <p className="text-sm text-muted-foreground">
              By typing your name you sign the certification in {d.tax.form.title} ({d.tax.form.revision}), exactly as written on the official IRS form linked above, under penalties of perjury.
            </p>
            <div><Label>Type your full name to sign</Label><Input value={sig} onChange={(e) => setSig(e.target.value)} maxLength={200} /></div>
            <Button className="w-full sm:w-auto" disabled={tax.isPending || !legalName || !sig} onClick={() => tax.mutate()}>Sign and submit</Button>
          </CardContent>
        </Card>
      ) : null}
      {showBa ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Compliance questionnaire</CardTitle>
            <CardDescription>Required for your role in this offering (Rule 506(d)).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Pending />
            {BAD_ACTOR_CATEGORIES.map((c) => (
              <div key={c.key} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm">{c.heading}</span>
                <div className="flex gap-2">
                  {(["no", "yes"] as const).map((v) => (
                    <Button key={v} size="sm" variant={answers[c.key] === v ? "default" : "outline"} onClick={() => setAnswers((a) => ({ ...a, [c.key]: v }))}>
                      {v === "yes" ? "Yes" : "No"}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
            <div><Label>Type your full name to certify</Label><Input value={baSig} onChange={(e) => setBaSig(e.target.value)} maxLength={200} /></div>
            <Button disabled={ba.isPending || !baSig} onClick={() => ba.mutate()}>Submit</Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
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
