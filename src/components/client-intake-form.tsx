import { useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  ENTITY_TYPES,
  FUND_TYPES,
  REG_TYPES,
  saveFundIntakeDraft,
  submitFundIntake,
} from "@/lib/client-intake.functions";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { Textarea } from "@/components/ui/textarea";

const emptyPerson = { name: "", firm: "", email: "" };

const emptyDetails = {
  fund_name: "",
  legal_entity_name: "",
  entity_type: "",
  state_formed: "",
  date_formed: "",
  fund_type: "",
  fund_type_other: "",
  reg_type: "",
  target_raise: "",
  min_investment: "",
  expected_investors: "",
  general_partner: { ...emptyPerson },
  signatory: { ...emptyPerson },
  lawyer: { ...emptyPerson },
  accountant: { ...emptyPerson },
  bank_contact: { ...emptyPerson },
  has_ein: false,
  ein: "",
  bank_name: "",
  distribution_source: "",
};

type Details = typeof emptyDetails;

const STEPS = ["Fund basics", "Offering terms", "Key people", "Banking and tax"] as const;

const PEOPLE: Array<{ key: keyof Details; label: string; note: string }> = [
  { key: "general_partner", label: "General partner / principal", note: "Who runs the fund." },
  { key: "signatory", label: "Authorised signatory", note: "Who signs on behalf of the fund." },
  { key: "lawyer", label: "Lawyer", note: "Your own counsel — Harmonious does not act as your lawyer." },
  { key: "accountant", label: "Accountant", note: "Your own accountant or tax preparer." },
  { key: "bank_contact", label: "Bank contact", note: "Who you speak to at the fund's bank." },
];

export function ClientIntakeForm({
  clientId,
  clientName,
  initial,
  onDone,
}: {
  clientId: string;
  clientName: string | null;
  initial: Record<string, any> | null;
  onDone: () => void;
}) {
  const save = useServerFn(saveFundIntakeDraft);
  const submit = useServerFn(submitFundIntake);
  const qc = useQueryClient();

  const [step, setStep] = useState(0);
  const [details, setDetails] = useState<Details>({ ...emptyDetails, ...(initial ?? {}) } as Details);

  const set = (patch: Partial<Details>) => setDetails((d) => ({ ...d, ...patch }));
  const setPerson = (key: keyof Details, patch: Record<string, string>) =>
    setDetails((d) => ({ ...d, [key]: { ...(d[key] as any), ...patch } }));

  const saveDraft = useMutation({
    mutationFn: () => save({ data: { clientId, details: details as any } }),
    onError: (e: any) => toast.error(e?.message ?? "We could not save your answers."),
  });

  const finish = useMutation({
    mutationFn: () => submit({ data: { clientId, details: details as any } }),
    onSuccess: async (result: any) => {
      toast.success(
        result?.awaitingReview
          ? "Thank you — your fund is created and Harmonious is setting it up."
          : "Thank you — your fund is created and ready in your portal.",
      );
      await qc.invalidateQueries({ queryKey: ["client-intake"] });
      await qc.invalidateQueries({ queryKey: ["client-portal"] });
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "We could not create your fund."),
  });

  const canFinish =
    details.fund_name.trim() !== "" &&
    details.legal_entity_name.trim() !== "" &&
    details.entity_type !== "" &&
    details.reg_type !== "";

  const next = async () => {
    await saveDraft.mutateAsync();
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Logo className="h-8" />
      <h1 className="mt-6 text-3xl">Tell us about your fund</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {clientName ? `${clientName} — ` : ""}we need these details before your portal opens. Everything can
        be changed later, and you can stop and come back — your answers are saved as you go.
      </p>

      <ol className="mt-6 flex flex-wrap gap-2 text-xs">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`rounded-full border px-3 py-1 ${
              i === step
                ? "border-primary bg-primary text-primary-foreground"
                : i < step
                  ? "border-primary/40 text-primary"
                  : "text-muted-foreground"
            }`}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{STEPS[step]}</CardTitle>
          <CardDescription>
            {step === 0
              ? "The fund and the legal entity behind it."
              : step === 1
                ? "How you are raising, and from whom."
                : step === 2
                  ? "The people we should contact. Leave anything blank if it is not settled yet."
                  : "Where money sits and how the fund is taxed."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {step === 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Fund name" required>
                <Input
                  value={details.fund_name}
                  maxLength={160}
                  onChange={(e) => set({ fund_name: e.target.value })}
                  placeholder="Harbour Growth Fund I"
                />
              </Field>
              <Field label="Legal entity name" required>
                <Input
                  value={details.legal_entity_name}
                  maxLength={160}
                  onChange={(e) => set({ legal_entity_name: e.target.value })}
                  placeholder="Harbour Growth Fund I, LLC"
                />
              </Field>
              <Field label="Entity type" required>
                <Select value={details.entity_type} onChange={(v) => set({ entity_type: v })}>
                  <option value="">Choose…</option>
                  {ENTITY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="State of formation">
                <Input
                  value={details.state_formed}
                  maxLength={60}
                  onChange={(e) => set({ state_formed: e.target.value })}
                  placeholder="Delaware"
                />
              </Field>
              <Field label="Date formed">
                <Input
                  type="date"
                  value={details.date_formed}
                  onChange={(e) => set({ date_formed: e.target.value })}
                />
              </Field>
              <Field label="Kind of fund">
                <Select value={details.fund_type} onChange={(v) => set({ fund_type: v })}>
                  <option value="">Choose…</option>
                  {FUND_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </Field>
              {details.fund_type === "Other" ? (
                <Field label="Please describe it" className="sm:col-span-2">
                  <Input
                    value={details.fund_type_other}
                    maxLength={120}
                    onChange={(e) => set({ fund_type_other: e.target.value })}
                  />
                </Field>
              ) : null}
            </div>
          ) : null}

          {step === 1 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Exemption used" required className="sm:col-span-2">
                <Select value={details.reg_type} onChange={(v) => set({ reg_type: v })}>
                  <option value="">Choose…</option>
                  {REG_TYPES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Your own counsel decides which exemption applies. Harmonious administers and records it.
                </p>
              </Field>
              <Field label="Target raise (USD)">
                <Input
                  inputMode="decimal"
                  value={details.target_raise}
                  onChange={(e) => set({ target_raise: e.target.value })}
                  placeholder="5,000,000"
                />
              </Field>
              <Field label="Minimum investment (USD)">
                <Input
                  inputMode="decimal"
                  value={details.min_investment}
                  onChange={(e) => set({ min_investment: e.target.value })}
                  placeholder="50,000"
                />
              </Field>
              <Field label="Expected number of investors">
                <Input
                  inputMode="numeric"
                  value={details.expected_investors}
                  onChange={(e) => set({ expected_investors: e.target.value })}
                  placeholder="25"
                />
              </Field>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-5">
              {PEOPLE.map((p) => {
                const value = details[p.key] as any as { name: string; firm: string; email: string };
                return (
                  <div key={String(p.key)} className="rounded-md border p-3">
                    <p className="text-sm font-medium">{p.label}</p>
                    <p className="text-xs text-muted-foreground">{p.note}</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <Input
                        value={value?.name ?? ""}
                        maxLength={160}
                        placeholder="Name"
                        onChange={(e) => setPerson(p.key, { name: e.target.value })}
                      />
                      <Input
                        value={value?.firm ?? ""}
                        maxLength={160}
                        placeholder="Firm"
                        onChange={(e) => setPerson(p.key, { firm: e.target.value })}
                      />
                      <Input
                        value={value?.email ?? ""}
                        maxLength={255}
                        placeholder="Email"
                        onChange={(e) => setPerson(p.key, { email: e.target.value })}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Does the fund have an EIN?">
                <Select
                  value={details.has_ein ? "yes" : "no"}
                  onChange={(v) => set({ has_ein: v === "yes" })}
                >
                  <option value="no">Not yet</option>
                  <option value="yes">Yes</option>
                </Select>
              </Field>
              {details.has_ein ? (
                <Field label="EIN">
                  <Input
                    value={details.ein}
                    maxLength={20}
                    onChange={(e) => set({ ein: e.target.value })}
                    placeholder="12-3456789"
                  />
                </Field>
              ) : null}
              <Field label="Bank the fund uses">
                <Input
                  value={details.bank_name}
                  maxLength={160}
                  onChange={(e) => set({ bank_name: e.target.value })}
                  placeholder="First National Bank"
                />
              </Field>
              <Field label="Where distributions are paid from" className="sm:col-span-2">
                <Textarea
                  value={details.distribution_source}
                  maxLength={400}
                  rows={3}
                  onChange={(e) => set({ distribution_source: e.target.value })}
                  placeholder="Operating account at the fund's bank, funded by property income."
                />
              </Field>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Never send full bank account or routing numbers here. Harmonious collects those separately,
                with verification and a call-back, before any money moves.
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 pt-2">
            {step > 0 ? (
              <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
            ) : null}
            {step < STEPS.length - 1 ? (
              <Button onClick={next} disabled={saveDraft.isPending}>
                {saveDraft.isPending ? "Saving…" : "Save and continue"}
              </Button>
            ) : (
              <Button onClick={() => finish.mutate()} disabled={!canFinish || finish.isPending}>
                {finish.isPending ? "Creating your fund…" : "Submit and open my portal"}
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => saveDraft.mutate()}
              disabled={saveDraft.isPending}
            >
              Save and finish later
            </Button>
          </div>

          {step === STEPS.length - 1 && !canFinish ? (
            <p className="text-sm text-destructive">
              Fund name, legal entity name, entity type and the exemption used are needed before we can create
              the fund.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {children}
    </div>
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {children}
    </select>
  );
}
