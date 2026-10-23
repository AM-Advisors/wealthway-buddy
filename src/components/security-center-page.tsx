import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowUpRight, FileText, KeyRound, LockKeyhole, Mail, ShieldCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { SECURITY_STATEMENT, TRUST_SECTIONS } from "@/lib/security-content";
import { OPEN_SETTINGS_EVENT } from "@/lib/cookie-consent";
import { ASSURANCE_LABEL, ACCESS_LEVEL_LABEL } from "@/lib/security-compliance-model";
import { requestTrustDocument, type PublicTrustItem } from "@/lib/trust-center-public.functions";

/**
 * Harmonious Trust Center. Built-in copy describes product behavior only;
 * everything else (published assurance evidence, extra sections, trust
 * documents) appears only after Harmonious approves and publishes it
 * internally. No seals or logos, and the page states no certification status.
 */
export function SecurityCenterPage({ items }: { items: PublicTrustItem[] }) {
  const s = SECURITY_STATEMENT;
  const sections = items.filter((i) => i.item_type === "section");
  const assurance = items.filter((i) => i.item_type === "assurance");
  const documents = items.filter((i) => i.item_type === "document");
  const built = new Map(s.sections.map((x) => [x.key, x]));
  const visible = TRUST_SECTIONS.filter((t) => built.has(t.key) || sections.some((p) => p.item_key === t.key));
  const extra = sections.filter((p) => !TRUST_SECTIONS.some((t) => t.key === p.item_key));
  const navigation: [string, string][] = [...visible.map((v): [string, string] => [v.key, v.heading]), ...(assurance.length ? [["assurance", "Published assurance evidence"]] as [string, string][] : []), ["documents", "Trust documents"], ["questions", "Common questions"], ["contact", "Security contact"]];
  const icons = [LockKeyhole, KeyRound, ShieldCheck, Wallet];
  return (
    <MarketingShell>
      <header className="border-b bg-background">
        <div className="mx-auto max-w-6xl px-6 py-12 md:py-16">
          <p className="flex items-center gap-2 text-sm font-medium text-primary"><ShieldCheck className="size-5" aria-hidden />Trust & privacy</p>
          <h1 className="mt-4 max-w-3xl font-heading text-4xl font-semibold leading-tight tracking-normal md:text-5xl">{s.title}</h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground">{s.summary}</p>
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Button asChild><a href="#encryption"><LockKeyhole />Encryption details<ArrowDown /></a></Button>
            <a href="#contact" className="inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline">Contact our security team<ArrowUpRight className="size-4" /></a>
            <span className="text-xs text-muted-foreground">Updated {s.updated}</span>
          </div>
        </div>
      </header>

      <section aria-label="Security at a glance" className="border-b bg-secondary/40">
        <div className="mx-auto grid max-w-6xl gap-7 px-6 py-8 sm:grid-cols-2 lg:grid-cols-4">
          {s.highlights.map((fact, index) => {
            const Icon = icons[index] ?? ShieldCheck;
            return <div key={fact.title}><Icon className="mb-3 size-6 text-primary" aria-hidden /><h2 className="font-heading text-base font-semibold tracking-normal">{fact.title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{fact.body}</p></div>;
          })}
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-16">
        <aside>
          <nav aria-label="Trust Center sections" className="lg:sticky lg:top-24">
            <p className="mb-3 text-xs font-semibold uppercase tracking-normal text-muted-foreground">On this page</p>
            <div className="flex max-h-60 flex-wrap gap-x-5 gap-y-3 overflow-y-auto lg:max-h-[75vh] lg:flex-col lg:gap-0">
              {navigation.map(([key, heading]) => <a key={key} href={`#${key}`} className="border-l-2 border-transparent py-2 pl-3 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline-ring">{heading}</a>)}
            </div>
          </nav>
        </aside>

        <article className="min-w-0">
          {visible.map((t) => {
            const section = built.get(t.key);
            const published = sections.filter((p) => p.item_key === t.key);
            return (
              <section key={t.key} id={t.key} className="mb-10 scroll-mt-24 border-b pb-10">
                <h2 className="font-heading text-2xl font-semibold tracking-normal">{t.heading}</h2>
                {section?.intro ? <p className="mt-3 text-sm leading-7 text-muted-foreground">{section.intro}</p> : null}
                <ul className="mt-5 space-y-4">
                  {(section?.bullets ?? []).map((bullet) => <li key={bullet} className="flex gap-3 text-sm leading-7"><span className="mt-3 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden /><span>{bullet}</span></li>)}
                </ul>
                {published.map((p) => <p key={p.id} className="mt-4 whitespace-pre-line text-sm leading-7">{p.body}</p>)}
                {t.key === "cookies" ? <Button variant="outline" className="mt-5" onClick={() => window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT))}>Cookie settings</Button> : null}
              </section>
            );
          })}
          {extra.map((p) => <section key={p.id} className="mb-10 border-b pb-10"><h2 className="font-heading text-2xl font-semibold tracking-normal">{p.title}</h2><p className="mt-3 whitespace-pre-line text-sm leading-7">{p.body}</p></section>)}

          {assurance.length ? (
            <section id="assurance" className="mb-10 scroll-mt-24 border-b pb-10">
              <h2 className="font-heading text-2xl font-semibold tracking-normal">Published assurance evidence</h2>
              <ul className="mt-5 divide-y rounded-lg border">{assurance.map((a) => <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 p-4 text-sm"><div className="min-w-0 flex-1"><p className="font-medium">{a.title}</p>{a.body ? <p className="mt-1 whitespace-pre-line leading-6 text-muted-foreground">{a.body}</p> : null}</div><span className="text-xs font-medium text-primary">{ASSURANCE_LABEL[a.assurance_status as keyof typeof ASSURANCE_LABEL] ?? "Planned"}</span></li>)}</ul>
            </section>
          ) : null}

          <section id="documents" className="mb-10 scroll-mt-24 border-b pb-10">
            <h2 className="flex items-center gap-3 font-heading text-2xl font-semibold tracking-normal"><FileText className="size-6 text-primary" aria-hidden />Trust documents</h2>
            {!documents.length ? <p className="mt-3 text-sm leading-7 text-muted-foreground">No trust documents are currently published. For a due-diligence questionnaire or supporting security information, contact <a className="break-all underline" href={`mailto:${s.security_contact}`}>{s.security_contact}</a>. Availability and access are reviewed individually.</p> : <ul className="mt-5 space-y-3">{documents.map((d) => <DocumentRow key={d.id} d={d} />)}</ul>}
            <a className="mt-4 inline-flex items-center gap-2 text-sm text-primary underline" href="/.well-known/trust.html">Hosting platform evidence<ArrowUpRight className="size-4" /></a>
            <div className="mt-3 space-y-2">{s.disclaimers.map((d) => <p key={d} className="text-xs leading-6 text-muted-foreground">{d}</p>)}</div>
          </section>

          <section id="questions" className="mb-10 scroll-mt-24 border-b pb-10">
            <h2 className="font-heading text-2xl font-semibold tracking-normal">Common security questions</h2>
            <Accordion type="single" collapsible className="mt-4">
              <AccordionItem value="certificate"><AccordionTrigger>Does Harmonious have an SSL/TLS certificate?</AccordionTrigger><AccordionContent className="leading-7 text-muted-foreground">Yes. Harmonious uses HTTPS with valid TLS certificates on every web address. TLS encrypts traffic between your browser and the website. Your browser's site information panel shows the connection and certificate details.</AccordionContent></AccordionItem>
              <AccordionItem value="warning"><AccordionTrigger>What should I do if my browser shows a security warning?</AccordionTrigger><AccordionContent className="leading-7 text-muted-foreground">Do not bypass the warning or enter personal information. Check that the address is a Harmonious web address and that your device's date and time are correct. Send the exact web address, warning wording, browser name and approximate time to legal@harmonious.co. Do not send passwords, one-time codes, full tax IDs or bank details.</AccordionContent></AccordionItem>
              <AccordionItem value="review"><AccordionTrigger>Can I request information for an investor security review?</AccordionTrigger><AccordionContent className="leading-7 text-muted-foreground">Yes. Email legal@harmonious.co with your organization, the information requested and the purpose of your review. Supporting documents are subject to availability and access review; a request does not itself grant access.</AccordionContent></AccordionItem>
              <AccordionItem value="money"><AccordionTrigger>Does connecting a bank account allow automatic transfers?</AccordionTrigger><AccordionContent className="leading-7 text-muted-foreground">No. Bank connections described here are read-only. Preparing payment instructions, reviewing a distribution or recording a payment does not automatically initiate a wire, ACH transfer, tax payment or refund.</AccordionContent></AccordionItem>
            </Accordion>
          </section>

          <section id="contact" className="scroll-mt-24">
            <p className="mb-3 flex items-center gap-2 text-sm font-medium text-primary"><Mail className="size-5" aria-hidden />Security contact</p>
            <h2 className="font-heading text-2xl font-semibold tracking-normal">Report a concern. Ask for evidence.</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">For a suspected vulnerability, connection warning or security review, contact <a className="break-all font-medium text-primary underline" href={`mailto:${s.security_contact}`}>{s.security_contact}</a>. Share the affected web address and what you observed, without including sensitive account information. Avoid testing that accesses another person's records or interrupts the service.</p>
            <div className="mt-5 flex flex-wrap gap-3"><Button asChild><a href={`mailto:${s.security_contact}`}><Mail />Email legal</a></Button><Button asChild variant="outline"><a href="/.well-known/security.txt"><FileText />Security contact file</a></Button></div>
            <p className="mt-5 text-sm leading-7 text-muted-foreground">For account help: <a className="break-all underline" href={`mailto:${s.contact}`}>{s.contact}</a>.</p>
            <div className="mt-5 flex flex-wrap gap-5 text-sm text-primary"><Link className="underline" to="/privacy">Privacy Policy</Link><Link className="underline" to="/terms">Terms of Service</Link><a className="underline" href="#top" onClick={(event) => { event.preventDefault(); window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }}>Back to top</a></div>
            <p className="mt-6 border-t pt-5 text-xs leading-6 text-muted-foreground">{s.ip_notice}</p>
          </section>
        </article>
      </div>
    </MarketingShell>
  );
}

function DocumentRow({ d }: { d: PublicTrustItem }) {
  const request = useServerFn(requestTrustDocument);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ requester_name: "", requester_email: "", company: "", reason: "" });
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  return (
    <li className="rounded-lg border p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="font-medium">{d.title}</p>{d.body ? <p className="text-muted-foreground">{d.body}</p> : null}</div>
        <span className="text-xs text-muted-foreground">{ACCESS_LEVEL_LABEL[d.access_level as keyof typeof ACCESS_LEVEL_LABEL]}</span>
      </div>
      {state === "sent" ? <p className="mt-2 text-sm">Request received. Harmonious reviews each request; a request does not grant access by itself.</p> : open ? (
        <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); setState("sending"); request({ data: { publication_id: d.id, ...f } }).then(() => setState("sent")).catch(() => setState("error")); }}>
          {(["requester_name", "requester_email", "company"] as const).map((k) => (
            <input key={k} required={k !== "company"} type={k === "requester_email" ? "email" : "text"} placeholder={{ requester_name: "Your name", requester_email: "Work email", company: "Company" }[k]} className="rounded-md border bg-background px-3 py-2" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          ))}
          <input placeholder="Why you need it" className="rounded-md border bg-background px-3 py-2" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
          <Button type="submit" disabled={state === "sending"} className="sm:col-span-2">{state === "sending" ? "Sending..." : "Request document"}</Button>
          {state === "error" ? <p className="text-destructive sm:col-span-2">Couldn't send your request. Please email us instead.</p> : null}
        </form>
      ) : <Button variant="outline" className="mt-2" onClick={() => setOpen(true)}>Request access</Button>}
    </li>
  );
}
