import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  chooseProfileFn,
  eligibleProfilesFn,
  fundingInstructionsFn,
  investorReportsFundsSentFn,
  onboardingDetailFn,
  prepareSubscriptionDocumentsFn,
  recordSubscriptionSignatureFn,
  saveQuestionnaireFn,
  setInvestmentAmountFn,
} from "@/lib/investor-onboarding.functions";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const money = (cents: number | null | undefined) =>
  cents == null ? "—" : `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const stateTone: Record<string, string> = {
  satisfied: "bg-primary/10 text-primary",
  in_review: "bg-amber-100 text-amber-900",
  action_required: "bg-destructive/10 text-destructive",
  not_applicable: "bg-muted text-muted-foreground",
};

export function InvestorOnboardingJourney({ onboardingId }: { onboardingId: string }) {
  const qc = useQueryClient();
  const detailFn = useServerFn(onboardingDetailFn);
  const profilesFn = useServerFn(eligibleProfilesFn);
  const chooseFn = useServerFn(chooseProfileFn);
  const amountFn = useServerFn(setInvestmentAmountFn);
  const questionnaireFn = useServerFn(saveQuestionnaireFn);
  const prepareFn = useServerFn(prepareSubscriptionDocumentsFn);
  const signFn = useServerFn(recordSubscriptionSignatureFn);
  const fundingFn = useServerFn(fundingInstructionsFn);
  const sentFn = useServerFn(investorReportsFundsSentFn);

  const detail = useQuery({
    queryKey: ["onboarding", onboardingId],
    queryFn: () => detailFn({ data: { onboardingId } }),
  });
  const profiles = useQuery({ queryKey: ["onboarding-profiles"], queryFn: () => profilesFn({}) });
  const funding = useQuery({
    queryKey: ["onboarding-funding", onboardingId],
    queryFn: () => fundingFn({ data: { onboardingId } }),
  });

  const [profileId, setProfileId] = useState("");
  const [amount, setAmount] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [signerName, setSignerName] = useState("");
  const [capacity, setCapacity] = useState("");

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["onboarding", onboardingId] });
    void qc.invalidateQueries({ queryKey: ["onboarding-funding", onboardingId] });
  };
  const run = <T,>(fn: (v: T) => Promise<unknown>, ok: string) =>
    useMutationSafe(fn, ok, refresh);

  const choose = run(chooseFn, "Investor saved.");
  const setAmt = run(amountFn, "Amount saved.");
  const saveQ = run(questionnaireFn, "Answers saved.");
  const prepare = run(prepareFn, "Your subscription documents are ready.");
  const sign = run(signFn, "Signature recorded.");
  const reportSent = run(sentFn, "Thank you — we will confirm once the money arrives.");

  if (detail.isLoading) return <p className="text-sm text-muted-foreground">Loading your investment…</p>;
  const d: any = detail.data;
  if (!d) return <p className="text-sm text-muted-foreground">This investment is not available.</p>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{d.offering?.name ?? "Your investment"}</CardTitle>
          <CardDescription>
            Stage: {String(d.stage).replace(/_/g, " ")} · Requested {money(d.requestedAmountCents)}
            {d.acceptedAmountCents ? ` · Accepted ${money(d.acceptedAmountCents)}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {(d.checklist ?? []).map((item: any) => (
            <div key={item.key} className="flex items-center justify-between rounded-md border p-3">
              <span className="text-sm">{item.label}</span>
              <Badge className={stateTone[item.state] ?? "bg-muted text-muted-foreground"}>
                {String(item.state).replace(/_/g, " ")}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Who is investing</CardTitle>
          <CardDescription>
            Each individual, company or trust you invest through is kept separate.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="min-w-56">
            <Label>Investor</Label>
            <Select value={profileId || d.investmentProfileId || ""} onValueChange={setProfileId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose" />
              </SelectTrigger>
              <SelectContent>
                {((profiles.data as any)?.profiles ?? (profiles.data as any) ?? []).map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.display_label ?? p.displayLabel ?? p.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            disabled={!profileId}
            onClick={() => choose.mutate({ data: { onboardingId, profileId } } as any)}
          >
            Save
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How much you would like to invest</CardTitle>
          <CardDescription>
            Minimum {money(d.offering?.minInvestmentCents)}. Harmonious confirms the final amount.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="amount">Amount (USD)</Label>
            <Input
              id="amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="250000"
            />
          </div>
          <Button
            disabled={!amount}
            onClick={() =>
              setAmt.mutate({
                data: { onboardingId, amountCents: Math.round(Number(amount) * 100) },
              } as any)
            }
          >
            Save amount
          </Button>
        </CardContent>
      </Card>

      {d.questionnaire ? (
        <Card>
          <CardHeader>
            <CardTitle>Subscription questionnaire</CardTitle>
            <CardDescription>Version {d.questionnaire.version}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(d.questionnaire.questions ?? []).map((q: any) => (
              <div key={q.key}>
                <Label htmlFor={q.key}>{q.label}</Label>
                <Textarea
                  id={q.key}
                  value={answers[q.key] ?? String(d.questionnaireResponses?.[q.key] ?? "")}
                  onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })}
                />
              </div>
            ))}
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => saveQ.mutate({ data: { onboardingId, answers } } as any)}
              >
                Save draft
              </Button>
              <Button
                onClick={() => saveQ.mutate({ data: { onboardingId, answers, submit: true } } as any)}
              >
                Submit answers
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Subscription documents</CardTitle>
          <CardDescription>
            Your documents are locked to the fund's approved version at the moment you sign.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="outline" onClick={() => prepare.mutate({ data: { onboardingId } } as any)}>
            Prepare my documents
          </Button>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="signer">Your full legal name</Label>
              <Input id="signer" value={signerName} onChange={(e) => setSignerName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="capacity">Signing as (for a company or trust)</Label>
              <Input id="capacity" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </div>
          </div>
          <Button
            disabled={signerName.trim().length < 2}
            onClick={() =>
              sign.mutate({
                data: { onboardingId, signerName: signerName.trim(), capacity: capacity || null },
              } as any)
            }
          >
            Sign subscription
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Funding</CardTitle>
          <CardDescription>
            Funding details appear here only after Harmonious approves your subscription.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(funding.data as any)?.unlocked ? (
            <div className="space-y-2 text-sm">
              <p>
                <strong>Bank:</strong> {(funding.data as any).instructions.bankName ?? "—"}
              </p>
              <p>
                <strong>Reference:</strong> {(funding.data as any).instructions.reference}
              </p>
              <p>
                <strong>Amount:</strong> {money((funding.data as any).instructions.expectedAmountCents)}
              </p>
              <p className="rounded-md bg-muted p-3 text-muted-foreground">
                {(funding.data as any).instructions.warning}
              </p>
              <Button onClick={() => reportSent.mutate({ data: { onboardingId } } as any)}>
                I have sent the funds
              </Button>
            </div>
          ) : (
            <ul className="list-disc pl-5 text-sm text-muted-foreground">
              {((funding.data as any)?.reasons ?? ["Funding is not open yet."]).map((r: string) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function useMutationSafe<T>(fn: (v: T) => Promise<unknown>, ok: string, done: () => void) {
  return useMutation({
    mutationFn: (v: T) => fn(v),
    onSuccess: () => {
      toast.success(ok);
      done();
    },
    onError: (e: any) => toast.error(String(e?.message ?? e).replace(/^Forbidden:\s*/, "")),
  });
}
