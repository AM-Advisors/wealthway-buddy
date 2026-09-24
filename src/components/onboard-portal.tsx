import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Circle, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";

import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { startBoxSigning } from "@/lib/box-sign.functions";
import {
  chooseProfileFn,
  eligibleProfilesFn,
  onboardPortalDetailFn,
  prepareSubscriptionDocumentsFn,
  recordSubscriptionSignatureFn,
  saveQuestionnaireFn,
  startPortalVerificationFn,
  investorReportsFundsSentFn,
} from "@/lib/investor-onboarding.functions";
import { revealWireInstructionsFn } from "@/lib/fund-onboarding.functions";
import { fundStepState, WIRE_FRAUD_WARNING } from "@/lib/fund-onboarding-model";
import type { PortalStep, PortalStepView, PortalView } from "@/lib/onboard-portal-model";
import { cn } from "@/lib/utils";
import { ConfirmYourInformation, ReviewPreparedDocuments } from "@/components/prepared-investor-review";
import { CertificationsPanel, EligibilityPanel, TaxAndCompliancePanel, TaxSignPanel } from "@/components/onboard-compliance-panels";

const money = (cents: number | null | undefined) =>
  cents == null ? null : `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const errText = (e: unknown) => String((e as any)?.message ?? e).replace(/^Forbidden:\s*/, "");

const PROFILE_TYPES = [
  ["individual", "Myself (individual)"],
  ["joint", "Jointly"],
  ["llc", "LLC / company"],
  ["corporation", "Corporation"],
  ["partnership", "Partnership"],
  ["trust", "Trust"],
  ["ira", "IRA / retirement account"],
  ["other_entity", "Other entity"],
] as const;

/** Minimal chrome: logo and sign-out only. No workspace navigation of any kind. */
export function OnboardShell({ children }: { children: ReactNode }) {
  async function signOut() {
    await supabase.auth.signOut();
    window.location.assign("/auth");
  }
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <Logo />
          <Button variant="ghost" size="sm" onClick={signOut}>Sign out</Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}

export function OnboardMessage({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{body}</CardDescription>
      </CardHeader>
    </Card>
  );
}

export function OnboardPortal({ onboardingId }: { onboardingId: string }) {
  const qc = useQueryClient();
  const detailFn = useServerFn(onboardPortalDetailFn);
  const q = useQuery({
    queryKey: ["onboard-portal", onboardingId],
    queryFn: () => detailFn({ data: { onboardingId } }),
    // Provider confirmations arrive by webhook; keep the page honest without a refresh.
    refetchInterval: 15_000,
    retry: false,
  });
  const [chosen, setChosen] = useState<PortalView | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["onboard-portal", onboardingId] });

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading your investment…</p>;
  if (q.error || !q.data) {
    return <OnboardMessage title="This investment isn't available" body={q.error ? errText(q.error) : "Please check your link."} />;
  }
  const d: any = q.data;
  const steps: PortalStepView[] = d.steps;
  const view: PortalView = d.complete
    ? "completed"
    : chosen && chosen !== "completed" && steps.find((s) => s.key === chosen)?.state !== "locked"
      ? chosen
      : d.resume;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">Complete Your Investment</p>
        <h1 className="text-2xl font-semibold sm:text-3xl">{d.fundName}</h1>
        {money(d.amountCents) ? <p className="text-lg">{money(d.amountCents)}</p> : null}
        {d.profileLabel ? <p className="text-sm text-muted-foreground">Investing as {d.profileLabel}</p> : null}
      </header>

      <ConfirmYourInformation onboardingId={onboardingId} onChanged={refresh} />

      <ol className="flex items-stretch gap-2" aria-label="Progress">
        {steps.map((s, i) => {
          const done = s.state === "complete" || s.state === "not_applicable";
          return (
            <li key={s.key} className="flex-1">
              <button
                type="button"
                disabled={s.state === "locked" || d.complete}
                onClick={() => setChosen(s.key)}
                aria-current={view === s.key ? "step" : undefined}
                className={cn(
                  "flex w-full flex-col items-center gap-1 rounded-md border p-2 text-center text-xs sm:text-sm",
                  view === s.key ? "border-primary bg-primary/5" : "",
                  s.state === "locked" ? "opacity-50" : "",
                )}
              >
                {done ? <Check className="h-4 w-4 text-primary" /> : s.state === "locked" ? <Lock className="h-4 w-4" /> : <span className="text-muted-foreground">{i + 1}</span>}
                <span className="font-medium">{s.label}</span>
                <span className="text-muted-foreground">
                  {s.state === "not_applicable" ? "Not needed" : done ? "Done" : s.state === "in_review" ? "In review" : s.state === "locked" ? "Later" : "To do"}
                </span>
              </button>
            </li>
          );
        })}
        <li className="flex-1">
          <div className={cn("flex w-full flex-col items-center gap-1 rounded-md border p-2 text-center text-xs sm:text-sm", d.complete ? "border-primary bg-primary/5" : "opacity-50")}>
            {d.fundingStatus === "funded" ? <Check className="h-4 w-4 text-primary" /> : d.complete ? <span className="text-muted-foreground">4</span> : <Lock className="h-4 w-4" />}
            <span className="font-medium">Fund</span>
            <span className="text-muted-foreground">{d.fundingStatus === "funded" ? "Received" : d.complete ? "To do" : "Later"}</span>
          </div>
        </li>
      </ol>

      {view === "verification" ? <VerificationStep d={d} onboardingId={onboardingId} done={refresh} /> : null}
      {view === "verification" ? <TaxAndCompliancePanel onboardingId={onboardingId} done={refresh} /> : null}
      {view === "accreditation" ? <AccreditationStep d={d} onboardingId={onboardingId} /> : null}
      {view === "accreditation" ? <EligibilityPanel onboardingId={onboardingId} done={refresh} /> : null}
      {view === "documents" ? <TaxSignPanel onboardingId={onboardingId} done={refresh} /> : null}
      {view === "documents" ? <CertificationsPanel onboardingId={onboardingId} done={refresh} /> : null}
      {view === "documents" ? <ReviewPreparedDocuments onboardingId={onboardingId} /> : null}
      {view === "documents" ? <DocumentsStep d={d} onboardingId={onboardingId} done={refresh} /> : null}
      {view === "completed" ? <FundStep d={d} onboardingId={onboardingId} done={refresh} /> : null}
      {view === "completed" ? <Completed d={d} /> : null}
    </div>
  );
}

function stepState(d: any, key: PortalStep) {
  return (d.steps as PortalStepView[]).find((s) => s.key === key)?.state;
}

function VerificationStep({ d, onboardingId, done }: { d: any; onboardingId: string; done: () => void }) {
  const startFn = useServerFn(startPortalVerificationFn);
  const start = useMutation({
    mutationFn: () => startFn({ data: { onboardingId } }),
    onSuccess: (r: any) => { if (r?.url) window.location.assign(r.url); },
    onError: (e) => toast.error(errText(e)),
  });
  const state = stepState(d, "verification");
  const owners = (d.requirements as any[]).find((r) => r.key === "beneficial_owners");
  const needsOwners = owners && (owners.state === "missing" || owners.state === "refresh_required");

  if (!d.hasProfile) return <ProfileChooser onboardingId={onboardingId} done={done} />;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Verify Your Identity</CardTitle>
        <CardDescription>We need to verify your identity before your investment can be completed.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {state === "complete" || state === "not_applicable" ? (
          <p className="text-sm">Verification complete.</p>
        ) : state === "in_review" ? (
          <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Your verification is being confirmed. This page updates automatically.</p>
        ) : (
          <>
            {needsOwners ? (
              <p className="rounded-md bg-muted p-3 text-sm">
                Because you are investing through an entity, we also need the people who own, control or sign for it. Harmonious will guide you through this after you verify.
              </p>
            ) : null}
            <Button className="w-full sm:w-auto" onClick={() => start.mutate()} disabled={start.isPending}>
              {start.isPending ? "Opening…" : "Start Verification"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ProfileChooser({ onboardingId, done }: { onboardingId: string; done: () => void }) {
  const profilesFn = useServerFn(eligibleProfilesFn);
  const chooseFn = useServerFn(chooseProfileFn);
  const profiles = useQuery({ queryKey: ["onboard-profiles"], queryFn: () => profilesFn({}) });
  const list: any[] = (profiles.data as any)?.profiles ?? [];
  const [profileId, setProfileId] = useState("");
  const [type, setType] = useState("individual");
  const [name, setName] = useState("");
  const choose = useMutation({
    mutationFn: (v: any) => chooseFn({ data: v }),
    onSuccess: done,
    onError: (e) => toast.error(errText(e)),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Who is investing?</CardTitle>
        <CardDescription>Choose who this investment is made through. Each person, company, trust or retirement account is kept separate.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {list.length ? (
          <div className="space-y-2">
            <Label>Use an existing profile</Label>
            <Select value={profileId} onValueChange={setProfileId}>
              <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>{list.map((p) => <SelectItem key={p.id} value={p.id}>{p.display_label ?? p.legal_name}</SelectItem>)}</SelectContent>
            </Select>
            <Button className="w-full sm:w-auto" disabled={!profileId || choose.isPending} onClick={() => choose.mutate({ onboardingId, profileId })}>Continue</Button>
          </div>
        ) : null}
        <div className="space-y-3 rounded-md border p-4">
          <p className="text-sm font-medium">{list.length ? "Or add a new one" : "Tell us who is investing"}</p>
          <div>
            <Label>Investing as</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PROFILE_TYPES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="ob-name">{type === "individual" || type === "joint" ? "Full legal name" : "Legal name of the entity"}</Label>
            <Input id="ob-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button
            className="w-full sm:w-auto"
            disabled={name.trim().length < 2 || choose.isPending}
            onClick={() => choose.mutate({ onboardingId, create: { profileType: type, displayLabel: name.trim(), legalName: name.trim() } })}
          >
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AccreditationStep({ d, onboardingId }: { d: any; onboardingId: string }) {
  const state = stepState(d, "accreditation");
  if (state === "complete" || state === "not_applicable") {
    return <OnboardMessage title="Accreditation" body="Nothing further is needed here." />;
  }
  if (state === "in_review") {
    return <OnboardMessage title="Accreditation in review" body="Harmonious is reviewing your accreditation. This page updates automatically." />;
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{d.accreditationVerified ? "Accreditation Verification Required" : "Accreditation"}</CardTitle>
        <CardDescription>
          {d.accreditationVerified
            ? "This offering requires independent verification that you are an accredited investor. A self-certification alone can't satisfy it."
            : "Please confirm your accredited investor status for this offering."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild className="w-full sm:w-auto">
          <a href={`/onboarding/accreditation?return=${encodeURIComponent(`/onboard/i/${onboardingId}`)}`}>
            {d.accreditationVerified ? "Start Accreditation Verification" : "Continue"}
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}

function DocumentsStep({ d, onboardingId, done }: { d: any; onboardingId: string; done: () => void }) {
  const qFn = useServerFn(saveQuestionnaireFn);
  const prepareFn = useServerFn(prepareSubscriptionDocumentsFn);
  const signFn = useServerFn(startBoxSigning);
  const confirmFn = useServerFn(recordSubscriptionSignatureFn);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [signer, setSigner] = useState("");
  const saveQ = useMutation({ mutationFn: () => qFn({ data: { onboardingId, answers, submit: true } }), onSuccess: done, onError: (e) => toast.error(errText(e)) });
  const sign = useMutation({
    mutationFn: async (docId: string) => {
      await prepareFn({ data: { onboardingId } }).catch(() => null);
      return signFn({ data: { offering_document_id: docId, onboarding_id: onboardingId } });
    },
    onSuccess: (r: any) => { if (r?.url) window.location.assign(r.url); },
    onError: (e) => toast.error(errText(e)),
  });
  const confirm = useMutation({ mutationFn: () => confirmFn({ data: { onboardingId, signerName: signer.trim() } }), onSuccess: done, onError: (e) => toast.error(errText(e)) });
  const reqs: any[] = d.requirements;
  const qNeeded = d.questionnaire && reqs.find((r) => r.key === "subscription_questionnaire")?.state === "missing";
  const signatureValid = reqs.find((r) => r.key === "signature")?.state === "valid";
  const docs: any[] = d.documents;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review &amp; Sign</CardTitle>
        <CardDescription>Only the documents required for this investment are shown.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {qNeeded ? (
          <div className="space-y-3 rounded-md border p-4">
            <p className="text-sm font-medium">Investor questionnaire</p>
            {(d.questionnaire.questions ?? []).map((qq: any) => (
              <div key={qq.key}>
                <Label htmlFor={qq.key}>{qq.label}</Label>
                <Textarea id={qq.key} value={answers[qq.key] ?? String(d.questionnaireResponses?.[qq.key] ?? "")} onChange={(e) => setAnswers({ ...answers, [qq.key]: e.target.value })} />
              </div>
            ))}
            <Button className="w-full sm:w-auto" disabled={saveQ.isPending} onClick={() => saveQ.mutate()}>Save answers</Button>
          </div>
        ) : null}
        <ul className="space-y-2">
          {docs.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
              <span className="flex items-center gap-2">
                {doc.signed ? <Check className="h-4 w-4 text-primary" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                {doc.title}
              </span>
              {!doc.signed && doc.requiresSignature && !qNeeded && (d.signing ?? []).find((x: any) => x.documentId === doc.id)?.stage !== "awaiting_fund_manager" ? (
                <Button size="sm" disabled={sign.isPending} onClick={() => sign.mutate(doc.id)}>Review &amp; Sign Documents</Button>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {(d.signing ?? []).find((x: any) => x.documentId === doc.id)?.stage === "awaiting_fund_manager"
                    ? "Waiting for Fund Manager signature"
                    : doc.signed ? "Fully executed" : doc.requiresSignature ? "To sign" : "For review"}
                </span>
              )}
            </li>
          ))}
          {docs.length === 0 ? <li className="text-sm text-muted-foreground">Your documents are being prepared. We'll email you when they're ready.</li> : null}
        </ul>
        {signatureValid && !d.executed ? (
          <div className="space-y-3 rounded-md border p-4">
            <p className="text-sm">All documents are signed. Confirm the signer's name to finish.</p>
            <Label htmlFor="ob-signer">Signer's full legal name</Label>
            <Input id="ob-signer" value={signer} onChange={(e) => setSigner(e.target.value)} />
            <Button className="w-full sm:w-auto" disabled={signer.trim().length < 2 || confirm.isPending} onClick={() => confirm.mutate()}>Finish</Button>
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">A document shows as signed only after the signing service confirms it. This can take a minute.</p>
      </CardContent>
    </Card>
  );
}

function Completed({ d }: { d: any }) {
  const acc = stepState(d, "accreditation");
  return (
    <Card>
      <CardHeader>
        <CardTitle>You're all set.</CardTitle>
        <CardDescription>Your onboarding requirements for {d.fundName} have been completed.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <ul className="space-y-1">
          <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Verification complete</li>
          <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> {acc === "not_applicable" ? "Accreditation not required" : "Accreditation complete"}</li>
          <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Documents fully executed</li>
          <li className="flex items-center gap-2">
            {d.fundingStatus === "funded" ? <Check className="h-4 w-4 text-primary" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
            {d.fundingStatus === "funded" ? "Funding received" : "Funding not yet received"}
          </li>
        </ul>
        <p className="text-muted-foreground">
          Harmonious will review your information and the fund manager will be able to see that your onboarding is complete.
        </p>
      </CardContent>
    </Card>
  );
}

function FundStep({ d, onboardingId, done }: { d: any; onboardingId: string; done: () => void }) {
  const revealFn = useServerFn(revealWireInstructionsFn);
  const sentFn = useServerFn(investorReportsFundsSentFn);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [wire, setWire] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const state = fundStepState({ onboardingComplete: d.complete, fundingUnlocked: d.fundingUnlocked, fundingStatus: d.fundingStatus, investorReportsSent: d.investorReportsSent });

  const reveal = async () => {
    const r: any = await revealFn({ data: { onboardingId } });
    if (r.status === "revealed") setWire(r);
    else if (r.status === "not_ready") toast.error(r.reasons?.[0] ?? "Wire instructions aren't available yet.");
    else toast.error("Please confirm it's you first.");
  };
  const confirmPassword = async () => {
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.auth.signInWithPassword({ email: u.user?.email ?? "", password });
      if (error) throw error;
      setPassword("");
      await reveal();
    } catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  };
  const sendCode = async () => {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.auth.signInWithOtp({ email: u.user?.email ?? "", options: { shouldCreateUser: false } });
    if (error) toast.error(errText(error)); else { setCodeSent(true); toast.success("We emailed you a code."); }
  };
  const confirmCode = async () => {
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.auth.verifyOtp({ email: u.user?.email ?? "", token: code.trim(), type: "email" });
      if (error) throw error;
      await reveal();
    } catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  };
  const copy = (v: string) => void navigator.clipboard.writeText(v).then(() => toast.success("Copied"));
  const sent = useMutation({ mutationFn: () => sentFn({ data: { onboardingId } }), onSuccess: done, onError: (e) => toast.error(errText(e)) });

  if (state === "funded") return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fund Your Investment</CardTitle>
        <CardDescription>
          {d.fundName}{money(d.amountCents) ? ` · ${money(d.amountCents)}` : ""}{d.profileLabel ? ` · Investing as ${d.profileLabel}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {state === "not_ready" ? (
          <p className="text-muted-foreground">Harmonious is reviewing your information. Wire instructions will appear here once your investment is approved to fund.</p>
        ) : null}
        {state !== "not_ready" ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
            <p className="font-medium">Protect against wire fraud</p>
            <p className="text-muted-foreground">{WIRE_FRAUD_WARNING}</p>
          </div>
        ) : null}
        {state !== "not_ready" && !wire ? (
          <div className="space-y-3 rounded-md border p-4">
            <p>To view wire instructions, confirm it's you.</p>
            <Label htmlFor="ob-pw">Password</Label>
            <Input id="ob-pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button className="w-full sm:w-auto" disabled={!password || busy} onClick={confirmPassword}>View Wire Instructions</Button>
            <div className="pt-2">
              {!codeSent ? (
                <button type="button" className="text-xs underline" onClick={sendCode}>No password? Email me a code instead</button>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="ob-code">Code from your email</Label>
                  <Input id="ob-code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} />
                  <Button size="sm" disabled={code.trim().length < 6 || busy} onClick={confirmCode}>Confirm code</Button>
                </div>
              )}
            </div>
          </div>
        ) : null}
        {wire ? (
          <div className="space-y-2 rounded-md border p-4">
            <p className="text-xs text-muted-foreground">For: {wire.investingAs ?? "You"} · Investment: {d.fundName}</p>
            {([
              ["Bank name", wire.instructions?.bankName ?? wire.instructions?.details?.bank_name],
              ["Bank address", wire.instructions?.details?.bank_address],
              ["Routing / ABA", wire.instructions?.details?.routing_number],
              ["Account number", wire.instructions?.details?.account_number],
              ["Account name", wire.instructions?.details?.account_name],
              ["SWIFT", wire.instructions?.details?.swift],
              ["Reference / memo", wire.instructions?.reference],
              ["Amount", money(wire.instructions?.expectedAmountCents)],
            ] as [string, string | null | undefined][]).filter(([, v]) => v).map(([label, v]) => (
              <div key={label} className="flex items-start justify-between gap-2 border-b py-2 last:border-0">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="break-all font-medium">{v}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => copy(String(v))}>Copy</Button>
              </div>
            ))}
          </div>
        ) : null}
        {wire && state === "available" ? (
          <Button className="w-full sm:w-auto" disabled={sent.isPending} onClick={() => sent.mutate()}>I've Sent My Wire</Button>
        ) : null}
        {state === "investor_sent" ? <p className="text-muted-foreground">Waiting for funds to be received and reconciled.</p> : null}
      </CardContent>
    </Card>
  );
}
