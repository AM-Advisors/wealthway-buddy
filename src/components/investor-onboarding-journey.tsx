import { useEffect, useState } from "react";
import { InvestorBankVerify } from "@/components/investor-bank-verify";
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
  investorFundingLedgerFn,
  onboardingDetailFn,
  prepareSubscriptionDocumentsFn,
  recordSubscriptionSignatureFn,
  saveQuestionnaireFn,
  setInvestmentAmountFn,
  startInvestmentVerificationFn,
} from "@/lib/investor-onboarding.functions";
import { investorHomeSummary, nextJourneyStep, openableStep, type JourneyStep, type JourneyStepView } from "@/lib/investor-journey-model";
import { kycFieldsFor } from "@/lib/kyc-fields";
import { DealReview } from "@/components/deal-review";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { isReconciledFunding } from "@/lib/funding-status";
import { WIRE_FIELD_LABELS } from "@/lib/wire-scope";
import { FeeAcceptanceCard, OnboardingUploadsCard, useFeesAccepted } from "@/components/investor-onboarding-extras";
import { TaxSignPanel } from "@/components/onboard-compliance-panels";

const money = (cents: number | null | undefined) =>
  cents == null ? "-" : `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

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
 * Complete Your Investment - four steps: About You, Verification, Sign, Fund.
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
  const [active, setActive] = useState<JourneyStep | "review" | null>(null);
  useEffect(() => {
    if (!d || active) return;
    const fresh = !requestedStep && d.stage !== undefined && !d.investmentProfileId;
    setActive(fresh ? "review" : openableStep(steps, requestedStep));
  }, [d, active, steps, requestedStep]);

  if (detail.isLoading) return <p className="text-sm text-muted-foreground">Loading your investment…</p>;
  if (!d) return <p className="text-sm text-muted-foreground">This investment is not available.</p>;
  const current = active ?? openableStep(steps, requestedStep);
  const order: (JourneyStep | "review")[] = ["review", ...steps.map((s) => s.key)];
  const nextKey = nextJourneyStep(steps);
  const reachedIndex = Math.max(0, steps.findIndex((s) => s.key === nextKey));
  const pos = order.indexOf(current);
  const prev = pos > 0 ? order[pos - 1] : null;
  const nextCandidate = pos >= 0 && pos < order.length - 1 ? order[pos + 1] : null;
  const nextIdx = nextCandidate ? steps.findIndex((s) => s.key === nextCandidate) : -1;
  const next = nextCandidate && (nextIdx <= reachedIndex || steps[nextIdx]?.state !== "locked") ? nextCandidate : null;
  const amount = d.acceptedAmountCents ?? d.requestedAmountCents;
  const complete = isReconciledFunding(d.fundingStatus);

  const h = investorHomeSummary(steps);
  const showTopContinue = !!h.nextStep && h.nextStep !== current && h.nextStep !== next;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold">Complete your investment</h2>
        <p className="text-sm text-muted-foreground">
          {d.profileLabel ? `Investing as ${d.profileLabel}` : "Investing profile not chosen yet"}{amount ? ` · ${money(amount)}` : ""}
        </p>
      </header>

      <Card>
        <CardContent className="space-y-5 pt-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm"><span className="font-medium">Progress</span><span className="text-muted-foreground">{h.progressPercent}%</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${h.progressPercent}%` }} /></div>
          </div>

          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <li>
              <button
                type="button"
                onClick={() => setActive("review")}
                className={cn(
                  "flex h-full w-full flex-col rounded-md border p-3 text-left text-sm transition-colors",
                  current === "review" ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                )}
              >
                <span className="font-medium">Review the deal</span>
                <span className="mt-1 line-clamp-2 text-xs text-muted-foreground">Fund, terms and documents</span>
              </button>
            </li>
            {steps.map((s, i) => (
              <li key={s.key}>
                <button
                  type="button"
                  title={s.message}
                  disabled={s.state === "locked" && i > reachedIndex}
                  onClick={() => setActive(s.key)}
                  className={cn(
                    "flex h-full w-full flex-col rounded-md border p-3 text-left text-sm transition-colors disabled:opacity-50",
                    current === s.key ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                  )}
                >
                  <span className="flex items-center gap-2 font-medium">
                    {s.state === "complete" ? <Check className="h-4 w-4 text-primary" /> : <span className="text-muted-foreground">{i + 1}.</span>}
                    {s.label}
                  </span>
                  <span className="mt-1 line-clamp-2 text-xs text-muted-foreground">{s.message}</span>
                </button>
              </li>
            ))}
          </ol>

          {h.complete ? null : (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              {h.caughtUp ? (
                <div><p className="font-medium">You're caught up</p><p className="text-sm text-muted-foreground">{h.waitingOn}</p></div>
              ) : (
                <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Next action</p><p className="font-medium">{h.nextAction}</p></div>
              )}
              {showTopContinue ? <Button size="sm" onClick={() => setActive(h.nextStep!)}>Continue</Button> : null}
            </div>
          )}
        </CardContent>
      </Card>

      {complete ? (
        <Card>
          <CardHeader>
            <CardTitle>{money(d.fundedAmountCents || amount)} Received</CardTitle>
            <CardDescription>Your investment is complete.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline"><Link to="/home">Go to your investments</Link></Button>
          </CardContent>
        </Card>
      ) : null}

      {current === "review" ? <DealReview slug={d.offering?.slug ?? d.offering?.id} /> : null}
      {current === "about" ? <AboutYou d={d} onboardingId={onboardingId} done={refresh} /> : null}
      {current === "verify" ? <Verify d={d} onboardingId={onboardingId} /> : null}
      {current === "sign" ? <Sign d={d} onboardingId={onboardingId} done={refresh} /> : null}
      {current === "fund" ? <Fund d={d} onboardingId={onboardingId} done={refresh} /> : null}
      <div className="flex justify-between gap-2">
        {prev ? <Button variant="outline" onClick={() => setActive(prev)}>Back</Button> : <span />}
        {next ? (
          <Button variant={current === "review" ? "default" : "outline"} onClick={() => setActive(next)}>
            {current === "review" ? "Continue to About You" : "Next"}
          </Button>
        ) : null}
      </div>
      {current !== "fund" && current !== "review" ? <OnboardingUploadsCard onboardingId={onboardingId} /> : null}
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
  const [kyc, setKyc] = useState<Record<string, string>>({});
  const fields = kycFieldsFor(newType, false);
  const missing = fields.some((f) => f.required && !(kyc[f.key] ?? "").trim());
  const [amount, setAmount] = useState(d.requestedAmountCents ? String(d.requestedAmountCents / 100) : "");
  const choose = useAction(chooseFn, "Saved.", done);
  const setAmt = useAction(amountFn, "Amount saved.", done);
  const list: any[] = (profiles.data as any)?.profiles ?? [];
  const owners = (d.requirements ?? []).find((r: any) => r.key === "beneficial_owners");

  return (
    <Card>
      <CardHeader>
        <CardTitle>How are you investing?</CardTitle>
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
          <p className="text-sm font-medium">Add new investment profile</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Type</Label>
              <Select value={newType} onValueChange={(v) => { setNewType(v); setKyc({}); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PROFILE_TYPES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="pname">{newType === "individual" || newType === "joint" || newType === "ira" ? "Full legal name" : "Legal name"}</Label>
              <Input id="pname" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            {fields.map((f) => (
              <div key={f.key}>
                <Label htmlFor={`kyc-${f.key}`}>{f.label}</Label>
                <Input
                  id={`kyc-${f.key}`}
                  type={f.kind === "date" ? "date" : "text"}
                  autoComplete="off"
                  value={kyc[f.key] ?? ""}
                  onChange={(e) => setKyc((k) => ({ ...k, [f.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">We use these details to verify this profile once. We keep only the last four digits of ID numbers, and you won't be asked again for other funds.</p>
          <Button
            variant="outline"
            disabled={newName.trim().length < 2 || missing}
            onClick={() =>
              choose.mutate({
                data: { onboardingId, create: { profileType: newType, displayLabel: newName.trim(), legalName: newName.trim(), kyc } },
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
  const qc = useQueryClient();
  const start = useMutation({
    mutationFn: () => startFn({ data: { onboardingId } }),
    onSuccess: (r: any) => {
      if (r?.url) window.location.assign(r.url);
      else if (r?.completed) { toast.success("Your earlier verification was reused — this step is complete."); void qc.invalidateQueries(); }
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

function QuestionnaireForm({ d, done, locked, onSave, saving }: { d: any; onboardingId: string; done: boolean; locked: boolean; onSave: (answers: Record<string, string>, submit: boolean) => void; saving: boolean }) {
  const questions: any[] = d.questionnaire.questions ?? [];
  const saved = (d.questionnaireResponses ?? {}) as Record<string, unknown>;
  const [open, setOpen] = useState(!done);
  const [answers, setAnswers] = useState<Record<string, string>>(() => Object.fromEntries(questions.map((q) => [q.key, saved[q.key] == null ? "" : String(saved[q.key])])));
  const missing = questions.filter((q) => q.required && !String(answers[q.key] ?? "").trim());
  const set = (k: string, v: string) => setAnswers((a) => ({ ...a, [k]: v }));
  return (
    <div className="space-y-4 rounded-md border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Investor questionnaire</p>
          <p className="text-xs text-muted-foreground">{done ? "Your answers are saved." : `${questions.length - missing.length} of ${questions.length} answered. Questions marked * are required.`}</p>
        </div>
        {done && !locked ? <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>{open ? "Close" : "Review answers"}</Button> : done ? <Badge>Complete</Badge> : null}
      </div>
      {open ? (
        <fieldset disabled={locked} className="space-y-4">
          {questions.map((q, n) => (
            <div key={q.key} className="space-y-1.5">
              <Label htmlFor={q.key} className="leading-snug">{n + 1}. {q.label}{q.required ? " *" : ""}</Label>
              {q.type === "select" || q.type === "yes_no" ? (
                <Select value={answers[q.key] ?? ""} onValueChange={(v) => set(q.key, v)}>
                  <SelectTrigger id={q.key}><SelectValue placeholder="Choose one" /></SelectTrigger>
                  <SelectContent>{(q.type === "yes_no" ? ["Yes", "No"] : (q.options ?? [])).map((o: string) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
              ) : q.type === "number" || q.type === "currency" ? (
                <Input id={q.key} inputMode="decimal" value={answers[q.key] ?? ""} onChange={(e) => set(q.key, e.target.value)} />
              ) : q.type === "date" ? (
                <Input id={q.key} type="date" value={answers[q.key] ?? ""} onChange={(e) => set(q.key, e.target.value)} />
              ) : (
                <Input id={q.key} value={answers[q.key] ?? ""} onChange={(e) => set(q.key, e.target.value)} />
              )}
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Don't enter your tax ID or bank account numbers here. Harmonious asks for them in separate, protected steps.</p>
          {!locked ? (
            <div className="flex flex-wrap gap-2">
              <Button disabled={saving || missing.length > 0} onClick={() => onSave(answers, true)}>{done ? "Save changes" : "Submit answers"}</Button>
              <Button variant="outline" disabled={saving} onClick={() => onSave(answers, false)}>Save for later</Button>
            </div>
          ) : null}
        </fieldset>
      ) : null}
    </div>
  );
}

function Sign({ d, onboardingId, done }: { d: any; onboardingId: string; done: () => void }) {
  const questionnaireFn = useServerFn(saveQuestionnaireFn);
  const prepareFn = useServerFn(prepareSubscriptionDocumentsFn);
  const confirmFn = useServerFn(recordSubscriptionSignatureFn);
  const [signer, setSigner] = useState("");
  const saveQ = useAction(questionnaireFn, "Answers saved.", done);
  const prepare = useAction(prepareFn, null, done);
  const confirm = useAction(confirmFn, "Thank you. Harmonious will now review your subscription.", done);
  const docs: any[] = d.documents ?? [];
  const questionnaireDone = (d.requirements ?? []).find((r: any) => r.key === "subscription_questionnaire")?.state !== "missing";
  const signed = (d.requirements ?? []).find((r: any) => r.key === "signature")?.state === "valid";
  const fees = useFeesAccepted(onboardingId);

  return (
    <div className="space-y-5">
    <TaxSignPanel onboardingId={onboardingId} done={done} />
    <Card>
      <CardHeader>
        <CardTitle>Review &amp; Sign</CardTitle>
        <CardDescription>These are the documents required for this investment.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {d.questionnaire && (d.questionnaire.questions ?? []).length ? (
          <QuestionnaireForm d={d} onboardingId={onboardingId} done={questionnaireDone} locked={signed} onSave={(answers, submit) => saveQ.mutate({ data: { onboardingId, answers, submit } } as any)} saving={saveQ.isPending} />
        ) : null}

        <FeeAcceptanceCard onboardingId={onboardingId} />

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Subscription documents</h3>
          {!questionnaireDone ? (
            <p className="text-sm text-muted-foreground">Submit the questionnaire above to unlock your subscription documents.</p>
          ) : (
            <ol className="space-y-2">
              {docs.map((doc, i) => {
                const status = doc.signed
                  ? "Signed"
                  : doc.requiresSignature
                    ? "To sign"
                    : doc.requiresAcknowledgment
                      ? doc.acknowledged ? "Acknowledged" : "To acknowledge"
                      : "To review";
                const complete = doc.signed || (doc.requiresAcknowledgment && doc.acknowledged);
                return (
                  <li key={doc.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                    <span className="flex items-center gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">{i + 1}</span>
                      <span>{doc.title}</span>
                    </span>
                    <Badge variant={complete ? "default" : "outline"}>{status}</Badge>
                  </li>
                );
              })}
              {docs.length === 0 ? <li className="text-sm text-muted-foreground">The fund's documents are being prepared. We'll let you know when they're ready.</li> : null}
            </ol>
          )}
        </div>

        {!questionnaireDone || docs.length === 0 ? null : !signed && !fees.ok ? (
          <p className="text-sm text-muted-foreground">Accept the fund's fees above to review and sign your documents.</p>
        ) : !signed ? (
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
        <p className="text-xs text-muted-foreground">A document shows as signed only once the signing service confirms it - this can take a minute.</p>
      </CardContent>
    </Card>
    </div>
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
  const sent = useAction(sentFn, "Thanks - we'll confirm once your transfer is received and matched.", done);
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
                <p><strong>Bank:</strong> {f.instructions.bankName ?? "-"}</p>
                {f.instructions.details && typeof f.instructions.details === "object"
                  ? Object.entries(f.instructions.details).map(([k, v]) => (
                      <p key={k}><strong>{WIRE_FIELD_LABELS[k] ?? k.replace(/_/g, " ")}:</strong> {String(v)}</p>
                    ))
                  : null}
                <p><strong>Reference:</strong> {f.instructions.reference}</p>
                <p><strong>Amount:</strong> {money(f.instructions.expectedAmountCents)}</p>
                {(f.instructions.methods ?? []).some((m: any) => m.method === "ach") && <InvestorBankVerify onboardingId={onboardingId} />}
                {(f.instructions.methods ?? []).length > 0 && (
                  <div className="space-y-2 pt-2">
                    <p className="font-semibold">Ways you can send it</p>
                    {(f.instructions.methods as { method: string; timeline: string }[]).map((m) => (
                      <div key={m.method} className={m.method === "wire" ? "rounded-md border p-3" : "rounded-md border border-destructive/30 bg-destructive/5 p-3"}>
                        <p className="font-medium">{m.method === "ach" ? "ACH (use the bank and routing number above)" : m.method === "check" ? "Check" : "Wire"}</p>
                        <p className={m.method === "wire" ? "text-muted-foreground" : "text-destructive"}>{m.timeline}</p>
                        {m.method === "check" && f.instructions.check && (
                          <p className="mt-1">Payable to <strong>{f.instructions.check.payableTo ?? "-"}</strong>, mailed to <span className="whitespace-pre-line">{f.instructions.check.mailTo ?? "-"}</span>. Write the reference on the memo line.</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <p className="rounded-md bg-muted p-3 text-muted-foreground">{f.instructions.warning}</p>
              </div>
            ) : (
              <ul className="list-disc pl-5 text-sm text-muted-foreground">
                {(f?.reasons ?? ["Funding is not open yet."]).map((r: string) => <li key={r}>{r}</li>)}
              </ul>
            )}
            <WireSentForm
              defaultAmountCents={amount}
              pending={sent.isPending}
              already={!!d.investorReportsSent}
              onSubmit={(v) => sent.mutate({ data: { onboardingId, ...v } } as any)}
            />
          </>
        ) : null}
        {d.approvedToFund ? <FundingLedger onboardingId={onboardingId} /> : null}
        <p className="text-xs text-muted-foreground">
          Harmonious never moves money for you. You send the wire from your own bank; your investment shows as funded only once we receive and match it.
        </p>
      </CardContent>
    </Card>
  );
}

function WireSentForm({ defaultAmountCents, pending, already, onSubmit }: {
  defaultAmountCents: number | null;
  pending: boolean;
  already: boolean;
  onSubmit: (v: { sentOn: string | null; amountCents: number | null; sendingBank: string | null; reference: string | null }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [sentOn, setSentOn] = useState(new Date().toISOString().slice(0, 10));
  const [amt, setAmt] = useState(defaultAmountCents ? String(defaultAmountCents / 100) : "");
  const [bank, setBank] = useState("");
  const [ref, setRef] = useState("");
  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        {already ? "Report Another Wire" : "I've Sent My Wire"}
      </Button>
    );
  }
  const cents = Math.round(Number(amt.replace(/[$,]/g, "")) * 100);
  return (
    <div className="space-y-3 rounded-md border p-4">
      <p className="text-sm font-medium">Confirm your wire</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="w-date">Date sent</Label><Input id="w-date" type="date" value={sentOn} onChange={(e) => setSentOn(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="w-amt">Amount sent ($)</Label><Input id="w-amt" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="w-bank">Sending bank</Label><Input id="w-bank" value={bank} onChange={(e) => setBank(e.target.value)} placeholder="e.g. Chase" /></div>
        <div className="space-y-1"><Label htmlFor="w-ref">Confirmation number (optional)</Label><Input id="w-ref" value={ref} onChange={(e) => setRef(e.target.value)} /></div>
      </div>
      <p className="text-xs text-muted-foreground">Don't enter account numbers.</p>
      <div className="flex gap-2">
        <Button
          disabled={pending || !(cents > 0)}
          onClick={() => onSubmit({ sentOn, amountCents: cents > 0 ? cents : null, sendingBank: bank || null, reference: ref || null })}
        >
          Confirm Wire Sent
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}

function FundingLedger({ onboardingId }: { onboardingId: string }) {
  const ledgerFn = useServerFn(investorFundingLedgerFn);
  const q = useQuery({ queryKey: ["onboarding-funding-ledger", onboardingId], queryFn: () => ledgerFn({ data: { onboardingId } }) });
  const l: any = q.data;
  if (!l) return null;
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Funding Ledger</p>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <div className="rounded-md bg-muted p-2"><p className="text-xs text-muted-foreground">Expected</p><p className="font-medium">{money(l.expectedCents)}</p></div>
        <div className="rounded-md bg-muted p-2"><p className="text-xs text-muted-foreground">Received</p><p className="font-medium">{money(l.receivedCents)}</p></div>
        <div className="rounded-md bg-muted p-2"><p className="text-xs text-muted-foreground">Remaining</p><p className="font-medium">{money(l.remainingCents)}</p></div>
      </div>
      <ul className="divide-y rounded-md border text-sm">
        {l.entries.length === 0 ? <li className="p-3 text-muted-foreground">No activity yet.</li> : null}
        {l.entries.map((e: any) => (
          <li key={e.id} className="flex items-start justify-between gap-3 p-3">
            <div>
              <p className={cn(e.kind === "received" && "font-medium")}>{e.label}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(e.at).toLocaleDateString()}
                {e.sentOn ? ` · sent ${e.sentOn}` : ""}
                {e.sendingBank ? ` · ${e.sendingBank}` : ""}
                {e.reference ? ` · ref ${e.reference}` : ""}
                {e.kind === "reported" ? " · awaiting confirmation" : ""}
              </p>
            </div>
            {e.amountCents ? <span className={cn("whitespace-nowrap", e.kind === "received" ? "font-medium" : "text-muted-foreground")}>{money(e.amountCents)}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
