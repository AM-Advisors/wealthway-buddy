import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";


function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 border-t border-border pt-10">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
          {n}
        </span>
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      </div>
      <div className="space-y-4 text-[15px] leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

/** Illustration built from the same look as the real screen (sample values). */
function Mock({ children, caption }: { children: ReactNode; caption: string }) {
  return (
    <figure className="space-y-2">
      <div className="rounded-lg border border-border bg-muted/40 p-4 shadow-sm md:p-8">
        <div className="mx-auto max-w-xl space-y-4 rounded-lg border border-border bg-background p-5 text-sm text-foreground">
          {children}
        </div>
      </div>
      <figcaption className="text-xs text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}

const field = "rounded-md border border-border bg-background px-3 py-2 text-muted-foreground";
const btn = "inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground";

export function SignOperatingAgreementGuide() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl space-y-10 px-5 py-12">
        <header className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent-foreground">Fund manager guide</p>
          <h1 className="text-3xl font-bold text-foreground">Sign your Operating Agreement</h1>
          <p className="text-muted-foreground">
            When your fund's Operating Agreement is ready, Harmonious emails you a personal signing link. The whole
            thing takes about 5 minutes — here's exactly what to expect.
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Open the signing email</li>
            <li>Sign in to Harmonious</li>
            <li>Read the agreement</li>
            <li>Sign electronically</li>
            <li>You're done</li>
          </ol>
        </header>

        <Step n={1} title="Open the signing email">
          <p>
            You'll receive an email from Harmonious titled{" "}
            <strong className="text-foreground">“Please sign: Operating Agreement”</strong>. It names your fund and
            shows you're signing as the fund manager. Click the button in the email — the link is personal to you and
            only works with the email address it was sent to.
          </p>
          <Mock caption="Illustration of the signing email (sample values).">
            <p className="text-lg font-semibold">Please sign: Operating Agreement</p>
            <p className="text-sm text-muted-foreground">
              Your Fund LLC has a document ready for your signature. Sign in to Harmonious with this email address to
              review and sign it.
            </p>
            <dl className="grid gap-1 text-xs">
              <div><dt className="text-muted-foreground">Document</dt><dd>Operating Agreement</dd></div>
              <div><dt className="text-muted-foreground">Signing as</dt><dd>Fund manager</dd></div>
            </dl>
            <span className={btn}>Review and sign</span>
          </Mock>
          <p>
            Can't find it? Check spam, or sign in at{" "}
            <a className="text-primary underline" href="https://portal.harmonious.co">portal.harmonious.co</a> — the
            agreement also appears in your notifications.
          </p>
        </Step>

        <Step n={2} title="Sign in to Harmonious">
          <p>
            The link opens the Harmonious sign-in page. Sign in with the{" "}
            <strong className="text-foreground">same email address the signing email was sent to</strong> — that's how
            we know it's you. If it's a Google address, <em>Continue with Google</em> works too.
          </p>
          <p>
            First time here? The link walks you through setting a password first, then takes you straight to the
            agreement. If you've been asked to verify your identity, that one-time step comes first — have a
            government ID handy.
          </p>
        </Step>

        <Step n={3} title="Read the agreement">
          <p>
            The full Operating Agreement opens on screen. Scroll through and read it carefully — this is the exact
            document your signature will be applied to. If anything looks wrong, don't sign: reply to the email or
            contact Harmonious and we'll send a corrected version.
          </p>
        </Step>

        <Step n={4} title="Sign electronically">
          <p>
            At the bottom of the document, type your{" "}
            <strong className="text-foreground">full legal name</strong> exactly as you want it to appear on the
            signature line, tick the box to agree to sign electronically, and click{" "}
            <strong className="text-foreground">Sign</strong>.
          </p>
          <Mock caption="Illustration of the signing screen (sample values).">
            <p className="text-lg font-semibold">Operating Agreement</p>
            <p className="text-xs text-muted-foreground">Your Fund LLC</p>
            <div className="max-h-24 overflow-hidden rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              …the full agreement text appears here for you to read…
            </div>
            <p className="font-semibold">Your signature</p>
            <div className={field}>Type your full legal name</div>
            <p className="text-xs text-muted-foreground">☐ I agree to sign this document electronically.</p>
            <span className={btn}>Sign</span>
          </Mock>
          <p>
            Your typed name, the date and time, and your consent are recorded with the document — together they form
            your legal electronic signature.
          </p>
        </Step>

        <Step n={5} title="You're done">
          <p>
            You'll see a confirmation on screen, and the document is marked <strong className="text-foreground">Signed</strong>{" "}
            on the fund's record. Harmonious is notified automatically — there's nothing else to send or upload. The
            signed copy stays in the fund's Documents tab permanently.
          </p>
        </Step>

        <section className="space-y-2 rounded-lg border border-border bg-muted/40 p-5 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">Need help?</p>
          <p>
            Email <a className="text-primary underline" href="mailto:support@harmonious.co">support@harmonious.co</a> or
            reply to the signing email. We never ask for your password by email.
          </p>
          <Link to="/help" className="text-primary underline">Back to Help center</Link>
        </section>
      </div>
    </main>
  );
}
