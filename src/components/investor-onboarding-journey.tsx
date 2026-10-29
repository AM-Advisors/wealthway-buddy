import { useEffect, useRef, useState } from "react";
import { fillMissingInvestorAnswers } from "@/lib/subscription-prefill";
import { acknowledgeDocumentFn } from "@/lib/fund-setup-canonical.functions";
import { confirmAccreditationStepFn } from "@/lib/accreditation-step.functions";
import { ACCREDITATION_QUESTION_KEY, basisFromAnswer, evidenceForBasis, isAccreditationQuestion, selfCertificationAllowed } from "@/lib/accreditation-step";
import { recordEvidence } from "@/lib/accreditation.functions";
import { ProfessionalRequestPanel } from "@/components/accreditation-professional-request";
import standardQuestions from "@/lib/standard-investor-questionnaire.json";
import { InvestorBankVerify } from "@/components/investor-bank-verify";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { recordMyUpload } from "@/lib/investor-uploads.functions";
import { HIGH_RISK_REVIEW_MESSAGE, highRiskYes, questionVisible } from "@/lib/investor-onboarding-model";

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
import { investorHomeSummary, nextJourneyStep, openableStep, minutesLeft, STEP_MINUTES, type JourneyStep, type JourneyStepView } from "@/lib/investor-journey-model";
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
import { CertificationsPanel, FinancialBackgroundPanel, TaxSignPanel } from "@/components/onboard-compliance-panels";
import { buildSignTasks, taskForError, type SignTaskKey, type SignTaskState } from "@/lib/sign-step-tasks";

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
            <div className="flex items-center justify-between text-sm"><span className="font-medium">Progress</span><span className="text-muted-foreground">{h.progressPercent}%{!h.complete && minutesLeft(steps) > 0 ? ` · about ${minutesLeft(steps)} min left` : ""}</span></div>
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
                  {s.state !== "complete" && <span className="mt-1 text-xs text-muted-foreground">About {STEP_MINUTES[s.key]} min</span>}
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

export function AboutYou({ d, onboardingId, done }: { d: any; onboardingId: string; done: () => void }) {
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
  const [showNew, setShowNew] = useState(false);
  useEffect(() => {
    if (!profileId && list.length > 0) setProfileId(list[0].id);
  }, [profileId, list]);
  const owners = (d.requirements ?? []).find((r: any) => r.key === "beneficial_owners");
  const minimum = Number(d.offering?.minInvestmentCents ?? 0);

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

        {list.length > 0 && !showNew ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Your saved profile already has your verified details, so you don't need to enter them again.
            </p>
            <Button variant="link" className="h-auto p-0" onClick={() => setShowNew(true)}>
              Investing through someone or something else? Add a new profile
            </Button>
          </div>
        ) : (
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
        )}

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
            {minimum > 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">Minimum {money(minimum)}.</p>
            ) : null}
            {minimum > 0 && amount && Math.round(Number(amount.replace(/[,$]/g, "")) * 100) > 0 && Math.round(Number(amount.replace(/[,$]/g, "")) * 100) < minimum ? (
              <p className="mt-1 text-xs text-muted-foreground">Below the minimum - your fund manager needs a side letter to accept this amount.</p>
            ) : null}
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
      else if (r?.completed) { toast.success("Your earlier identity check was reused."); void qc.invalidateQueries(); }
    },
    onError: (e: any) => toast.error(String(e?.message ?? e).replace(/^Forbidden:\s*/, "")),
  });
  const status = d.verification as string;
  const verifyKeys = ["identity_verification", "entity_verification", "aml", "eligibility", "accreditation"];
  const open = ((d.requirements ?? []) as any[]).filter((r) => verifyKeys.includes(r.key) && r.state !== "valid" && r.state !== "not_applicable");
  const accreditationOnly = open.length > 0 && open.every((r) => r.key === "accreditation");
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
            {accreditationOnly ? (
              <>
                <p className="text-sm">Your identity is verified. The last part is confirming you're an accredited investor.</p>
                <Button asChild><a href={`/onboarding/accreditation?onboarding=${onboardingId}`}>Confirm accreditation</a></Button>
              </>
            ) : (
              <>
                {status === "action_required" && open.length > 0 ? (
                  <div className="space-y-2 rounded-md border p-3">
                    <p className="text-sm font-medium">Here's what's left, and how to fix it:</p>
                    <ul className="space-y-2 text-sm">
                      {open.map((r) => (
                        <li key={r.key}>
                          <span className="font-medium">{VERIFY_HELP[r.key]?.title ?? "Verification"}</span>
                          <span className="block text-muted-foreground">{VERIFY_HELP[r.key]?.fix ?? "Start verification again and follow the steps."}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted-foreground">Tips: use good light, a valid ID that isn't expired, and make sure your name matches your ID. Still stuck? Reply to your invitation email and the fund team will help.</p>
                  </div>
                ) : null}
                <Button onClick={() => start.mutate()} disabled={start.isPending}>
                  {start.isPending ? "Opening…" : "Start Verification"}
                </Button>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function QuestionUpload({ fundId, value, onUploaded }: { fundId: string | null; value: string; onUploaded: (id: string) => void }) {
  const record = useServerFn(recordMyUpload);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState<string | null>(null);
  async function pick(file: File | undefined) {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) { toast.error("Files must be 25 MB or smaller."); return; }
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Your session expired. Please sign in again.");
      const path = `${uid}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      const { error } = await supabase.storage.from("investor-uploads").upload(path, file);
      if (error) throw new Error(error.message);
      const res: any = await record({ data: { storage_path: path, file_name: file.name, doc_kind: "identification", note: "Subscription Agreement identity/formation documents", offering_id: fundId } });
      setName(file.name);
      onUploaded(res.id);
      toast.success("Document uploaded.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally { setBusy(false); }
  }
  return (
    <div className="space-y-1">
      <Input type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" disabled={busy} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
      <p className="text-xs text-muted-foreground">{busy ? "Uploading…" : name ? `Uploaded: ${name}` : value ? "A document is on file." : "Individuals: ID and proof of address. Entities: formation documents and director details."}</p>
    </div>
  );
}

function QuestionnaireForm({ d, done, locked, onSave, saving }: { d: any; onboardingId: string; done: boolean; locked: boolean; onSave: (answers: Record<string, string>, submit: boolean) => void; saving: boolean }) {
  const questions: any[] = d.questionnaire.questions ?? [];
  const saved = (d.questionnaireResponses ?? {}) as Record<string, unknown>;
  const [open, setOpen] = useState(!done);
  const [answers, setAnswers] = useState<Record<string, string>>(() => Object.fromEntries(questions.map((q) => [q.key, saved[q.key] == null ? "" : String(saved[q.key])])));
  const dirty = useRef(new Set<string>());
  const savedKey = JSON.stringify(saved);
  useEffect(() => {
    const incoming = JSON.parse(savedKey) as Record<string, unknown>;
    setAnswers((current) => Object.fromEntries(Object.entries(fillMissingInvestorAnswers(current, incoming, Object.keys(incoming), [...dirty.current])).map(([key, value]) => [key, String(value ?? "")])));
  }, [savedKey]);
  const lockedVals = (d.questionnaireLocked ?? {}) as Record<string, string | null>;
  const visible = questions.filter((q) => !isAccreditationQuestion(q.key) && questionVisible(q, answers));
  const missing = visible.filter((q) => q.required && !q.satisfiedBy && !String(answers[q.key] ?? "").trim());
  const set = (k: string, v: string) => { dirty.current.add(k); setAnswers((a) => ({ ...a, [k]: v })); };
  // Answers we already have (verified records, earlier funds, saved progress) sit in one
  // collapsed list to check; the rest are asked a few at a time. Fixed at first render so
  // questions don't jump while the investor types.
  const [prefilled] = useState(() => new Set(questions.filter((q) => q.locked || q.satisfiedBy || String(answers[q.key] ?? "").trim()).map((q) => q.key)));
  const toAsk = visible.filter((q) => !prefilled.has(q.key));
  const known = visible.filter((q) => prefilled.has(q.key));
  const PAGE = 5;
  const pages = Math.max(1, Math.ceil(toAsk.length / PAGE));
  const [page, setPage] = useState(0);
  const pg = Math.min(page, pages - 1);
  const pageQs = toAsk.slice(pg * PAGE, pg * PAGE + PAGE);
  const pageMissing = pageQs.filter((q) => q.required && !q.satisfiedBy && !String(answers[q.key] ?? "").trim());
  const [showKnown, setShowKnown] = useState(false);
  const renderQ = (q: any) => (
    <div key={q.key} className="space-y-1.5">
      <Label htmlFor={q.key} className="leading-snug">{q.label}{q.required && !q.satisfiedBy ? " *" : ""}</Label>
      {q.locked ? (
        <div id={q.key} className="rounded-md border bg-muted px-3 py-2 text-sm">
          {lockedVals[q.key] || answers[q.key] || <span className="text-muted-foreground">Fills in after Verification</span>}
        </div>
      ) : q.type === "document" ? (
        q.satisfiedBy ? <p className="text-sm text-muted-foreground">{q.satisfiedBy}</p> : (
          <QuestionUpload fundId={d.offering?.id ?? null} value={answers[q.key] ?? ""} onUploaded={(id) => set(q.key, id)} />
        )
      ) : q.type === "yes_no" ? (
        <div id={q.key} className="flex gap-2">
          {["Yes", "No"].map((o) => <Button key={o} type="button" size="sm" variant={answers[q.key] === o ? "default" : "outline"} onClick={() => set(q.key, o)}>{o}</Button>)}
        </div>
      ) : q.type === "select" ? (
        <Select value={answers[q.key] ?? ""} onValueChange={(v) => set(q.key, v)}>
          <SelectTrigger id={q.key}><SelectValue placeholder="Choose one" /></SelectTrigger>
          <SelectContent>{(q.options ?? []).map((o: string) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
        </Select>
      ) : q.type === "number" || q.type === "currency" ? (
        <Input id={q.key} inputMode="decimal" value={answers[q.key] ?? ""} onChange={(e) => set(q.key, e.target.value)} />
      ) : q.type === "date" ? (
        <Input id={q.key} type="date" value={answers[q.key] ?? ""} onChange={(e) => set(q.key, e.target.value)} />
      ) : (
        <Input id={q.key} value={answers[q.key] ?? ""} onChange={(e) => set(q.key, e.target.value)} />
      )}
    </div>
  );
  const last = pg >= pages - 1;
  return (
    <div className="space-y-4 rounded-md border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Investor questionnaire</p>
          <p className="text-xs text-muted-foreground">{done ? "Your answers are saved." : toAsk.length ? `${toAsk.length} question${toAsk.length === 1 ? "" : "s"} to answer · page ${pg + 1} of ${pages}` : "Everything is filled in. Check it and submit."}</p>
        </div>
        {done && !locked ? <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>{open ? "Close" : "Review answers"}</Button> : done ? <Badge>Complete</Badge> : null}
      </div>
      {open ? (
        <fieldset disabled={locked} className="space-y-4">
          {known.length > 0 && (
            <div className="rounded-md border bg-muted/40 p-3">
              <button type="button" className="flex w-full items-center justify-between text-left text-sm font-medium" onClick={() => setShowKnown((v) => !v)}>
                <span>We already filled in {known.length} answer{known.length === 1 ? "" : "s"}</span>
                <span className="text-xs text-muted-foreground">{showKnown ? "Hide" : "Check them"}</span>
              </button>
              {showKnown && <div className="mt-3 space-y-4">{known.map(renderQ)}</div>}
            </div>
          )}
          {pageQs.map(renderQ)}
          {highRiskYes(questions, answers).length > 0 ? (
            <div role="status" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">{HIGH_RISK_REVIEW_MESSAGE}</div>
          ) : null}
          <p className="text-xs text-muted-foreground">Don't enter your tax ID or bank account numbers here. Harmonious asks for them in separate, protected steps.</p>
          {!locked ? (
            <div className="flex flex-wrap gap-2">
              {pg > 0 && <Button variant="outline" onClick={() => setPage(pg - 1)}>Back</Button>}
              {last
                ? <Button disabled={saving || missing.length > 0} onClick={() => onSave(answers, true)}>{done ? "Save changes" : "Submit answers"}</Button>
                : <Button disabled={saving || pageMissing.length > 0} onClick={() => { onSave(answers, false); setPage(pg + 1); }}>Next</Button>}
              {last && missing.length > 0 && <p className="w-full text-xs text-muted-foreground">Still needed: {missing.length} answer{missing.length === 1 ? "" : "s"}{missing.some((q) => prefilled.has(q.key)) ? " in the filled-in list above" : ""}.</p>}
            </div>
          ) : null}
        </fieldset>
      ) : null}
    </div>
  );
}

const STANDARD_ACCREDITATION_OPTIONS: string[] =
  (standardQuestions as any).questions?.find((q: any) => q.key === ACCREDITATION_QUESTION_KEY)?.options ?? [];

function AccreditationStep({ d, onboardingId, done }: { d: any; onboardingId: string; questionnaireDone: boolean; done: () => void }) {
  const req = (d.requirements ?? []).find((r: any) => r.key === "accreditation");
  const confirmFn = useServerFn(confirmAccreditationStepFn);
  const confirm = useAction(confirmFn, "Accreditation confirmed.", done);
  const saveFn = useServerFn(saveQuestionnaireFn);
  const recordFn = useServerFn(recordEvidence);
  const savedAnswers = (d.questionnaireResponses ?? {}) as Record<string, unknown>;
  const [name, setName] = useState(String(savedAnswers["name_of_subscriber"] ?? ""));
  const [category, setCategory] = useState(String(savedAnswers[ACCREDITATION_QUESTION_KEY] ?? ""));
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  if (!req || req.state === "not_applicable") return null;
  const selfCert = selfCertificationAllowed(d.exemption);
  const accQuestion = (d.questionnaire?.questions ?? []).find((q: any) => q.key === ACCREDITATION_QUESTION_KEY);
  const options: string[] = accQuestion?.options?.length ? accQuestion.options : STANDARD_ACCREDITATION_OPTIONS;
  const basis = basisFromAnswer(category);
  const evidence = evidenceForBasis(basis);
  const primaryEvidence = evidence.find((o) => o.method !== "third_party_letter") ?? evidence[0];
  const settled = req.state === "valid" || req.state === "review_required";

  async function chooseCategory(value: string) {
    setCategory(value);
    if (!value || value === String(savedAnswers[ACCREDITATION_QUESTION_KEY] ?? "")) return;
    setBusy(true);
    try {
      await saveFn({ data: { onboardingId, answers: { ...savedAnswers, [ACCREDITATION_QUESTION_KEY]: value }, submit: false } as any });
      toast.success("Accreditation answer saved.");
      done();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save your answer");
    } finally {
      setBusy(false);
    }
  }

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
      await recordFn({ data: { storage_path: path, file_name: file.name, doc_kind: (primaryEvidence?.defaultKind ?? "other") as never, onboarding_id: onboardingId } });
      toast.success("Document uploaded. The fund manager or Harmonious will review it.");
      done();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Accreditation</h3>
        <Badge variant={req.state === "valid" ? "default" : "outline"}>
          {req.state === "valid" ? "Verified" : req.state === "review_required" ? "Under review" : "To confirm"}
        </Badge>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={ACCREDITATION_QUESTION_KEY} className="leading-snug">{accQuestion?.label ?? "Select the accreditation that applies to you"}</Label>
        <Select value={category} onValueChange={(v) => void chooseCategory(v)} disabled={busy || settled}>
          <SelectTrigger id={ACCREDITATION_QUESTION_KEY}><SelectValue placeholder="Choose one" /></SelectTrigger>
          <SelectContent>{options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {req.state === "valid" ? (
        <p className="text-sm text-muted-foreground">Your accredited investor status is verified. Nothing more is needed.</p>
      ) : req.state === "review_required" ? (
        <p className="text-sm text-muted-foreground">Your accreditation paperwork is being verified by the fund manager or Harmonious. You can keep signing in the meantime.</p>
      ) : !category ? (
        <p className="text-sm text-muted-foreground">Choose the category that applies to you and we'll show exactly what this fund needs.</p>
      ) : !selfCert ? (
        <div className="space-y-3 text-sm">
          <p>This fund is offered under Rule 506(c), so your accredited status must be verified with documents. Based on your answer, you can provide:</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {evidence.map((o) => (
              <div key={o.method} className="rounded-md border p-3">
                <p className="text-sm font-medium">{o.title}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">{o.provide.map((p) => <li key={p}>{p}</li>)}</ul>
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acc-evidence-upload">Upload your proof</Label>
            <Input id="acc-evidence-upload" type="file" accept=".pdf,.png,.jpg,.jpeg,.heic" disabled={uploading} onChange={(e) => void onFile(e)} />
            <p className="text-xs text-muted-foreground">{uploading ? "Uploading…" : "PDF or image, up to 25 MB. Uploading sends it for review; you can keep signing in the meantime."}</p>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Or ask a professional to confirm it</p>
            <p className="text-xs text-muted-foreground">We email your CPA, attorney, investment adviser or broker-dealer a secure link to upload a verification letter. They only see your name and the fund name.</p>
            <ProfessionalRequestPanel onboardingId={onboardingId} />
          </div>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <p><span className="text-muted-foreground">Your category:</span> {category}</p>
          <div className="max-w-sm">
            <Label htmlFor="acc-sign">Type your full legal name to confirm</Label>
            <Input id="acc-sign" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button size="sm" disabled={name.trim().length < 2 || confirm.isPending} onClick={() => confirm.mutate({ data: { onboardingId, signature: name.trim() } } as any)}>
            I confirm I am an accredited investor
          </Button>
        </div>
      )}
    </div>
  );
}

const TASK_BADGE: Record<SignTaskState, { label: string; variant: "default" | "outline" | "secondary" }> = {
  complete: { label: "Complete", variant: "default" },
  todo: { label: "To do", variant: "outline" },
  review: { label: "Under review", variant: "secondary" },
  locked: { label: "Locked", variant: "secondary" },
};

function Sign({ d, onboardingId, done }: { d: any; onboardingId: string; done: () => void }) {
  const questionnaireFn = useServerFn(saveQuestionnaireFn);
  const prepareFn = useServerFn(prepareSubscriptionDocumentsFn);
  const confirmFn = useServerFn(recordSubscriptionSignatureFn);
  const [signer, setSigner] = useState("");
  const [open, setOpen] = useState<SignTaskKey | null>(null);
  const [userPicked, setUserPicked] = useState(false);
  const saveQ = useAction(questionnaireFn, "Answers saved.", done);
  const prepare = useAction(prepareFn, null, done);
  const confirm = useMutation({
    mutationFn: (v: any) => (confirmFn as any)(v),
    onSuccess: () => { toast.success("Thank you. Harmonious will now review your subscription."); done(); },
    onError: (e: any) => {
      const msg = String(e?.message ?? e).replace(/^Forbidden:\s*/, "");
      toast.error(msg);
      const k = taskForError(msg, tasks);
      if (k) go(k);
    },
  });
  const ackFn = useServerFn(acknowledgeDocumentFn);
  const ack = useAction(ackFn, "Acknowledged and agreed.", done);
  const docs: any[] = d.documents ?? [];
  const fees = useFeesAccepted(onboardingId);
  const signed = (d.requirements ?? []).find((r: any) => r.key === "signature")?.state === "valid";
  const questionnaireDone = (d.requirements ?? []).find((r: any) => r.key === "subscription_questionnaire")?.state !== "missing";
  const tasks = buildSignTasks({
    requirements: d.requirements ?? [],
    hasQuestionnaire: !!(d.questionnaire && (d.questionnaire.questions ?? []).length),
    documents: docs,
    feesRequired: !!fees.q.data?.terms,
    feesAccepted: fees.ok,
    submitted: !!d.executedSnapshot,
  });
  const doneCount = tasks.filter((t) => t.state === "complete").length;
  const firstOpen = tasks.find((t) => t.state === "todo" || t.state === "review")?.key ?? null;
  const current = userPicked ? open : firstOpen;

  const go = (k: SignTaskKey) => {
    setUserPicked(true);
    setOpen(k);
    requestAnimationFrame(() => document.getElementById(`sign-task-${k}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  // After a save, move on to the next unfinished task automatically.
  const completeKey = tasks.map((t) => `${t.key}:${t.state}`).join("|");
  useEffect(() => { setUserPicked(false); }, [completeKey]);

  const body = (k: SignTaskKey) => {
    switch (k) {
      case "subscription_questionnaire":
        return <QuestionnaireForm d={d} onboardingId={onboardingId} done={questionnaireDone} locked={signed} onSave={(answers, submit) => saveQ.mutate({ data: { onboardingId, answers, submit } } as any)} saving={saveQ.isPending} />;
      case "accreditation":
        return <AccreditationStep d={d} onboardingId={onboardingId} questionnaireDone={questionnaireDone} done={done} />;
      case "bsa_aml":
        return <FinancialBackgroundPanel onboardingId={onboardingId} done={done} />;
      case "tax_documentation":
        return <TaxSignPanel onboardingId={onboardingId} done={done} locked={!questionnaireDone} subscriberName={(d.questionnaireLocked?.name_of_subscriber ?? (d.questionnaireResponses ?? {}).name_of_subscriber ?? null) as string | null} />;
      case "certifications":
        return <CertificationsPanel onboardingId={onboardingId} done={done} />;
      case "fees":
        return <FeeAcceptanceCard onboardingId={onboardingId} />;
      case "subscription_documents":
        return (
          <div className="space-y-3">
            <ol className="space-y-2">
              {docs.map((doc) => {
                const status = doc.signed ? "Signed" : doc.requiresSignature ? "To sign" : doc.requiresAcknowledgment ? (doc.acknowledged ? "Acknowledged" : "To acknowledge") : "To review";
                const complete = doc.signed || (doc.requiresAcknowledgment && doc.acknowledged);
                return (
                  <li key={doc.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                    <span>{doc.title}</span>
                    {doc.requiresAcknowledgment && !doc.acknowledged && !doc.signed ? (
                      <Button size="sm" disabled={ack.isPending} onClick={() => ack.mutate({ data: { onboardingId, documentId: doc.id } } as any)}>I acknowledge and agree</Button>
                    ) : (
                      <Badge variant={complete ? "default" : "outline"}>{status}</Badge>
                    )}
                  </li>
                );
              })}
              {docs.length === 0 ? <li className="text-sm text-muted-foreground">The fund's documents are being prepared. We'll let you know when they're ready.</li> : null}
            </ol>
            {!signed && docs.some((x) => x.requiresSignature && !x.signed) ? (
              <Button asChild onClick={() => { if (!d.documentTemplateVersion) prepare.mutate({ data: { onboardingId } } as any); }}>
                <Link to="/fund/$offeringId/documents" params={{ offeringId: d.offering.id }}>Review &amp; Sign Documents</Link>
              </Button>
            ) : null}
            <p className="text-xs text-muted-foreground">A document shows as signed only once the signing service confirms it, this can take a minute.</p>
          </div>
        );
      case "submit": {
        if (d.executedSnapshot) return (
          <div className="space-y-1 text-sm">
            <p>Signed and submitted. Copies are in your Documents.</p>
            <p className="text-muted-foreground">Next: Fund. Once the fund manager approves your subscription, wiring instructions appear in the Fund step and we email you. It takes about 1 minute.</p>
          </div>
        );
        const left = tasks.filter((t) => t.key !== "submit" && t.state !== "complete");
        if (left.length) {
          return (
            <div className="space-y-2 text-sm">
              <p>Finish these first:</p>
              <ul className="space-y-1">
                {left.map((t) => (
                  <li key={t.key}><Button variant="link" className="h-auto p-0" onClick={() => go(t.key)}>{t.label}</Button></li>
                ))}
              </ul>
            </div>
          );
        }
        return (
          <div className="space-y-3">
            <p className="text-sm">Everything is done. Confirm who signed to send your subscription to Harmonious.</p>
            <div className="max-w-sm">
              <Label htmlFor="signer">Signer's full legal name</Label>
              <Input id="signer" value={signer} onChange={(e) => setSigner(e.target.value)} />
            </div>
            <Button disabled={signer.trim().length < 2 || confirm.isPending} onClick={() => confirm.mutate({ data: { onboardingId, signerName: signer.trim() } })}>Submit subscription</Button>
          </div>
        );
      }
    }
  };

  return (
    <Card>
      <CardHeader className="sticky top-0 z-10 rounded-t-lg border-b bg-card">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Review &amp; Sign</CardTitle>
          <span className="text-sm text-muted-foreground">{doneCount} of {tasks.length} done</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${tasks.length ? (doneCount / tasks.length) * 100 : 0}%` }} />
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-4">
        {tasks.map((t, i) => {
          const isOpen = current === t.key;
          const b = TASK_BADGE[t.state];
          return (
            <section key={t.key} id={`sign-task-${t.key}`} className={cn("scroll-mt-24 rounded-md border", isOpen && "border-primary")}>
              <button
                type="button"
                className="flex min-h-14 w-full items-center justify-between gap-3 p-3 text-left"
                aria-expanded={isOpen}
                onClick={() => (isOpen ? (setUserPicked(true), setOpen(null)) : go(t.key))}
              >
                <span className="flex items-center gap-3">
                  <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium", t.state === "complete" ? "bg-primary text-primary-foreground" : "bg-muted")}>
                    {t.state === "complete" ? <Check className="h-4 w-4" /> : i + 1}
                  </span>
                  <span>
                    <span className="block text-sm font-medium">{t.label}</span>
                    {t.detail ? <span className="block text-xs text-muted-foreground">{t.detail}</span> : null}
                  </span>
                </span>
                <Badge variant={b.variant}>{b.label}</Badge>
              </button>
              {isOpen ? <div className="border-t p-3">{body(t.key)}</div> : null}
            </section>
          );
        })}
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
  const sent = useAction(sentFn, "Thanks, we'll confirm once your transfer is received and matched.", done);
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
        <p className="text-base">{step?.message}</p>
        {d.approvedToFund && d.fundingStatus !== "funded" ? (
          <>
            {!reveal ? (
              <div className="space-y-3"><p className="text-base">You can send your wire once the fund’s bank details are available below. You do not need to wait for final admission.</p><Button className="min-h-12 h-auto whitespace-normal text-base" onClick={() => setReveal(true)}>Next: View wire instructions</Button></div>
            ) : funding.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : funding.isError ? (
              <div role="alert" className="space-y-3"><p className="text-base text-destructive">We couldn’t load your wire instructions. No bank details have been shown.</p><Button variant="outline" className="min-h-11 text-base" onClick={() => void funding.refetch()}>Try again</Button></div>
            ) : f?.unlocked ? (
              <div className="space-y-2 rounded-md border p-4 text-base">
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
            {f?.unlocked && <WireSentForm
              defaultAmountCents={amount}
              pending={sent.isPending}
              already={!!d.investorReportsSent}
              onSubmit={(v) => sent.mutate({ data: { onboardingId, ...v } } as any)}
            />}
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
  onSubmit: (v: { sentOn: string | null; amountCents: number | null; sendingBank: string | null; reference: string | null; senderName: string | null }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [sentOn, setSentOn] = useState(new Date().toISOString().slice(0, 10));
  const [amt, setAmt] = useState(defaultAmountCents ? String(defaultAmountCents / 100) : "");
  const [bank, setBank] = useState("");
  const [ref, setRef] = useState("");
  const [sender, setSender] = useState("");
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
        <div className="space-y-1 sm:col-span-2"><Label htmlFor="w-sender">Name on the sending account (optional)</Label><Input id="w-sender" value={sender} onChange={(e) => setSender(e.target.value)} placeholder="If someone else, like a spouse or your company, sends the wire" /></div>
      </div>
      <p className="text-xs text-muted-foreground">Don't enter account numbers. If the wire comes from an account under a different name, entering that name helps us match it faster.</p>
      <div className="flex gap-2">
        <Button
          disabled={pending || !(cents > 0)}
          onClick={() => onSubmit({ sentOn, amountCents: cents > 0 ? cents : null, sendingBank: bank || null, reference: ref || null, senderName: sender || null })}
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
                {e.senderName ? ` · from ${e.senderName}` : ""}
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

const VERIFY_HELP: Record<string, { title: string; fix: string }> = {
  identity_verification: { title: "ID check", fix: "Tap Start Verification and retake photos of your ID and a selfie. Your ID must be unexpired and fully in frame." },
  entity_verification: { title: "Entity check", fix: "Tap Start Verification and upload your entity's formation documents and the people who own or control it." },
  aml: { title: "Compliance screening", fix: "Nothing for you to do right now. The fund team is reviewing it and will contact you if anything is needed." },
  eligibility: { title: "Eligibility", fix: "Tap Start Verification to confirm your country and investor details." },
  accreditation: { title: "Accredited investor proof", fix: "After verification, confirm accreditation and upload proof. You can keep signing while it's reviewed." },
};
