import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { applyToFund, listFundsToJoin } from "@/lib/apply.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export const Route = createFileRoute("/_authenticated/apply")({
  head: () => ({
    meta: [
      { title: "Apply to Join a Fund — Harmonious Investor Portal" },
      {
        name: "description",
        content:
          "Apply to join a Harmonious fund: choose the fund, tell us how you invest and how much, then step through identity, accreditation and funding.",
      },
      { property: "og:title", content: "Apply to Join a Fund — Harmonious Investor Portal" },
      {
        property: "og:description",
        content: "Start your subscription application and follow each step through to funding.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ApplyPage,
});

const TYPES = [
  { value: "individual", label: "In my own name" },
  { value: "joint", label: "Jointly with another person" },
  { value: "entity", label: "Through a company or LLC" },
  { value: "trust", label: "Through a trust" },
  { value: "ira", label: "Through a retirement account" },
] as const;

const NEXT_STEPS = [
  { label: "Confirm your identity", to: "/onboarding/kyc" as const, detail: "Legal name, date of birth and a photo ID." },
  { label: "Background screening", to: "/onboarding/aml" as const, detail: "Source of funds and a few disclosures." },
  { label: "Prove accreditation", to: "/onboarding/accreditation" as const, detail: "How you qualify as an accredited investor." },
  { label: "Sign the fund documents", to: "/onboarding/documents" as const, detail: "Subscription agreement and fund papers." },
  { label: "Confirm your commitment", to: "/subscription" as const, detail: "Final amount and how you will pay." },
  { label: "Send your funds", to: "/onboarding/funding" as const, detail: "Wire or ACH instructions, then confirm the transfer." },
];

function money(cents?: number | null) {
  if (!cents) return "—";
  return `$${(cents / 100).toLocaleString("en-US")}`;
}

function ApplyPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const load = useServerFn(listFundsToJoin);
  const apply = useServerFn(applyToFund);

  const { data, isLoading } = useQuery({ queryKey: ["funds-to-join"], queryFn: () => load() });

  const funds = ((data as any)?.funds ?? []) as any[];
  const profile = (data as any)?.profile ?? null;

  const [selectedId, setSelectedId] = useState<string>("");
  const [legalName, setLegalName] = useState("");
  const [entityName, setEntityName] = useState("");
  const [investorType, setInvestorType] = useState<string>("individual");
  const [amount, setAmount] = useState("");
  const [accredited, setAccredited] = useState(false);
  const [agree, setAgree] = useState(false);
  const [signedName, setSignedName] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const openFunds = useMemo(() => funds.filter((f) => !f.application), [funds]);
  const joined = useMemo(() => funds.filter((f) => f.application), [funds]);
  const selected = funds.find((f) => f.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId && openFunds.length > 0) setSelectedId(openFunds[0].id);
  }, [openFunds, selectedId]);

  useEffect(() => {
    if (profile?.legal_name && !legalName) setLegalName(profile.legal_name);
    if (profile?.entity_name && !entityName) setEntityName(profile.entity_name);
    if (profile?.investor_type) setInvestorType(profile.investor_type);
  }, [profile]);

  const mutation = useMutation({
    mutationFn: () =>
      apply({
        data: {
          offering_id: selectedId,
          legal_name: legalName.trim(),
          entity_name: entityName.trim() || undefined,
          investor_type: investorType as any,
          amount,
          accredited,
          agree,
          signed_name: signedName.trim(),
        },
      }),
    onSuccess: (res: any) => {
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ["funds-to-join"] });
      queryClient.invalidateQueries({ queryKey: ["my-subscription"] });
      toast.success(res?.created ? "Your application is started." : "You already have an application for this fund.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const step = submitted ? 3 : selected ? 2 : 1;

  if (submitted) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6 p-4 md:p-8">
        <Card>
          <CardHeader>
            <CardTitle>You have applied to {selected?.name ?? "the fund"}</CardTitle>
            <CardDescription>
              Your application is open and the fund team has been notified. Here is what happens
              next — you can do these in order, and come back any time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="space-y-3">
              {NEXT_STEPS.map((s, i) => (
                <li key={s.to} className="flex items-start gap-3 rounded-md border p-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <Link to={s.to} className="font-medium hover:underline">
                      {s.label}
                    </Link>
                    <p className="text-xs text-muted-foreground">{s.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => navigate({ to: "/onboarding/kyc" })}>Start the first step</Button>
              <Button variant="outline" onClick={() => navigate({ to: "/portal" })}>
                Go to your portal
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Apply to join a fund</h1>
        <p className="text-sm text-muted-foreground">
          Step {step} of 3 — choose a fund, tell us how you invest, then follow the steps into your
          portal.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Choose a fund</CardTitle>
          <CardDescription>These are the funds you have been invited to.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : openFunds.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              There is no new fund waiting for you right now. Your existing funds are listed below.
            </p>
          ) : (
            <ul className="space-y-2">
              {openFunds.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(f.id)}
                    className={`w-full rounded-md border p-3 text-left transition ${
                      selectedId === f.id ? "border-primary bg-muted/50" : "hover:bg-muted/30"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{f.name}</span>
                      <Badge variant={f.is_open ? "secondary" : "outline"}>
                        {f.is_open ? `Reg D ${f.reg_type}` : "Closed to new investors"}
                      </Badge>
                    </div>
                    {f.summary ? (
                      <p className="mt-1 text-xs text-muted-foreground">{f.summary}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      Minimum {money(f.min_investment_cents)}
                      {f.target_raise_cents ? ` · Target ${money(f.target_raise_cents)}` : ""}
                    </p>
                    {f.ndaRequired && !f.ndaAccepted ? (
                      <p className="mt-1 text-xs text-destructive">
                        Accept the confidentiality agreement in the fund's diligence room first.
                      </p>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {joined.length > 0 ? (
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="text-sm font-medium">Already applied</p>
              <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                {joined.map((f) => (
                  <li key={f.id}>
                    {f.name} — {String(f.application.status).replace(/_/g, " ")} ·{" "}
                    <Link to="/portal" className="underline">
                      open in your portal
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {selected ? (
        <Card>
          <CardHeader>
            <CardTitle>2. Your details</CardTitle>
            <CardDescription>
              How the investment will be held and how much you intend to invest in{" "}
              {selected.name}. You can change the exact amount later when you confirm your
              commitment.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="legal-name">Your full legal name</Label>
                <Input
                  id="legal-name"
                  value={legalName}
                  maxLength={120}
                  onChange={(e) => setLegalName(e.target.value)}
                  placeholder="As it appears on your ID"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount you intend to invest</Label>
                <Input
                  id="amount"
                  value={amount}
                  maxLength={20}
                  inputMode="decimal"
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={selected.min_investment_cents ? String(selected.min_investment_cents / 100) : "250000"}
                />
                <p className="text-xs text-muted-foreground">
                  Minimum {money(selected.min_investment_cents)}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>How will you hold this investment?</Label>
              <RadioGroup value={investorType} onValueChange={setInvestorType} className="grid gap-2 md:grid-cols-2">
                {TYPES.map((t) => (
                  <div key={t.value} className="flex items-center gap-2 rounded-md border p-2">
                    <RadioGroupItem value={t.value} id={`type-${t.value}`} />
                    <Label htmlFor={`type-${t.value}`} className="text-sm font-normal">
                      {t.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {investorType === "entity" || investorType === "trust" || investorType === "ira" ? (
              <div className="space-y-2">
                <Label htmlFor="entity-name">Name of the company, trust or account</Label>
                <Input
                  id="entity-name"
                  value={entityName}
                  maxLength={160}
                  onChange={(e) => setEntityName(e.target.value)}
                  placeholder="Legal name of the entity"
                />
              </div>
            ) : null}

            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-start gap-2">
                <Checkbox
                  id="accredited"
                  checked={accredited}
                  onCheckedChange={(v) => setAccredited(v === true)}
                />
                <Label htmlFor="accredited" className="text-sm font-normal">
                  I believe I meet the accredited investor standard and will provide supporting
                  information during the next steps.
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <Checkbox id="agree" checked={agree} onCheckedChange={(v) => setAgree(v === true)} />
                <Label htmlFor="agree" className="text-sm font-normal">
                  The details above are true, and I understand this application is not yet a
                  binding commitment.
                </Label>
              </div>
              <div className="space-y-2">
                <Label htmlFor="signature">Type your full legal name to sign</Label>
                <Input
                  id="signature"
                  value={signedName}
                  maxLength={120}
                  onChange={(e) => setSignedName(e.target.value)}
                  placeholder={legalName || "Your full legal name"}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => mutation.mutate()}
                disabled={
                  mutation.isPending ||
                  !selected.is_open ||
                  (selected.ndaRequired && !selected.ndaAccepted)
                }
              >
                {mutation.isPending ? "Submitting…" : "Submit application and continue"}
              </Button>
              {selected.hasRoom ? (
                <Button asChild variant="outline">
                  <Link to="/diligence/$offeringId" params={{ offeringId: selected.id }}>
                    Review the fund materials
                  </Link>
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
