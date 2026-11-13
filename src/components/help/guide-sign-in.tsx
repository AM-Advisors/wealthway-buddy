import { Link } from "@tanstack/react-router";
import { Download, Mail } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  SIGN_IN_GUIDES,
  SIGN_IN_GUIDE_DOWNLOADS,
  SUPPORT_EMAIL,
  type GuideMock,
  type GuideStep,
  type SignInAudience,
} from "@/lib/sign-in-guide-content";

const field = "rounded-md border border-border bg-background px-3 py-2 text-muted-foreground";
const primary = "block w-full rounded-md bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground";
const outline = "block w-full rounded-md border border-border bg-background px-4 py-2 text-center text-sm font-medium text-foreground";

function Screen({ children }: { children: ReactNode }) {
  return (
    <figure className="space-y-2">
      <div aria-hidden className="rounded-lg border border-border bg-muted/40 p-4 md:p-6">
        <div className="mx-auto max-w-sm space-y-3 rounded-lg border border-border bg-background p-5 text-sm text-foreground shadow-sm">{children}</div>
      </div>
      <figcaption className="text-center text-xs text-muted-foreground">Example of what you'll see</figcaption>
    </figure>
  );
}

function SignInForm({ title, button }: { title: string; button: string }) {
  return (
    <Screen>
      <p className="font-heading text-lg font-semibold">{title}</p>
      <span className={outline}>Continue with Google</span>
      <p className="text-center text-xs text-muted-foreground">or use your email</p>
      <div className={field}>you@example.com</div>
      <div className="flex justify-between text-xs text-muted-foreground"><span>Password</span><span>Forgot your password?</span></div>
      <div className={field}>••••••••</div>
      <span className={primary}>{button}</span>
    </Screen>
  );
}

function MockScreen({ mock }: { mock: GuideMock }) {
  switch (mock) {
    case "client-invite-email":
    case "investor-invite-email":
      return (
        <Screen>
          <p className="text-xs text-muted-foreground">From: Harmonious</p>
          <p className="font-heading font-semibold">{mock === "client-invite-email" ? "You're invited to your Harmonious portal" : "You're invited to invest"}</p>
          <p className="text-muted-foreground">{mock === "client-invite-email" ? "Choose your password to open your portal." : "Open your investment to get started."}</p>
          <span className={primary}>{mock === "client-invite-email" ? "Set your password" : "Begin onboarding"}</span>
        </Screen>
      );
    case "invite-page":
      return (
        <Screen>
          <p className="font-heading text-lg font-semibold">Welcome</p>
          <p className="text-muted-foreground">You've been invited to Harmonious. Choose your password and we'll take you straight to your next step.</p>
          <span className={primary}>Set up my account</span>
          <p className="text-center text-xs text-muted-foreground">This personal link works once and expires 7 days after it was sent.</p>
        </Screen>
      );
    case "create-account":
      return (
        <Screen>
          <p className="font-heading text-lg font-semibold">Create your account</p>
          <p className="text-xs text-muted-foreground">Use the email address your fund invitation was sent to.</p>
          <div className={field}>you@example.com</div>
          <div className={field}>Choose a password</div>
          <span className={primary}>Create account</span>
        </Screen>
      );
    case "confirm-email":
      return (
        <Screen>
          <p className="font-heading font-semibold">Confirm your email</p>
          <p className="text-muted-foreground">Please confirm your email address to finish setting up your account.</p>
          <span className={primary}>Confirm email</span>
        </Screen>
      );
    case "protect":
      return (
        <Screen>
          <p className="font-heading text-lg font-semibold">Protect your account</p>
          <p className="text-xs text-muted-foreground">Harmonious requires a second step at every sign-in.</p>
          <span className={outline}>Use an authenticator app</span>
          <div className="mx-auto grid h-20 w-20 grid-cols-4 gap-1 rounded border border-border p-1.5">
            {Array.from({ length: 16 }, (_, i) => <span key={i} className={[0, 2, 5, 6, 9, 11, 12, 15].includes(i) ? "bg-foreground" : "bg-transparent"} />)}
          </div>
          <div className={field}>6-digit code</div>
          <span className={primary}>Confirm</span>
        </Screen>
      );
    case "recovery-codes":
      return (
        <Screen>
          <p className="font-heading font-semibold">Save your recovery codes</p>
          <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-3 font-mono text-xs text-muted-foreground">
            {["xxxx-xxxx", "xxxx-xxxx", "xxxx-xxxx", "xxxx-xxxx"].map((c, i) => <span key={i}>{c}</span>)}
          </div>
          <span className={primary}>I've saved them</span>
        </Screen>
      );
    case "platform-documents":
      return (
        <Screen>
          <p className="font-heading font-semibold">Before you continue</p>
          {["Privacy Policy", "Terms of Service", "Fee schedule"].map((d) => <div key={d} className={field}>{d}</div>)}
          <p className="text-xs text-muted-foreground">☑ I have read and accept the documents above</p>
          <span className={primary}>I agree</span>
        </Screen>
      );
    case "journey":
      return (
        <Screen>
          <p className="font-heading font-semibold">Your investment</p>
          <ol className="space-y-1.5">
            {["About You", "Verification", "Sign", "Fund"].map((s, i) => (
              <li key={s} className="flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{i + 1}</span>{s}</li>
            ))}
          </ol>
          <span className={primary}>Continue</span>
        </Screen>
      );
    case "client-sign-in":
      return <SignInForm title="Client sign in" button="Sign in to my portal" />;
    case "investor-sign-in":
      return <SignInForm title="Investor sign in" button="Sign in to my investments" />;
    case "confirm-its-you":
      return (
        <Screen>
          <p className="font-heading text-lg font-semibold">Confirm it's you</p>
          <p className="text-xs text-muted-foreground">Complete your second sign-in step to continue.</p>
          <div className={field}>6-digit code from your app</div>
          <span className={primary}>Verify code</span>
          <p className="text-center text-xs text-muted-foreground">Lost access? Use a recovery code</p>
        </Screen>
      );
  }
}

function Step({ n, step }: { n: number; step: GuideStep }) {
  return (
    <section className="grid gap-5 border-t border-border pt-8 md:grid-cols-[1fr_minmax(0,20rem)]">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-base font-semibold text-primary-foreground">{n}</span>
          <h3 className="text-xl font-semibold text-foreground">{step.title}</h3>
        </div>
        {step.paragraphs.map((p, i) => <p key={i} className="text-base leading-relaxed text-muted-foreground">{p}</p>)}
        <p className="flex flex-wrap gap-2 pt-1">
          {step.labels.map((l) => <span key={l} className="rounded-md border border-border bg-muted px-2 py-1 text-xs font-medium text-foreground">{l}</span>)}
        </p>
      </div>
      {step.mock ? <MockScreen mock={step.mock} /> : null}
    </section>
  );
}

/** Sign-in guide for clients or investors. Used by the public guide page and the help center. */
export function SignInGuide({ audience, showSwitch = false }: { audience: SignInAudience; showSwitch?: boolean }) {
  const g = SIGN_IN_GUIDES[audience];
  const pdf = SIGN_IN_GUIDE_DOWNLOADS[audience];
  return (
    <main className="bg-background">
      <div className="mx-auto max-w-4xl space-y-10 px-5 py-12">
        <header className="space-y-4">
          {showSwitch ? (
            <nav aria-label="Choose your guide" className="inline-flex rounded-lg border border-border p-1">
              {(["client", "investor"] as const).map((a) => (
                <Link key={a} to="/guides/sign-in" search={{ for: a }} className={`rounded-md px-4 py-2 text-sm font-medium ${a === audience ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  {a === "client" ? "I'm a client" : "I'm an investor"}
                </Link>
              ))}
            </nav>
          ) : null}
          <p className="text-xs font-semibold uppercase tracking-wider text-accent-foreground">{g.eyebrow}</p>
          <h1 className="text-3xl font-bold text-foreground md:text-4xl">{g.title}</h1>
          <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">{g.intro}</p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg"><Link to={audience === "client" ? "/client-login" : "/investor-login"}>Go to {audience === "client" ? "client" : "investor"} sign in</Link></Button>
            <Button asChild size="lg" variant="outline"><a href={pdf.href} download={pdf.filename}><Download className="mr-2 h-4 w-4" />Download printable guide</a></Button>
          </div>
        </header>

        <div className="space-y-8">
          <h2 className="text-2xl font-semibold text-foreground">Your first time</h2>
          {g.firstTime.map((s, i) => <Step key={s.title} n={i + 1} step={s} />)}
        </div>

        <div className="space-y-8">
          <h2 className="text-2xl font-semibold text-foreground">Signing in next time</h2>
          <p className="text-base text-muted-foreground">Your sign-in page: <strong className="text-foreground">{g.signInAddress}</strong></p>
          {g.nextTime.map((s, i) => <Step key={s.title} n={i + 1} step={s} />)}
        </div>

        <div className="space-y-4 border-t border-border pt-8">
          <h2 className="text-2xl font-semibold text-foreground">If something goes wrong</h2>
          <div className="divide-y divide-border rounded-lg border border-border">
            {g.questions.map((q) => (
              <details key={q.q} className="group p-4">
                <summary className="cursor-pointer text-base font-medium text-foreground">{q.q}</summary>
                <div className="mt-3 space-y-2">{q.a.map((a, i) => <p key={i} className="text-base leading-relaxed text-muted-foreground">{a}</p>)}</div>
              </details>
            ))}
          </div>
        </div>

        <aside className="flex gap-4 rounded-lg border border-border bg-muted/40 p-5">
          <Mail className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden />
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">Still stuck?</h2>
            {g.help.map((h, i) => <p key={i} className="text-base text-muted-foreground">{h}</p>)}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="inline-block pt-1 text-base font-medium text-primary underline">{SUPPORT_EMAIL}</a>
          </div>
        </aside>
      </div>
    </main>
  );
}
