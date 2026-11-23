import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Circle, Loader2, Lock } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  chooseProfileFn,
  eligibleProfilesFn,
  onboardingDetailFn,
  onboardPortalDetailFn,
  onboardingViewerHomeFn,
  startPortalVerificationFn,
  investorReportsFundsSentFn,
} from "@/lib/investor-onboarding.functions";
import { revealWireInstructionsFn } from "@/lib/fund-onboarding.functions";
import { fundStepState, WIRE_FRAUD_WARNING } from "@/lib/fund-onboarding-model";
import type { PortalStep, PortalStepView, PortalView } from "@/lib/onboard-portal-model";
import { identityCheckState } from "@/lib/onboard-portal-model";
import { cn } from "@/lib/utils";
import { kycFieldsFor } from "@/lib/kyc-fields";
import { ConfirmYourInformation, ReviewPreparedDocuments } from "@/components/prepared-investor-review";
import { EligibilityPanel, FinancialBackgroundPanel, TaxAndCompliancePanel } from "@/components/onboard-compliance-panels";
import { OnboardingUploadsCard } from "@/components/investor-onboarding-extras";
import { AccreditationStep as PortalAccreditationStep, Sign } from "@/components/investor-onboarding-journey";
import { investorHomeSummary, minutesLeft, type JourneyStepView } from "@/lib/investor-journey-model";
import { isReconciledFunding } from "@/lib/funding-status";

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

/**
 * The investor's own page opened by someone else, usually a fund countersigner the signing
 * service sent back here. Point them to their own view instead of a dead end; never claim a
 * signature was saved, the fund's Documents page shows the recorded status.
 */
function NotAvailable({ onboardingId, error }: { onboardingId: string; error: unknown }) {
  const homeFn = useServerFn(onboardingViewerHomeFn);
  const home = useQuery({ queryKey: ["onboard-viewer-home", onboardingId], queryFn: () => homeFn({ data: { onboardingId } }), retry: false, enabled: Boolean(error) });
  if (home.isLoading) return <p className="text-base text-muted-foreground">Loading…</p>;
  const h = home.data;
  if (!h) return <OnboardMessage title="This investment isn't available" body={error ? errText(error) : "Please check your link."} />;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">This page is for the investor</CardTitle>
        <CardDescription className="text-base">
          You're signed in as {h.role === "manager" ? "the fund" : "Harmonious"}, so this investor's steps don't open for you. If you just signed as the fund, the fund's Documents page shows whether your signature was recorded.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {h.role === "manager" ? (
          <Button asChild size="lg"><Link to="/manager/fund/$fundId/documents" params={{ fundId: h.offeringId }}>Go to the fund's documents</Link></Button>
        ) : (
          <Button asChild size="lg"><Link to="/ops/fund/$fundId/investor/$onboardingId" params={{ fundId: h.offeringId, onboardingId }}>Open this investor</Link></Button>
        )}
      </CardContent>
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
    return <NotAvailable onboardingId={onboardingId} error={q.error} />;
  }
  const d: any = q.data;
  const steps: PortalStepView[] = d.steps;
  const view: PortalView = d.complete
    ? "completed"
    : chosen && chosen !== "completed" && steps.find((s) => s.key === chosen)?.state !== "locked"
      ? chosen
      : d.resume;
  // Same progress, time estimate and next action as the portal page: both read the server's journey steps.
  const journey: JourneyStepView[] = d.journey ?? [];
  const h = investorHomeSummary(journey);
  const left = minutesLeft(journey);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">Complete Your Investment</p>
        <h1 className="text-2xl font-semibold sm:text-3xl">{d.fundName}</h1>
        {money(d.amountCents) ? <p className="text-lg">{money(d.amountCents)}</p> : null}
        {d.profileLabel ? <p className="text-sm text-muted-foreground">Investing as {d.profileLabel}</p> : null}
      </header>

      <Card>
        <CardContent className="space-y-5 pt-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Progress</span>
              <span className="text-muted-foreground">{h.progressPercent}%{!h.complete && left > 0 ? ` · about ${left} min left` : ""}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${h.progressPercent}%` }} /></div>
          </div>

          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Steps">
            {steps.map((s, i) => {
              const done = s.state === "complete" || s.state === "not_applicable";
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    disabled={s.state === "locked" || d.complete}
                    onClick={() => setChosen(s.key)}
                    aria-current={view === s.key ? "step" : undefined}
                    className={cn(
                      "flex h-full w-full flex-col rounded-md border p-3 text-left text-sm transition-colors disabled:opacity-50",
                      view === s.key ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                    )}
                  >
                    <span className="flex items-center gap-2 font-medium">
                      {done ? <Check className="h-4 w-4 text-primary" /> : s.state === "locked" ? <Lock className="h-4 w-4 text-muted-foreground" /> : <span className="text-muted-foreground">{i + 1}.</span>}
                      {s.label}
                    </span>
                    <span className="mt-1 text-xs text-muted-foreground">
                      {s.state === "not_applicable" ? "Not needed" : done ? "Done" : s.state === "in_review" ? "In review" : s.state === "locked" ? "Later" : "To do"}
                    </span>
                  </button>
                </li>
              );
            })}
            <li>
              <div className={cn("flex h-full w-full flex-col rounded-md border p-3 text-left text-sm", d.complete ? "border-primary bg-primary/5" : "opacity-50")}>
                <span className="flex items-center gap-2 font-medium">
                  {isReconciledFunding(d.fundingStatus) ? <Check className="h-4 w-4 text-primary" /> : d.complete ? <span className="text-muted-foreground">{steps.length + 1}.</span> : <Lock className="h-4 w-4 text-muted-foreground" />}
                  Fund
                </span>
                <span className="mt-1 text-xs text-muted-foreground">{isReconciledFunding(d.fundingStatus) ? "Received" : d.complete ? "To do" : "Later"}</span>
              </div>
            </li>
          </ol>

          {h.complete ? null : (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              {h.caughtUp ? (
                <div><p className="font-medium">You're caught up</p><p className="text-sm text-muted-foreground">{h.waitingOn}</p></div>
              ) : (
                <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Next action</p><p className="font-medium">{h.nextAction}</p></div>
              )}
              {!d.complete && d.resume !== view ? <Button size="sm" onClick={() => setChosen(d.resume)}>Continue</Button> : null}
            </div>
          )}
        </CardContent>
      </Card>

      {!d.complete ? <section aria-label="Investor questionnaire" className="space-y-4">
        <ConfirmYourInformation onboardingId={onboardingId} onChanged={refresh} />
        {/* The Review & Sign checklist asks the financial background inside its questionnaire. */}
        {view !== "documents" ? <FinancialBackgroundPanel onboardingId={onboardingId} done={refresh} /> : null}
      </section> : null}


      {view === "verification" ? <VerificationStep d={d} onboardingId={onboardingId} done={refresh} /> : null}
      {view === "verification" ? <TaxAndCompliancePanel onboardingId={onboardingId} done={refresh} /> : null}
      {view === "accreditation" ? <AccreditationStep d={d} onboardingId={onboardingId} onChanged={refresh} /> : null}
      {view === "accreditation" ? <EligibilityPanel onboardingId={onboardingId} done={refresh} /> : null}
      {view === "documents" ? <ReviewPreparedDocuments onboardingId={onboardingId} /> : null}
      {view === "documents" ? <SharedReviewAndSign onboardingId={onboardingId} onChanged={refresh} /> : null}
      <OnboardingUploadsCard onboardingId={onboardingId} />
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
  const stepDone = ["complete", "not_applicable"].includes(String(stepState(d, "verification")));
  // The card reflects the identity check only; questions in the same step have their own panels.
  const state = identityCheckState((d.requirements ?? []) as any[]);
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
          <div className="space-y-1">
            <p className="flex items-center gap-2 text-sm font-medium"><Check className="h-4 w-4 text-primary" /> Your identity is verified.</p>
            {!stepDone ? <p className="text-sm text-muted-foreground">Finish the questions on this page to complete this step.</p> : null}
          </div>
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
  const [kyc, setKyc] = useState<Record<string, string>>({});
  const fields = kycFieldsFor(type as any, false);
  const kycMissing = fields.some((f) => f.required && !(kyc[f.key] ?? "").trim());
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
          {fields.map((f) => (
            <div key={f.key}>
              <Label htmlFor={`ob-kyc-${f.key}`}>{f.label}</Label>
              <Input
                id={`ob-kyc-${f.key}`}
                type={f.kind === "date" ? "date" : "text"}
                autoComplete="off"
                value={kyc[f.key] ?? ""}
                onChange={(e) => setKyc((k) => ({ ...k, [f.key]: e.target.value }))}
              />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">We use these details to verify this profile once. We keep only the last four digits of ID numbers.</p>
          <Button
            className="w-full sm:w-auto"
            disabled={name.trim().length < 2 || kycMissing || choose.isPending}
            onClick={() => choose.mutate({ onboardingId, create: { profileType: type, displayLabel: name.trim(), legalName: name.trim(), kyc } })}
          >
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * The portal's own inline accreditation card (category dropdown, 506(b) self-confirmation,
 * 506(c) proof upload or professional letter), read through the same authorized investment detail.
 */
function AccreditationStep({ d, onboardingId, onChanged }: { d: any; onboardingId: string; onChanged: () => void }) {
  const qc = useQueryClient();
  const fullFn = useServerFn(onboardingDetailFn);
  const state = stepState(d, "accreditation");
  const full = useQuery({
    queryKey: ["onboarding", onboardingId],
    queryFn: () => fullFn({ data: { onboardingId } }),
    enabled: state !== "not_applicable",
    refetchInterval: 15_000,
  });
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["onboarding", onboardingId] });
    onChanged();
  };
  if (state === "not_applicable") {
    return <OnboardMessage title="Accreditation" body="Nothing further is needed here." />;
  }
  if (full.isLoading) return <p className="text-sm text-muted-foreground">Loading accreditation…</p>;
  if (full.error || !full.data) return <OnboardMessage title="Accreditation" body={full.error ? errText(full.error) : "Please refresh the page."} />;
  const req = ((full.data as any).requirements ?? []).find((r: any) => r.key === "accreditation");
  if (!req || req.state === "not_applicable") {
    return <OnboardMessage title="Accreditation" body="Nothing further is needed here." />;
  }
  return (
    <Card>
      <CardContent className="pt-6">
        <PortalAccreditationStep d={full.data} onboardingId={onboardingId} questionnaireDone done={done} />
      </CardContent>
    </Card>
  );
}

/**
 * The portal's own Review & Sign checklist (same tasks, "X of Y done" bar and signing buttons),
 * read through the same authorized investment detail the portal page uses.
 */
function SharedReviewAndSign({ onboardingId, onChanged }: { onboardingId: string; onChanged: () => void }) {
  const qc = useQueryClient();
  const fullFn = useServerFn(onboardingDetailFn);
  const full = useQuery({
    queryKey: ["onboarding", onboardingId],
    queryFn: () => fullFn({ data: { onboardingId } }),
    // Signing confirmations arrive from the signing service; keep the checklist current.
    refetchInterval: 15_000,
  });
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["onboarding", onboardingId] });
    onChanged();
  };
  if (full.isLoading) return <p className="text-sm text-muted-foreground">Loading your documents…</p>;
  if (full.error || !full.data) return <OnboardMessage title="Review & Sign" body={full.error ? errText(full.error) : "Please refresh the page."} />;
  return <Sign d={full.data} onboardingId={onboardingId} done={done} />;
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
            {isReconciledFunding(d.fundingStatus) ? <Check className="h-4 w-4 text-primary" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
            {isReconciledFunding(d.fundingStatus) ? "Funding received" : "Funding not yet received"}
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
              ["Beneficiary address", wire.instructions?.details?.beneficiary_address],
              ["Routing / ABA", wire.instructions?.details?.routing_number],
              ["Account number", wire.instructions?.details?.account_number],
              ["Account name", wire.instructions?.details?.account_name],
              ["SWIFT", wire.instructions?.details?.swift],
              ["International bank", wire.instructions?.details?.intl_bank_name],
              ["Beneficiary", wire.instructions?.details?.intl_account_name],
              ["International account", wire.instructions?.details?.intl_account_number],
              ["Intermediary bank", wire.instructions?.details?.intermediary_bank],
              ["Intermediary SWIFT", wire.instructions?.details?.intermediary_swift],
              ["Intermediary routing", wire.instructions?.details?.intermediary_routing],
              ["Intermediary account", wire.instructions?.details?.intermediary_account],
              ["International memo", wire.instructions?.details?.intl_memo],
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
