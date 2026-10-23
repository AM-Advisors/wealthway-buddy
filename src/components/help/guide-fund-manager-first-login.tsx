import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import loginShot from "@/assets/guide/fm-1_login.png.asset.json";
import legalShot from "@/assets/guide/fm-2_legal.png.asset.json";
import verifyShot from "@/assets/guide/fm-3_ss4.png.asset.json";


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

function Shot({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <figure className="space-y-2">
      <img src={src} alt={alt} loading="lazy" className="w-full rounded-lg border border-border shadow-sm" />
      <figcaption className="text-xs text-muted-foreground">{caption}</figcaption>
    </figure>
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

export function FundManagerFirstLoginGuide() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl space-y-10 px-5 py-12">
        <header className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent-foreground">Fund manager guide</p>
          <h1 className="text-3xl font-bold text-foreground">Your first login, Form SS-4 and Operating Agreement</h1>
          <p className="text-muted-foreground">
            Follow these steps in order. Have your government ID and a phone or computer camera ready. If an SS-4 is required, enter the responsible party’s SSN or ITIN only on the protected form. Wait for each saved confirmation before leaving.
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Accept your invite and sign in</li>
            <li>Accept the platform documents</li>
            <li>Verify your identity</li>
            <li>Sign Form SS-4 (EIN application)</li>
            <li>Sign the Operating Agreement</li>
          </ol>
        </header>

        <Step n={1} title="Accept your invite and sign in">
          <p>
            Open the email from Harmonious and click the invitation link. Create your password using the{" "}
            <strong className="text-foreground">same email address the invite was sent to</strong> — that is how
            your fund is linked to you. Next time, sign in at{" "}
            <a className="text-primary underline" href="https://app.harmonious.co">app.harmonious.co</a> with
            that email, or use <em>Continue with Google</em> if it is a Google address.
          </p>
          <Shot src={loginShot.url} alt="Harmonious sign-in page" caption="The sign-in page. Lost your link? Use “Forgot your password?”" />
        </Step>

        <Step n={2} title="Accept the platform documents">
          <p>
            The first time you sign in you will see <strong className="text-foreground">Before you continue</strong>.
            Read the Privacy Policy, Terms of Service, Fee schedule, Electronic signatures consent and any fund
            agreement listed. Tick the box at the bottom, type your full name and continue. Acceptance is recorded for each required version. Previously accepted current versions do not need accepting again.
          </p>
          <Shot src={legalShot.url} alt="Before you continue documents screen" caption="One-time acceptance. Scroll to the bottom to tick the box and type your name." />
        </Step>

        <Step n={3} title="Verify your identity">
          <p>
            Click <strong className="text-foreground">Start verification</strong>. Harmonious will ask for a
            photo of your government ID, a quick selfie, and your address. It takes about 5 minutes. On a computer
            you can scan a code to finish on your phone. Your ID number is never shown in the portal.
          </p>
          <p>Approved identity allows account access where you are authorized. Separate investing-party, business and screening requirements can still apply; verification may need updating.</p>
          <Shot src={verifyShot.url} alt="Verify your identity screen" caption="Account identity verification is separate from each investing party’s requirements." />
        </Step>

        <Step n={4} title="Sign Form SS-4 (EIN application)">
          <p>
            Open the <strong className="text-foreground">“Sign Form SS-4”</strong> email and click the link, or find it
            on your home attention list or <strong className="text-foreground">Sign-off</strong> page.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Check every line. Harmonious prefilled it from your fund's details.</li>
            <li>If something is wrong, reply to Harmonious <em>before</em> signing and we'll send a corrected form.</li>
            <li>Enter your full legal name, title (e.g. Managing Member), phone, and SSN/ITIN for line 7b. It is encrypted.</li>
            <li>Tick the declaration and click <strong className="text-foreground">Sign Form SS-4</strong>.</li>
          </ul>
          <Mock caption="Illustration of the SS-4 signing screen (sample values).">
            <p className="text-lg font-semibold">Form SS-4: EIN application</p>
            <div className="divide-y divide-border rounded-md border border-border text-xs">
              {[["1", "Legal name of entity", "Your Fund LLC"], ["4a", "Mailing address", "123 Main St"], ["7a", "Responsible party", "Your name"], ["7b", "Responsible party SSN / ITIN", "Add below"]].map(([l, k, v]) => (
                <div key={l} className="grid grid-cols-[2.5rem_1fr_1fr] gap-2 px-3 py-2">
                  <span className="text-muted-foreground">{l}</span><span className="text-muted-foreground">{k}</span><span className="font-medium">{v}</span>
                </div>
              ))}
            </div>
            <p className="font-semibold">Sign</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className={field}>Full legal name</div><div className={field}>Managing Member</div>
              <div className={field}>Phone</div><div className={field}>SSN or ITIN</div>
            </div>
            <p className="text-xs text-muted-foreground">☐ Under penalties of perjury, I declare… typing my name is my electronic signature.</p>
            <span className={btn}>Sign Form SS-4</span>
          </Mock>
          <p>Signing the SS-4 records your authorization; it does not file an IRS application automatically. Harmonious handles the requested application separately and records the IRS-issued EIN with its evidence.</p>
        </Step>

        <Step n={5} title="Sign the Operating Agreement">
          <p>
            You will get a <strong className="text-foreground">“Review &amp; Countersign”</strong> email for the
            Operating Agreement. Click the personal link (or open the fund’s Documents and Sign-off pages), check the fund and document
            name, then click <strong className="text-foreground">Review &amp; Countersign</strong>. The document opens
            with only your signature fields highlighted. Sign each field and finish.
          </p>
          <Mock caption="Illustration of the signing card (sample values).">
            <p className="text-lg font-semibold">Review &amp; Countersign</p>
            <dl className="grid gap-1 text-xs">
              <div><dt className="text-muted-foreground">Fund</dt><dd>Your Fund LLC</dd></div>
              <div><dt className="text-muted-foreground">Document</dt><dd>Operating Agreement</dd></div>
            </dl>
            <span className={btn}>Review &amp; Countersign</span>
          </Mock>
          <p>
            <strong className="text-foreground">Subscription Agreements:</strong> investors always sign first. As each
            investor finishes, you get the same “Review &amp; Countersign” email for their agreement — follow the same steps.
          </p>
        </Step>

        <section className="space-y-2 rounded-lg border border-border bg-muted/40 p-5 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">Need help?</p>
          <p>
            Use Messages to contact Harmonious Operations. Self Serve includes a guaranteed response within five business days; paid support levels cost extra. We never ask for your password or full SSN by email.
          </p>
          <Link to="/help" className="text-primary underline">Back to Help center</Link>
        </section>
      </div>
    </main>
  );
}
