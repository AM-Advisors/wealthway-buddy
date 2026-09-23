import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check } from "lucide-react";
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
  startInvestmentVerificationFn,
} from "@/lib/investor-onboarding.functions";
import { openableStep, type JourneyStep, type JourneyStepView } from "@/lib/investor-journey-model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const money = (cents: number | null | undefined) =>
  cents == null ? "—" : `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const PROFILE_TYPES = [
  ["individual", "Individual"],
  ["joint", "Joint"],
  ["llc", "LLC / company"],
  ["corporation", "Corporation"],
  ["partnership", "Partnership"],
  ["trust", "Trust"],
  ["ira", "IRA / retirement account"],
  ["family_office", "Family office"],
  ["foundation", "Foundation"],
  ["other_entity", "Other entity"],
] as const;

function useAction<T>(fn: (v: T) => Promise<any>, ok: string | null, done: () => void) {
  return useMutation({
    mutationFn: (v: T) => fn(v),
    onSuccess: () => {
      if (ok) toast.success(ok);
      done();
    },
    onError: (e: any) => toast.error(String(e?.message ?? e).replace(/^Forbidden:\s*/, "")),
  });
}

/**
 * Complete Your Investment — four steps: About You, Verification, Sign, Fund.
 * Every state shown here is derived on the server from authoritative records.
 */
export function InvestorOnboardingJourney({
  onboardingId,
  requestedStep,
}: {
  onboardingId: string;
  requestedStep?: string | undefined;
}) {
  const qc = useQueryClient();
  const detailFn = useServerFn(onboardingDetailFn);
  const detail = useQuery({
    queryKey: ["onboarding", onboardingId],
    queryFn: () => detailFn({ data: { onboardingId } }),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["onboarding", onboardingId] });
    void qc.invalidateQueries({ queryKey: ["onboarding-funding", onboardingId] });
  };

  const d: any = detail.data;
  const steps: JourneyStepView[] = d?.journey ?? [];
  const [active, setActive] = useState<JourneyStep | null>(null);
  useEffect(() => {
    if (d && !active) setActive(openableStep(steps, requestedStep));
  }, [d, active, steps, requestedStep]);

  if (detail.isLoading) return <p className="text-sm text-muted-foreground">Loading your investment…</p>;
  if (!d) return <p className="text-sm text-muted-foreground">This investment is not available.</p>;
  const current = active ?? openableStep(steps, requestedStep);
  const amount = d.acceptedAmountCents ?? d.requestedAmountCents;
  const complete = d.fundingStatus === "funded";

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">Complete Your Investment</p>
        <h1 className="text-3xl">{d.offering?.name ?? "Your investment"}</h1>
        <p className="mt-1 text-2xl font-semibold">{money(amount)}</p>
        {d.profileLabel ? <p className="mt-1 text-sm text-muted-foreground">Investing as: {d.profileLabel}</p> : null}
      </header>

      {complete ? (
        <Card>
          <CardHeader>
            <CardTitle>{money(d.fundedAmountCents || amount)} Received</CardTitle>
            <CardDescription>Your investment is complete.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline"><Link to="/dashboard">Go to your investments</Link></Button>
          </CardContent>
        </Card>
      ) : null}

      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.key}>
            <button
              type="button"
              disabled={s.state === "locked"}
              onClick={() => setActive(s.key)}
              className={cn(
                "w-full rounded-md border p-3 text-left text-sm transition-colors disabled:opacity-50",
                current === s.key ? "border-primary bg-primary/5" : "hover:bg-muted/50",
              )}
            >
              <span className="flex items-center gap-2 font-medium">
                {s.state === "complete" ? <Check className="h-4 w-4 text-primary" /> : <span className="text-muted-foreground">{i + 1}.</span>}
                {s.label}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">{s.message}</span>
            </button>
          </li>
        ))}
      </ol>

      {current === "about" ? <AboutYou d={d} onboardingId={onboardingId} done={refresh} /> : null}
      {current === "verify" ? <Verify d={d} onboardingId={onboardingId} /> : null}
      {current === "sign" ? <Sign d={d} onboardingId={onboardingId} done={refresh} /> : null}
      {current === "fund" ? <Fund d={d} onboardingId={onboardingId} done={refresh} /> : null}
    </div>
  );
}

function AboutYou({ d, onboardingId, done }: { d: any; onboardingId: string; done: () => void }) {
  const profilesFn = useServerFn(eligibleProfilesFn);
  const chooseFn = useServerFn(chooseProfileFn);
  const amountFn = useServerFn(setInvestmentAmountFn);
  const profiles = useQuery({ queryKey: ["onboarding-profiles"], queryFn: () => profilesFn({}) });
  const [profileId, setProfileId] = useState<string>(d.investmentProfileId ?? "");
  const [newType, setNewType] = useState("individual");
  const [newName, setNewName] = useState("");
  const [amount, setAmount] = useState(d.requestedAmountCents ? String(d.requestedAmountCents / 100) : "");
  const choose = useAction(chooseFn, "Saved.", done);
  const setAmt = useAction(amountFn, "Amount saved.", done);
  const list: any[] = (profiles.data as any)?.profiles ?? [];
  const owners = (d.requirements ?? []).find((r: any) => r.key === "beneficial_owners");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Who is making this investment?</CardTitle>
        <CardDescription>Each individual, company, trust or retirement account you invest through is kept separate.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {list.length > 0 ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-64">
              <Label>Investing as</Label>
              <Select value={profileId} onValueChange={setProfileId}>
                <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>
                  {list.map((p) => <SelectItem key={p.id} value={p.id}>{p.display_label ?? p.legal_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button disabled={!profileId || profileId === d.investmentProfileId} onClick={() => choose.mutate({ data: { onboardingId, profileId } } as any)}>
              Use this
            </Button>
          </div>
        ) : null}

        <div className="space-y-3 rounded-md border p-4">
          <p className="text-sm font-medium">{list.length ? "Or add someone new" : "Add who is investing"}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Type</Label>
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PROFILE_TYPES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="pname">{newType === "individual" || newType === "joint" ? "Name as it should appear" : "Legal name"}</Label>
              <Input id="pname" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
          </div>
          <Button
            variant="outline"
            disabled={newName.trim().length < 2}
            onClick={() =>
              choose.mutate({
                data: { onboardingId, create: { profileType: newType, displayLabel: newName.trim(), legalName: newName.trim() } },
              } as any)
            }
          >
            Add and use
          </Button>
        </div>

        {owners && owners.state !== "valid" && owners.state !== "not_applicable" ? (
          <p className="rounded-md bg-muted p-3 text-sm">
            {owners.reason ?? "We still need the people who own, control or sign for this investor."}{" "}
            <Link to="/profile" className="underline">Add them to this profile</Link>.
          </p>
        ) : null}

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="amount">Investment amount (USD)</Label>
            <Input id="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <Button
            variant="outline"
            disabled={!amount}
            onClick={() => setAmt.mutate({ data: { onboardingId, amountCents: Math.round(Number(amount.replace(/[,$]/g, "")) * 100) } } as any)}
          >
            Save amount
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Verify({ d, onboardingId }: { d: any; onboardingId: string }) {
  const startFn = useServerFn(startInvestmentVerificationFn);
  const start = useMutation({
    mutationFn: () => startFn({ data: { onboardingId } }),
    onSuccess: (r: any) => {
      if (r?.url) window.location.assign(r.url);
    },
    onError: (e: any) => toast.error(String(e?.message ?? e).replace(/^Forbidden:\s*/, "")),
  });
  const status = d.verification as string;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Verify Your Investment Eligibility</CardTitle>
        <CardDescription>We'll verify the information required to participate in this investment.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === "complete" ? (
          <Badge>Verification complete</Badge>
        ) : status === "in_progress" ? (
          <p className="text-sm">Verification in progress. We'll let you know if we need anything else.</p>
        ) : (
          <>
            {status === "action_required" ? (
              <p className="text-sm">Part of your verification needs to be completed or renewed.</p>
            ) : null}
            <Button onClick={() => start.mutate()} disabled={start.isPending}>
              {start.isPending ? "Opening…" : "Start Verification"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Sign({ d, onboardingId, done }: { d: any; onboardingId: string; done: () => void }) {
  const questionnaireFn = useServerFn(saveQuestionnaireFn);
  const prepareFn = useServerFn(prepareSubscriptionDocumentsFn);
  const confirmFn = useServerFn(recordSubscriptionSignatureFn);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [signer, setSigner] = useState("");
  const saveQ = useAction(questionnaireFn, "Answers saved.", done);
  const prepare = useAction(prepareFn, null, done);
  const confirm = useAction(confirmFn, "Thank you. Harmonious will now review your subscription.", done);
  const docs: any[] = d.documents ?? [];
  const questionnaireDone = (d.requirements ?? []).find((r: any) => r.key === "subscription_questionnaire")?.state !== "missing";
  const signed = (d.requirements ?? []).find((r: any) => r.key === "signature")?.state === "valid";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review &amp; Sign</CardTitle>
        <CardDescription>These are the documents required for this investment.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {d.questionnaire && !questionnaireDone ? (
          <div className="space-y-3 rounded-md border p-4">
            <p className="text-sm font-medium">Investor questionnaire</p>
            {(d.questionnaire.questions ?? []).map((q: any) => (
              <div key={q.key}>
                <Label htmlFor={q.key}>{q.label}</Label>
                <Textarea id={q.key} value={answers[q.key] ?? String(d.questionnaireResponses?.[q.key] ?? "")} onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })} />
              </div>
            ))}
            <Button onClick={() => saveQ.mutate({ data: { onboardingId, answers, submit: true } } as any)}>Save answers</Button>
          </div>
        ) : null}

        <ul className="space-y-2">
          {docs.map((doc) => (
            <li key={doc.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
              <span>{doc.title}</span>
              <Badge variant={doc.signed ? "default" : "outline"}>{doc.signed ? "Signed" : doc.requiresSignature ? "To sign" : "To review"}</Badge>
            </li>
          ))}
          {docs.length === 0 ? <li className="text-sm text-muted-foreground">Your documents are being prepared.</li> : null}
        </ul>

        {!signed ? (
          <Button
            asChild
            onClick={() => {
              if (!d.documentTemplateVersion) prepare.mutate({ data: { onboardingId } } as any);
            }}
          >
            <Link to="/fund/$offeringId/documents" params={{ offeringId: d.offering.id }}>Review &amp; Sign Documents</Link>
          </Button>
        ) : !d.executedSnapshot ? (
          <div className="space-y-3 rounded-md border p-4">
            <p className="text-sm">All documents are signed. Confirm who signed to send your subscription to Harmonious.</p>
            <div className="max-w-sm">
              <Label htmlFor="signer">Signer's full legal name</Label>
              <Input id="signer" value={signer} onChange={(e) => setSigner(e.target.value)} />
            </div>
            <Button disabled={signer.trim().length < 2} onClick={() => confirm.mutate({ data: { onboardingId, signerName: signer.trim() } } as any)}>
              Submit subscription
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Signed and submitted. Copies are in your Documents.</p>
        )}
        <p className="text-xs text-muted-foreground">A document shows as signed only once the signing service confirms it — this can take a minute.</p>
      </CardContent>
    </Card>
  );
}

function Fund({ d, onboardingId, done }: { d: any; onboardingId: string; done: () => void }) {
  const fundingFn = useServerFn(fundingInstructionsFn);
  const sentFn = useServerFn(investorReportsFundsSentFn);
  const [reveal, setReveal] = useState(false);
  const funding = useQuery({
    queryKey: ["onboarding-funding", onboardingId],
    queryFn: () => fundingFn({ data: { onboardingId } }),
    enabled: reveal,
  });
  const sent = useAction(sentFn, "Thanks — we'll confirm once your transfer is received and matched.", done);
  const f: any = funding.data;
  const step = (d.journey ?? []).find((s: any) => s.key === "fund");
  const amount = d.acceptedAmountCents ?? d.requestedAmountCents;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fund Your Investment</CardTitle>
        <CardDescription>Investment {money(amount)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm">{step?.message}</p>
        {d.approvedToFund && d.fundingStatus !== "funded" ? (
          <>
            {!reveal ? (
              <Button onClick={() => setReveal(true)}>View Secure Wiring Instructions</Button>
            ) : funding.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : f?.unlocked ? (
              <div className="space-y-2 rounded-md border p-4 text-sm">
                <p><strong>Bank:</strong> {f.instructions.bankName ?? "—"}</p>
                {f.instructions.details && typeof f.instructions.details === "object"
                  ? Object.entries(f.instructions.details).map(([k, v]) => (
                      <p key={k}><strong>{k.replace(/_/g, " ")}:</strong> {String(v)}</p>
                    ))
                  : null}
                <p><strong>Reference:</strong> {f.instructions.reference}</p>
                <p><strong>Amount:</strong> {money(f.instructions.expectedAmountCents)}</p>
                <p className="rounded-md bg-muted p-3 text-muted-foreground">{f.instructions.warning}</p>
              </div>
            ) : (
              <ul className="list-disc pl-5 text-sm text-muted-foreground">
                {(f?.reasons ?? ["Funding is not open yet."]).map((r: string) => <li key={r}>{r}</li>)}
              </ul>
            )}
            {!d.investorReportsSent ? (
              <Button variant="outline" onClick={() => sent.mutate({ data: { onboardingId } } as any)}>I've Sent My Wire</Button>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
