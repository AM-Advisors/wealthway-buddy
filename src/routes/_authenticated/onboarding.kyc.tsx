import { useStepView } from "@/hooks/use-step-view";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { getOnboarding, submitKyc, kycSchema } from "@/lib/onboarding.functions";
import { OnboardingStepper } from "@/components/OnboardingStepper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScopeNotice } from "@/components/fund-scope-section";
import { AddressInput, addressFromSnake, addressToSnake } from "@/components/address-input";

export const Route = createFileRoute("/_authenticated/onboarding/kyc")({
  head: () => ({
    meta: [
      { title: "Identity Verification (KYC) — Harmonious Investor Onboarding" },
      {
        name: "description",
        content:
          "Provide your legal identity, address and government ID details to complete KYC for your Harmonious fund subscription.",
      },
      { property: "og:title", content: "Identity Verification (KYC) — Harmonious" },
      {
        property: "og:description",
        content: "Step 1 of the Harmonious investor onboarding: know-your-customer identity details.",
      },
    ],
  }),
  component: KycPage,
});

type Form = {
  legal_name: string;
  investor_type: string;
  email: string;
  phone: string;
  date_of_birth: string;
  tax_id: string;
  entity_name: string;
  address_line1: string;
  address_line2: string;
  city: string;
  region: string;
  postal_code: string;
  country: string;
  id_document_type: string;
  id_document_number: string;
  id_issuing_country: string;
  id_expiration: string;
};

const EMPTY: Form = {
  legal_name: "",
  investor_type: "individual",
  email: "",
  phone: "",
  date_of_birth: "",
  tax_id: "",
  entity_name: "",
  address_line1: "",
  address_line2: "",
  city: "",
  region: "",
  postal_code: "",
  country: "United States",
  id_document_type: "drivers_license",
  id_document_number: "",
  id_issuing_country: "United States",
  id_expiration: "",
};

function KycPage() {
  useStepView("kyc");
  const navigate = useNavigate();
  const load = useServerFn(getOnboarding);
  const save = useServerFn(submitKyc);
  const { data, isLoading } = useQuery({ queryKey: ["onboarding"], queryFn: () => load() });

  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    const p = data.profile;
    const r = (data.kyc?.result ?? {}) as Record<string, unknown>;
    setForm((prev) => ({
      ...prev,
      legal_name: p?.legal_name ?? prev.legal_name,
      investor_type: p?.investor_type ?? prev.investor_type,
      email: p?.email ?? prev.email,
      phone: p?.phone ?? prev.phone,
      date_of_birth: p?.date_of_birth ?? prev.date_of_birth,
      tax_id: p?.tax_id ?? prev.tax_id,
      entity_name: p?.entity_name ?? prev.entity_name,
      address_line1: p?.address_line1 ?? prev.address_line1,
      address_line2: p?.address_line2 ?? prev.address_line2,
      city: p?.city ?? prev.city,
      region: p?.region ?? prev.region,
      postal_code: p?.postal_code ?? prev.postal_code,
      country: p?.country ?? prev.country,
      id_document_type: (r["id_document_type"] as string) ?? prev.id_document_type,
      id_issuing_country: (r["id_issuing_country"] as string) ?? prev.id_issuing_country,
      id_expiration: (r["id_expiration"] as string) ?? prev.id_expiration,
    }));
  }, [data]);

  const set = (key: keyof Form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = kycSchema.safeParse(form);
    if (!parsed.success) {
      const flat: Record<string, string> = {};
      for (const issue of (parsed.error as z.ZodError).issues) {
        const key = String(issue.path[0]);
        if (!flat[key]) flat[key] = issue.message;
      }
      setErrors(flat);
      toast.error("Please correct the highlighted fields.");
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await save({ data: parsed.data });
      toast.success("Identity details submitted for verification.");
      navigate({ to: "/onboarding/aml" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit KYC details");
    } finally {
      setBusy(false);
    }
  }

  const isEntity = ["entity", "trust", "ira"].includes(form.investor_type);

  if (!isLoading && data && data.invited === false) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle>
              <h1 className="text-2xl font-semibold leading-none tracking-tight">
                No fund invitation yet
              </h1>
            </CardTitle>
            <CardDescription>
              Harmonious funds are private. Your account is active, but you have not been invited to
              a fund yet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              Once a fund manager or the Harmonious team invites this email address to a fund, your
              onboarding will appear here automatically — just sign in again.
            </p>
            <p>
              Expecting an invitation? Contact us at{" "}
              <a className="underline" href="mailto:operations@harmonious.co">
                operations@harmonious.co
              </a>
              .
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <ScopeNotice offeringId={data?.offering?.id ?? null} section="identity" label="Identity checks" />
      <OnboardingStepper current="kyc" />


      <div className="mt-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl">Identity verification</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Required under the fund's customer identification program. Details are reviewed by
            compliance before your subscription can proceed.
          </p>
        </div>
        {data?.application?.kyc_status && data.application.kyc_status !== "not_started" && (
          <Badge variant="secondary" className="capitalize">
            {data.application.kyc_status.replace("_", " ")}
          </Badge>
        )}
      </div>

      {isLoading ? (
        <p className="mt-10 text-sm text-muted-foreground">Loading your application…</p>
      ) : (
        <form onSubmit={onSubmit} className="mt-8 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle><h2 className="font-semibold leading-none tracking-tight">Investor details</h2></CardTitle>
              <CardDescription>Enter your name exactly as it appears on your ID.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Investor type" error={errors["investor_type"]}>
                <Select value={form.investor_type} onValueChange={set("investor_type")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="individual">Individual</SelectItem>
                    <SelectItem value="joint">Joint</SelectItem>
                    <SelectItem value="entity">Entity / LLC / Corp</SelectItem>
                    <SelectItem value="trust">Trust</SelectItem>
                    <SelectItem value="ira">IRA / retirement account</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Text label="Legal name" name="legal_name" form={form} set={set} errors={errors} />
              {isEntity && (
                <Text label="Entity name" name="entity_name" form={form} set={set} errors={errors} />
              )}
              <Text label="Email" name="email" type="email" form={form} set={set} errors={errors} />
              <Text label="Phone" name="phone" type="tel" form={form} set={set} errors={errors} />
              <Text
                label="Date of birth"
                name="date_of_birth"
                type="date"
                form={form}
                set={set}
                errors={errors}
              />
              <Text
                label={isEntity ? "EIN" : "SSN / ITIN"}
                name="tax_id"
                form={form}
                set={set}
                errors={errors}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle><h2 className="font-semibold leading-none tracking-tight">Residential address</h2></CardTitle>
              <CardDescription>No P.O. boxes — a physical address is required.</CardDescription>
            </CardHeader>
            <CardContent>
              <AddressInput
                idPrefix="kyc-address"
                label="Residential address"
                countryMode="free"
                value={addressFromSnake(form)}
                onChange={(next) =>
                  setForm((f) => ({ ...f, ...addressToSnake(next) }))
                }
              />
              {errors["address_line1"] ? (
                <p className="mt-2 text-sm text-destructive">{errors["address_line1"]}</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle><h2 className="font-semibold leading-none tracking-tight">Government identification</h2></CardTitle>
              <CardDescription>
                Only the last four digits of the document number are stored with your file.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Document type" error={errors["id_document_type"]}>
                <Select value={form.id_document_type} onValueChange={set("id_document_type")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="passport">Passport</SelectItem>
                    <SelectItem value="drivers_license">Driver's license</SelectItem>
                    <SelectItem value="state_id">State ID</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Text
                label="Document number"
                name="id_document_number"
                form={form}
                set={set}
                errors={errors}
              />
              <Text
                label="Issuing country"
                name="id_issuing_country"
                form={form}
                set={set}
                errors={errors}
              />
              <Text
                label="Expiration date"
                name="id_expiration"
                type="date"
                form={form}
                set={set}
                errors={errors}
              />
            </CardContent>
          </Card>

          <div className="flex items-center justify-end gap-3">
            <Button type="submit" disabled={busy}>
              {busy ? "Submitting…" : "Continue to AML questionnaire"}
            </Button>
          </div>
        </form>
      )}
    </main>
  );
}

function Field({
  label,
  error,
  htmlFor,
  children,
}: {
  label: string;
  error?: string | undefined;
  htmlFor?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function Text({
  label,
  name,
  type = "text",
  form,
  set,
  errors,
}: {
  label: string;
  name: keyof Form;
  type?: string;
  form: Form;
  set: (key: keyof Form) => (value: string) => void;
  errors: Record<string, string>;
}) {
  return (
    <Field label={label} error={errors[name as string]} htmlFor={name as string}>
      <Input
        id={name as string}
        type={type}
        value={form[name]}
        maxLength={255}
        onChange={(e) => set(name)(e.target.value)}
      />
    </Field>
  );
}
