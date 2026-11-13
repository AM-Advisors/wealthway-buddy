import { Download, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { GuideScreen, GuideStepSection } from "@/components/help/guide-sign-in";
import { ADD_ENTITY_INVESTOR_GUIDE, ADD_ENTITY_INVESTOR_GUIDE_DOWNLOAD, ADD_INVESTOR_GUIDE, ADD_INVESTOR_GUIDE_DOWNLOAD, type AddInvestorMock } from "@/lib/add-investor-guide-content";
import { SUPPORT_EMAIL } from "@/lib/sign-in-guide-content";

const field = "rounded-md border border-border bg-background px-3 py-2 text-muted-foreground";
const primary = "block w-full rounded-md bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground";
const outline = "block w-full rounded-md border border-border bg-background px-4 py-2 text-center text-sm font-medium text-foreground";
const chip = "rounded-md border border-border px-2 py-1 text-xs";

function MockScreen({ mock }: { mock: AddInvestorMock }) {
  switch (mock) {
    case "investors-page":
      return (
        <GuideScreen>
          <p className="text-xs text-muted-foreground">Overview · Setup · <span className="font-semibold text-foreground underline">Investors</span> · Documents</p>
          <p className="font-heading text-lg font-semibold">Investors</p>
          <div className="flex gap-2"><span className={`${primary} flex-1`}>+ Add investor</span><span className={`${outline} w-auto`}>Copy link</span></div>
          <div className="grid grid-cols-2 gap-1 text-xs">{["Investors", "Waiting on investor", "Waiting on Harmonious", "Ready or funded"].map((t) => <span key={t} className={chip}>{t}</span>)}</div>
        </GuideScreen>
      );
    case "add-chooser":
      return (
        <GuideScreen>
          <p className="font-heading font-semibold">Add investors</p>
          <p className="text-xs text-muted-foreground">Choose how you'd like to add them.</p>
          {["Add one investor", "Upload a list", "Invite several by email", "Prepare a draft", "Share the fund link"].map((t, i) => (
            <div key={t} className={`rounded-md border p-2 ${i === 0 ? "border-primary bg-primary/5 font-medium" : "border-border"}`}>{t}</div>
          ))}
        </GuideScreen>
      );
    case "investor-form":
      return (
        <GuideScreen>
          <p className="font-heading font-semibold">Create New Investor</p>
          <div className="flex gap-2"><span className={`${primary} w-auto`}>Individual</span><span className={`${outline} w-auto`}>Business / organization</span></div>
          <div className="grid grid-cols-2 gap-2"><div className={field}>Jane</div><div className={field}>Sample</div></div>
          <div className={field}>jane@example.com</div>
          <p className="text-xs text-muted-foreground">☐ Someone else completes the paperwork and gets the invitation</p>
        </GuideScreen>
      );
    case "search-results":
      return (
        <GuideScreen>
          <span className={`${outline} w-auto`}>Search existing investors</span>
          <p className="font-medium">Possible existing investors</p>
          <div className="rounded-md border border-border p-2">
            <p className="font-medium">Jane Sample</p>
            <p className="text-xs text-muted-foreground">j•••@example.com · matched on email</p>
            <div className="mt-2 flex flex-wrap gap-1"><span className={chip}>Use Individual</span><span className={chip}>Use person, new profile</span></div>
          </div>
          <p className="text-xs text-muted-foreground">☐ Create new: this is a different person</p>
        </GuideScreen>
      );
    case "amount":
      return (
        <GuideScreen>
          <p className="text-xs text-muted-foreground">Investing as</p>
          <div className={field}>Individual ▾</div>
          <p className="text-xs text-muted-foreground">Investment amount (USD)</p>
          <div className={field}>250,000</div>
          <p className="text-sm font-medium text-primary">Enter Full Investor Details</p>
        </GuideScreen>
      );
    case "add-and-invite":
      return (
        <GuideScreen>
          <span className={primary}>Add & invite · Open record</span>
          <span className={outline}>Add & invite</span>
          <div className="rounded-md border border-border bg-muted p-2 text-xs">✓ Investor added and invitation sent.</div>
        </GuideScreen>
      );
    case "investor-steps":
      return (
        <GuideScreen>
          <p className="font-heading font-semibold">The investor's steps</p>
          <ol className="space-y-1.5">
            {["About You", "Verification", "Sign", "Fund"].map((s, i) => (
              <li key={s} className="flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{i + 1}</span>{s}</li>
            ))}
          </ol>
        </GuideScreen>
      );
    case "roster-row":
      return (
        <GuideScreen>
          <div className="flex items-start justify-between gap-2 rounded-md border border-border p-2">
            <div><p className="font-medium">Jane Sample</p><p className="text-xs text-muted-foreground">Individual · $250,000</p></div>
            <div className="text-right"><span className={chip}>In progress</span><p className="mt-1 text-xs text-muted-foreground">Done 3 of 6 · Investor: Sign</p></div>
          </div>
          <div className="flex gap-2"><span className={`${outline} w-auto`}>Fill in for investor</span><span className={`${outline} w-auto`}>•••</span></div>
        </GuideScreen>
      );
    case "fill-in":
      return (
        <GuideScreen>
          <p className="font-heading font-semibold">Fill in for Jane Sample</p>
          <div className={field}>Answer you already know</div>
          <div className="flex gap-2"><span className={`${outline} flex-1`}>Save only</span><span className={`${primary} flex-1`}>Save and send to sign</span></div>
        </GuideScreen>
      );
    case "approve-funds":
      return (
        <GuideScreen>
          <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3">
            <p className="font-medium">Approve investor to send funds</p>
            <p className="text-xs text-muted-foreground">The investor can view the fund's released bank details after approval and completed checks.</p>
            <span className={primary}>Approve to send funds</span>
          </div>
        </GuideScreen>
      );
    case "entity-form":
      return (
        <GuideScreen>
          <p className="font-heading font-semibold">Create New Investor</p>
          <div className="flex gap-2"><span className={`${outline} w-auto`}>Individual</span><span className={`${primary} w-auto`}>Business / organization</span></div>
          <div className="grid grid-cols-2 gap-2"><div className={field}>Contact first name</div><div className={field}>Contact last name</div></div>
          <div className={field}>Contact email</div>
          <div className={field}>Sample Family Office LLC</div>
        </GuideScreen>
      );
    case "entity-details":
      return (
        <GuideScreen>
          <p className="text-sm font-medium text-primary">Hide full investor details</p>
          <div className="flex flex-wrap gap-1 text-xs">{["Contact", "Investment Profile", "Entity / Ownership"].map((t, i) => <span key={t} className={`${chip} ${i === 1 ? "bg-primary text-primary-foreground" : ""}`}>{t}</span>)}</div>
          <p className="text-xs text-muted-foreground">Entity type</p>
          <div className={field}>Family office ▾</div>
          <div className="grid grid-cols-2 gap-2"><div className={field}>Jurisdiction</div><div className={field}>EIN / Tax ID</div></div>
        </GuideScreen>
      );
    case "completed-by":
      return (
        <GuideScreen>
          <p className="font-medium">Completed by</p>
          <p className="text-xs text-muted-foreground">Prepared by: Alex Analyst · Signs: Pat Principal (Managing Member)</p>
          <div className="flex gap-2"><span className={`${primary} w-auto`}>Prepares details</span><span className={`${outline} w-auto`}>Signs</span></div>
          <div className="grid grid-cols-2 gap-2"><div className={field}>Full name</div><div className={field}>Email</div></div>
          <span className={primary}>Assign and email</span>
        </GuideScreen>
      );
    case "people-panel":
      return (
        <GuideScreen>
          <p className="font-medium">People on this investment</p>
          <div className="grid grid-cols-2 gap-2"><div className={field}>First name</div><div className={field}>Last name</div></div>
          <div className="grid grid-cols-2 gap-2"><div className={field}>Email</div><div className={field}>Beneficial owner ▾</div></div>
          <p className="text-xs">☑ Email them an identity check (ID + selfie)</p>
          <p className="text-xs text-muted-foreground">☐ Make them the signer and send them the signature page</p>
          <span className={primary}>Add person</span>
        </GuideScreen>
      );
    case "contacts-panel":
      return (
        <GuideScreen>
          <p className="font-medium">Points of contact</p>
          <p className="text-xs text-muted-foreground">Sam Sample · sam@example.com · Controller · active</p>
          <div className="grid grid-cols-2 gap-2"><div className={field}>Full name</div><div className={field}>Email</div></div>
          <span className={primary}>Add and email view link</span>
        </GuideScreen>
      );
  }
}

/** Fund manager guide to adding an investor. Rendered in the help center; the PDF uses the same content. */
export function AddInvestorGuide({ variant = "individual" }: { variant?: "individual" | "entity" }) {
  const g = variant === "entity" ? ADD_ENTITY_INVESTOR_GUIDE : ADD_INVESTOR_GUIDE;
  const pdf = variant === "entity" ? ADD_ENTITY_INVESTOR_GUIDE_DOWNLOAD : ADD_INVESTOR_GUIDE_DOWNLOAD;
  return (
    <main className="bg-background">
      <div className="mx-auto max-w-4xl space-y-10 px-5 py-12">
        <header className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent-foreground">{g.eyebrow}</p>
          <h1 className="text-3xl font-bold text-foreground md:text-4xl">{g.title}</h1>
          <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">{g.intro}</p>
          <p className="text-base text-muted-foreground">Where to find it: <strong className="text-foreground">{g.where}</strong></p>
          <Button asChild size="lg" variant="outline"><a href={pdf.href} download={pdf.filename}><Download className="mr-2 h-4 w-4" />Download printable guide</a></Button>
        </header>

        <section className="space-y-3 rounded-lg border border-border bg-muted/40 p-5">
          <h2 className="text-xl font-semibold text-foreground">Before you start, have ready</h2>
          <ul className="list-disc space-y-1 pl-5 text-base text-muted-foreground">{g.before.map((b) => <li key={b}>{b}</li>)}</ul>
        </section>

        {g.groups.map((grp) => (
          <div key={grp.heading} className="space-y-8">
            <h2 className="text-2xl font-semibold text-foreground">{grp.heading}</h2>
            {grp.steps.map((st, i) => <GuideStepSection key={st.title} n={i + 1} title={st.title} paragraphs={st.paragraphs} labels={st.labels} visual={st.mock ? <MockScreen mock={st.mock} /> : undefined} />)}
          </div>
        ))}

        <div className="space-y-4 border-t border-border pt-8">
          <h2 className="text-2xl font-semibold text-foreground">{g.cards.heading}</h2>
          <p className="text-base text-muted-foreground">{g.cards.intro}</p>
          <div className="grid gap-4 md:grid-cols-2">
            {g.cards.items.map((o) => (
              <div key={o.title} className="space-y-2 rounded-lg border border-border p-4">
                <h3 className="text-lg font-semibold text-foreground">{o.title}</h3>
                <p className="text-base leading-relaxed text-muted-foreground">{o.body}</p>
                <p className="flex flex-wrap gap-2">{o.labels.map((l) => <span key={l} className="rounded-md border border-border bg-muted px-2 py-1 text-xs font-medium text-foreground">{l}</span>)}</p>
              </div>
            ))}
          </div>
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
