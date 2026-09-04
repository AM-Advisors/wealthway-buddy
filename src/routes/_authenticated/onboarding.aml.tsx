import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { z } from "zod";

import { getOnboarding, submitAml, amlSchema } from "@/lib/onboarding.functions";
import { OnboardingStepper } from "@/components/OnboardingStepper";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/onboarding/aml")({
  head: () => ({
    meta: [
      { title: "AML Questionnaire — Harmonious Investor Onboarding" },
      {
        name: "description",
        content:
          "Declare source of funds, source of wealth, PEP status and sanctions exposure to complete anti-money-laundering screening.",
      },
      { property: "og:title", content: "AML Questionnaire — Harmonious" },
      {
        property: "og:description",
        content: "Step 2 of Harmonious investor onboarding: anti-money-laundering declarations.",
      },
    ],
  }),
  component: AmlPage,
});

type State = {
  source_of_funds: string;
  source_of_funds_detail: string;
  source_of_wealth: string;
  funds_origin_country: string;
  is_pep: boolean;
  pep_detail: string;
  is_us_person: boolean;
  sanctions_exposure: boolean;
  sanctions_detail: string;
  criminal_history: boolean;
  criminal_detail: string;
  third_party_funding: boolean;
  third_party_detail: string;
  certify_accurate: boolean;
};

const INITIAL: State = {
  source_of_funds: "employment_income",
  source_of_funds_detail: "",
  source_of_wealth: "",
  funds_origin_country: "United States",
  is_pep: false,
  pep_detail: "",
  is_us_person: true,
  sanctions_exposure: false,
  sanctions_detail: "",
  criminal_history: false,
  criminal_detail: "",
  third_party_funding: false,
  third_party_detail: "",
  certify_accurate: false,
};

function AmlPage() {
  const navigate = useNavigate();
  const load = useServerFn(getOnboarding);
  const save = useServerFn(submitAml);
  const { data, isLoading } = useQuery({ queryKey: ["onboarding"], queryFn: () => load() });

  const [form, setForm] = useState<State>(INITIAL);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const answers = (data?.aml?.matches as { answers?: Partial<State> } | null)?.answers;
    if (answers) setForm((f) => ({ ...f, ...answers, certify_accurate: false }));
  }, [data]);

  const set = <K extends keyof State>(key: K, value: State[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = amlSchema.safeParse(form);
    if (!parsed.success) {
      const flat: Record<string, string> = {};
      for (const issue of (parsed.error as z.ZodError).issues) {
        const key = String(issue.path[0]);
        if (!flat[key]) flat[key] = issue.message;
      }
      setErrors(flat);
      toast.error("Please complete the required declarations.");
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await save({ data: parsed.data });
      toast.success("Application submitted for KYC/AML review.");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit the questionnaire");
    } finally {
      setBusy(false);
    }
  }

  const kycDone = data?.application?.kyc_status && data.application.kyc_status !== "not_started";

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <OnboardingStepper current="aml" />

      <h1 className="mt-8 text-3xl">AML questionnaire</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        These declarations support the fund's anti-money-laundering and sanctions screening
        obligations. Answer for the investing person or entity.
      </p>

      {isLoading ? (
        <p className="mt-10 text-sm text-muted-foreground">Loading your application…</p>
      ) : !kycDone ? (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Complete identity verification first</CardTitle>
            <CardDescription>
              The AML questionnaire unlocks once your KYC details are submitted.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate({ to: "/onboarding/kyc" })}>Go to KYC step</Button>
          </CardContent>
        </Card>
      ) : (
        <form onSubmit={onSubmit} className="mt-8 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Source of funds & wealth</CardTitle>
              <CardDescription>
                Tell us where the capital for this subscription comes from.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Primary source of the investment funds</Label>
                <Select
                  value={form.source_of_funds}
                  onValueChange={(v) => set("source_of_funds", v)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employment_income">Employment income</SelectItem>
                    <SelectItem value="business_proceeds">Business proceeds</SelectItem>
                    <SelectItem value="investment_returns">Investment returns</SelectItem>
                    <SelectItem value="sale_of_asset">Sale of an asset</SelectItem>
                    <SelectItem value="inheritance_gift">Inheritance or gift</SelectItem>
                    <SelectItem value="retirement_savings">Retirement savings</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Additional detail (optional)</Label>
                <Textarea
                  maxLength={600}
                  value={form.source_of_funds_detail}
                  onChange={(e) => set("source_of_funds_detail", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>How was your wealth accumulated?</Label>
                <Textarea
                  maxLength={600}
                  placeholder="e.g. 18 years as a partner at a private medical practice, plus proceeds from the 2021 sale of that practice."
                  value={form.source_of_wealth}
                  onChange={(e) => set("source_of_wealth", e.target.value)}
                />
                {errors["source_of_wealth"] && (
                  <p className="text-xs text-destructive">{errors["source_of_wealth"]}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Country the funds will be wired from</Label>
                <Input
                  maxLength={60}
                  value={form.funds_origin_country}
                  onChange={(e) => set("funds_origin_country", e.target.value)}
                />
                {errors["funds_origin_country"] && (
                  <p className="text-xs text-destructive">{errors["funds_origin_country"]}</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Screening declarations</CardTitle>
              <CardDescription>
                A "yes" does not disqualify you — it routes your file to enhanced due diligence.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <YesNo
                label="Are you a U.S. person for tax purposes?"
                value={form.is_us_person}
                onChange={(v) => set("is_us_person", v)}
              />
              <YesNo
                label="Are you, or closely associated with, a politically exposed person (PEP)?"
                value={form.is_pep}
                onChange={(v) => set("is_pep", v)}
                detailLabel="Describe the position and relationship"
                detail={form.pep_detail}
                onDetail={(v) => set("pep_detail", v)}
              />
              <YesNo
                label="Do you have any connection to a sanctioned country, entity or individual?"
                value={form.sanctions_exposure}
                onChange={(v) => set("sanctions_exposure", v)}
                detailLabel="Describe the connection"
                detail={form.sanctions_detail}
                onDetail={(v) => set("sanctions_detail", v)}
              />
              <YesNo
                label="Have you been convicted of, or are you under investigation for, a financial crime?"
                value={form.criminal_history}
                onChange={(v) => set("criminal_history", v)}
                detailLabel="Provide details"
                detail={form.criminal_detail}
                onDetail={(v) => set("criminal_detail", v)}
              />
              <YesNo
                label="Will any part of this investment be funded by a third party?"
                value={form.third_party_funding}
                onChange={(v) => set("third_party_funding", v)}
                detailLabel="Identify the third party and their relationship to you"
                detail={form.third_party_detail}
                onDetail={(v) => set("third_party_detail", v)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <label className="flex items-start gap-3 text-sm">
                <Checkbox
                  checked={form.certify_accurate}
                  onCheckedChange={(v) => set("certify_accurate", v === true)}
                />
                <span>
                  I certify that the information above is true and complete, and I will notify the
                  fund of any material change. I understand the fund may request supporting
                  documentation.
                </span>
              </label>
              {errors["certify_accurate"] && (
                <p className="mt-2 text-xs text-destructive">
                  You must certify the declarations before submitting.
                </p>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" onClick={() => navigate({ to: "/onboarding/kyc" })}>
              Back
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Submitting…" : "Submit application for review"}
            </Button>
          </div>
        </form>
      )}
    </main>
  );
}

function YesNo({
  label,
  value,
  onChange,
  detailLabel,
  detail,
  onDetail,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  detailLabel?: string;
  detail?: string;
  onDetail?: (v: string) => void;
}) {
  return (
    <div className="space-y-3 border-b pb-5 last:border-0 last:pb-0">
      <Label className="block leading-relaxed">{label}</Label>
      <RadioGroup
        className="flex gap-6"
        value={value ? "yes" : "no"}
        onValueChange={(v) => onChange(v === "yes")}
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem value="yes" id={`${label}-yes`} />
          <Label htmlFor={`${label}-yes`} className="font-normal">Yes</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="no" id={`${label}-no`} />
          <Label htmlFor={`${label}-no`} className="font-normal">No</Label>
        </div>
      </RadioGroup>
      {value && detailLabel && onDetail && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">{detailLabel}</Label>
          <Textarea maxLength={600} value={detail ?? ""} onChange={(e) => onDetail(e.target.value)} />
        </div>
      )}
    </div>
  );
}
