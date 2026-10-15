import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import loginShot from "@/assets/guide/fm-1_login.png.asset.json";
import legalShot from "@/assets/guide/fm-2_legal.png.asset.json";
import verifyShot from "@/assets/guide/fm-3_ss4.png.asset.json";

const TITLE = "Fund manager guide: first login, SS-4 and Operating Agreement - Harmonious";
const DESC =
  "Step-by-step guide with screenshots for fund managers: sign in to Harmonious, verify your identity, sign Form SS-4 and sign your fund's Operating Agreement.";

export const Route = createFileRoute("/guides/fund-manager-first-login")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GuidePage,
});

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

function GuidePage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl space-y-10 px-5 py-12">
        <header className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent-foreground">Fund manager guide</p>
          <h1 className="text-3xl font-bold text-foreground">Your first login, Form SS-4 and Operating Agreement</h1>
          <p className="text-muted-foreground">
            Follow these steps in order. It takes about 15 minutes. Have your government ID, a phone or computer
            camera, and your SSN or ITIN ready. Your progress saves as you go.
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
            <a className="text-primary underline" href="https://portal.harmonious.co">portal.harmonious.co</a> with
            that email, or use <em>Continue with Google</em> if it is a Google address.
          </p>
          <Shot src={loginShot.url} alt="Harmonious sign-in page" caption="The sign-in page. Lost your link? Use “Forgot your password?”" />
        </Step>

        <Step n={2} title="Accept the platform documents">
          <p>
            The first time you sign in you will see <strong className="text-foreground">Before you continue</strong>.
            Read the Privacy Policy, Terms of Service, Fee schedule, Electronic signatures consent and any fund
            agreement listed. Tick the box at the bottom, type your full name and continue. You only do this once
            (and again if a document is updated).
          </p>
          <Shot src={legalShot.url} alt="Before you continue documents screen" caption="One-time acceptance. Scroll to the bottom to tick the box and type your name." />
        </Step>

        <Step n={3} title="Verify your identity">
          <p>
            Click <strong className="text-foreground">Start verification</strong>. Harmonious will ask for a
            photo of your government ID, a quick selfie, and your address. It takes about 5 minutes. On a computer
            you can scan a code to finish on your phone. Your ID number is never shown in the portal.
          </p>
          <p>Once approved, your full portal and fund open automatically — you won't need to do this again.</p>
          <Shot src={verifyShot.url} alt="Verify your identity screen" caption="Every user verifies once before seeing fund details or signing." />
        </Step>

        <Step n={4} title="Sign Form SS-4 (EIN application)">
          <p>
            Open the <strong className="text-foreground">“Sign Form SS-4”</strong> email and click the link, or find it
            under <strong className="text-foreground">Notifications &amp; tasks</strong> in the left menu.
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
          <p>Harmonious then files the SS-4 with the IRS and adds your EIN to the fund. You'll see it in the fund's Banking and setup pages.</p>
        </Step>

        <Step n={5} title="Sign the Operating Agreement">
          <p>
            You will get a <strong className="text-foreground">“Review &amp; Countersign”</strong> email for the
            Operating Agreement. Click the link (or open it from Notifications &amp; tasks), check the fund and document
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
            Email <a className="text-primary underline" href="mailto:support@harmonious.co">support@harmonious.co</a> or
            reply to any Harmonious email. We never ask for your password or full SSN by email.
          </p>
          <Link to="/" className="text-primary underline">Back to Harmonious</Link>
        </section>
      </div>
    </main>
  );
}
