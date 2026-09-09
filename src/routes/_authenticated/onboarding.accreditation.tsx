import { useStepView } from "@/hooks/use-step-view";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import type { z } from "zod";

import {
  getAccreditation,
  submitSelfCertification,
  submitVerificationRequest,
  recordEvidence,
  accreditation506bSchema,
  accreditation506cSchema,
} from "@/lib/accreditation.functions";
import { supabase } from "@/integrations/supabase/client";
import { OnboardingStepper } from "@/components/OnboardingStepper";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

export const Route = createFileRoute("/_authenticated/onboarding/accreditation")({
  head: () => ({
    meta: [
      { title: "Accreditation — Harmonious Investor Onboarding" },
      {
        name: "description",
        content:
          "Self-certify accredited investor status for a Reg D 506(b) offering, or upload verification evidence for a 506(c) offering.",
      },
      { property: "og:title", content: "Accreditation — Harmonious" },
      {
        property: "og:description",
        content: "Step 3 of Harmonious investor onboarding: accredited investor status.",
      },
    ],
  }),
  component: AccreditationPage,
});

const DOC_KINDS = [
  { value: "w2", label: "W-2" },
  { value: "tax_return", label: "Tax return" },
  { value: "brokerage_statement", label: "Brokerage / bank statement" },
  { value: "credit_report", label: "Credit report" },
  { value: "verification_letter", label: "Third-party verification letter" },
  { value: "other", label: "Other" },
] as const;

function AccreditationPage() {
  useStepView("accreditation");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const load = useServerFn(getAccreditation);
  const { data, isLoading } = useQuery({ queryKey: ["accreditation"], queryFn: () => load() });

  const regType = data?.offering?.reg_type ?? "506b";
  const locked = data?.application?.kyc_status === "not_started";

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <OnboardingStepper current="accreditation" />
      <h1 className="mt-8 text-3xl">Accredited investor status</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {data?.offering?.name ?? "This offering"} is offered under Regulation D Rule{" "}
        {regType === "506c" ? "506(c)" : "506(b)"}
        {regType === "506c"
          ? " — the fund must take reasonable steps to verify your accredited status before accepting capital."
          : " — you may self-certify your accredited status."}
      </p>

      {isLoading ? (
        <p className="mt-10 text-sm text-muted-foreground">Loading…</p>
      ) : locked ? (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Finish identity verification first</CardTitle>
            <CardDescription>Accreditation unlocks after KYC and AML are submitted.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate({ to: "/onboarding/kyc" })}>Go to KYC step</Button>
          </CardContent>
        </Card>
      ) : data?.record?.status === "approved" || data?.record?.status === "review" ? (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>
              {data.record.status === "approved"
                ? "Accreditation on file"
                : "Verification under review"}
            </CardTitle>
            <CardDescription>
              {data.record.status === "approved"
                ? "Your self-certification has been recorded. You can continue to the fund documents."
                : "Our compliance team is reviewing your evidence. You can review and sign the fund documents in the meantime; capital cannot be accepted until verification clears."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.documents.length > 0 && (
              <ul className="space-y-1 text-sm text-muted-foreground">
                {data.documents.map((d) => (
                  <li key={d.id}>
                    {d.file_name} — {d.doc_kind.replace(/_/g, " ")}
                  </li>
                ))}
              </ul>
            )}
            <Button onClick={() => navigate({ to: "/onboarding/documents" })}>
              Continue to fund documents
            </Button>
          </CardContent>
        </Card>
      ) : regType === "506c" ? (
        <VerificationForm
          documents={data?.documents ?? []}
          onUploaded={() => queryClient.invalidateQueries({ queryKey: ["accreditation"] })}
        />
      ) : (
        <SelfCertificationForm />
      )}
    </main>
  );
}

function SelfCertificationForm() {
  const navigate = useNavigate();
  const submit = useServerFn(submitSelfCertification);
  const [form, setForm] = useState({
    basis: "income" as z.infer<typeof accreditation506bSchema>["basis"],
    income_last_two_years: false,
    net_worth_over_1m: false,
    professional_license: "",
    pre_existing_relationship: "",
    attested_signature: "",
    attests: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = accreditation506bSchema.safeParse(form);
    if (!parsed.success) {
      const flat: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]);
        if (!flat[key]) flat[key] = issue.message;
      }
      setErrors(flat);
      toast.error("Please complete the certification.");
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await submit({ data: parsed.data });
      toast.success("Accreditation recorded.");
      navigate({ to: "/onboarding/documents" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save your certification");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>How do you qualify?</CardTitle>
          <CardDescription>Select the basis that applies to you.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            className="space-y-3"
            value={form.basis}
            onValueChange={(v) =>
              setForm((f) => ({ ...f, basis: v as typeof form.basis }))
            }
          >
            {[
              ["income", "Individual income over $200,000 (or $300,000 jointly) in each of the last two years"],
              ["net_worth", "Net worth over $1,000,000, excluding primary residence"],
              ["professional_certification", "Hold a Series 7, 65 or 82 license in good standing"],
              ["entity_assets", "Entity with over $5,000,000 in assets, or all equity owners are accredited"],
              ["knowledgeable_employee", "Knowledgeable employee of the fund or its manager"],
            ].map(([value, label]) => (
              <div key={value} className="flex items-start gap-3">
                <RadioGroupItem value={value as string} id={`basis-${value}`} className="mt-1" />
                <Label htmlFor={`basis-${value}`} className="font-normal leading-relaxed">
                  {label}
                </Label>
              </div>
            ))}
          </RadioGroup>

          <div className="space-y-3 border-t pt-4">
            <label className="flex items-start gap-3 text-sm">
              <Checkbox
                id="income_last_two_years"
                checked={form.income_last_two_years}
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, income_last_two_years: v === true }))
                }
              />
              <span>
                I met the income threshold in each of the last two years and reasonably expect to
                meet it this year.
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <Checkbox
                id="net_worth_over_1m"
                checked={form.net_worth_over_1m}
                onCheckedChange={(v) => setForm((f) => ({ ...f, net_worth_over_1m: v === true }))}
              />
              <span>My net worth (excluding primary residence) exceeds $1,000,000.</span>
            </label>
          </div>

          {form.basis === "professional_certification" && (
            <div className="space-y-2">
              <Label htmlFor="professional_license">License held</Label>
              <Input
                id="professional_license"
                maxLength={120}
                placeholder="Series 65, CRD #1234567"
                value={form.professional_license}
                onChange={(e) =>
                  setForm((f) => ({ ...f, professional_license: e.target.value }))
                }
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pre-existing relationship</CardTitle>
          <CardDescription>
            506(b) offerings may only be sold to investors with a substantive prior relationship
            with the manager.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="pre_existing_relationship">
            Describe how and when you came to know the fund manager
          </Label>
          <Textarea
            id="pre_existing_relationship"
            maxLength={600}
            value={form.pre_existing_relationship}
            onChange={(e) =>
              setForm((f) => ({ ...f, pre_existing_relationship: e.target.value }))
            }
          />
          {errors["pre_existing_relationship"] && (
            <p className="text-xs text-destructive">{errors["pre_existing_relationship"]}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <Label htmlFor="attested_signature">Type your full legal name as signature</Label>
            <Input
              id="attested_signature"
              maxLength={120}
              value={form.attested_signature}
              onChange={(e) => setForm((f) => ({ ...f, attested_signature: e.target.value }))}
            />
            {errors["attested_signature"] && (
              <p className="text-xs text-destructive">{errors["attested_signature"]}</p>
            )}
          </div>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox
              checked={form.attests}
              onCheckedChange={(v) => setForm((f) => ({ ...f, attests: v === true }))}
            />
            <span>
              I attest under penalty of perjury that I am an accredited investor as defined in Rule
              501(a) of Regulation D and that the statements above are accurate.
            </span>
          </label>
          {errors["attests"] && (
            <p className="text-xs text-destructive">You must attest before continuing.</p>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" onClick={() => navigate({ to: "/onboarding/aml" })}>
          Back
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Submit certification"}
        </Button>
      </div>
    </form>
  );
}

function VerificationForm({
  documents,
  onUploaded,
}: {
  documents: { id: string; file_name: string; doc_kind: string }[];
  onUploaded: () => void;
}) {
  const navigate = useNavigate();
  const submit = useServerFn(submitVerificationRequest);
  const record = useServerFn(recordEvidence);
  const [docKind, setDocKind] = useState<string>("brokerage_statement");
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    method: "net_worth_documents" as z.infer<typeof accreditation506cSchema>["method"],
    professional_license: "",
    verifier_name: "",
    verifier_role: "" as "" | "cpa" | "attorney" | "investment_adviser" | "broker_dealer",
    attested_signature: "",
    attests: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      toast.error("Files must be 25 MB or smaller.");
      return;
    }
    setUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Session expired. Sign in again.");
      const path = `${uid}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      const { error } = await supabase.storage.from("accreditation-docs").upload(path, file);
      if (error) throw new Error(error.message);
      await record({ data: { storage_path: path, file_name: file.name, doc_kind: docKind as never } });
      toast.success("Document uploaded.");
      onUploaded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = accreditation506cSchema.safeParse(form);
    if (!parsed.success) {
      const flat: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]);
        if (!flat[key]) flat[key] = issue.message;
      }
      setErrors(flat);
      toast.error("Please complete the verification request.");
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await submit({ data: parsed.data });
      toast.success("Verification submitted for review.");
      navigate({ to: "/onboarding/documents" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit verification");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Verification method</CardTitle>
          <CardDescription>
            Choose how the fund should verify your accredited status. Verification is valid for 90
            days.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            className="space-y-3"
            value={form.method}
            onValueChange={(v) => setForm((f) => ({ ...f, method: v as typeof form.method }))}
          >
            {[
              ["income_documents", "Income evidence — W-2s or tax returns for the last two years"],
              ["net_worth_documents", "Net worth evidence — asset statements plus a credit report"],
              ["third_party_letter", "Written confirmation from a CPA, attorney, adviser or broker-dealer"],
            ].map(([value, label]) => (
              <div key={value} className="flex items-start gap-3">
                <RadioGroupItem value={value as string} id={`method-${value}`} className="mt-1" />
                <Label htmlFor={`method-${value}`} className="font-normal leading-relaxed">
                  {label}
                </Label>
              </div>
            ))}
          </RadioGroup>

          {form.method === "third_party_letter" && (
            <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="verifier_name">Verifier name and firm</Label>
                <Input
                  id="verifier_name"
                  maxLength={160}
                  value={form.verifier_name}
                  onChange={(e) => setForm((f) => ({ ...f, verifier_name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Verifier role</Label>
                <Select
                  value={form.verifier_role || ""}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, verifier_role: v as typeof form.verifier_role }))
                  }
                >
                  <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cpa">Certified public accountant</SelectItem>
                    <SelectItem value="attorney">Attorney</SelectItem>
                    <SelectItem value="investment_adviser">Registered investment adviser</SelectItem>
                    <SelectItem value="broker_dealer">Broker-dealer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upload evidence</CardTitle>
          <CardDescription>
            Files are stored privately and are visible only to you and the fund's compliance team.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Document type</Label>
              <Select value={docKind} onValueChange={setDocKind}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOC_KINDS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="evidence-file">File (PDF, image — max 25 MB)</Label>
              <Input
                id="evidence-file"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.heic"
                disabled={uploading}
                onChange={onFile}
              />
            </div>
          </div>

          {documents.length > 0 ? (
            <ul className="space-y-1 rounded-md border p-3 text-sm">
              {documents.map((d) => (
                <li key={d.id} className="flex justify-between gap-4">
                  <span className="truncate">{d.file_name}</span>
                  <span className="text-muted-foreground">{d.doc_kind.replace(/_/g, " ")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <Label htmlFor="attested_signature_c">Type your full legal name as signature</Label>
            <Input
              id="attested_signature_c"
              maxLength={120}
              value={form.attested_signature}
              onChange={(e) => setForm((f) => ({ ...f, attested_signature: e.target.value }))}
            />
            {errors["attested_signature"] && (
              <p className="text-xs text-destructive">{errors["attested_signature"]}</p>
            )}
          </div>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox
              checked={form.attests}
              onCheckedChange={(v) => setForm((f) => ({ ...f, attests: v === true }))}
            />
            <span>
              I confirm the uploaded evidence is authentic, current, and relates to me or the
              investing entity, and I authorise the fund to verify it.
            </span>
          </label>
          {errors["attests"] && (
            <p className="text-xs text-destructive">You must confirm before submitting.</p>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" onClick={() => navigate({ to: "/onboarding/aml" })}>
          Back
        </Button>
        <Button type="submit" disabled={busy || uploading}>
          {busy ? "Submitting…" : "Submit for verification"}
        </Button>
      </div>
    </form>
  );
}
