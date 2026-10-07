import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, FileText, ShieldCheck } from "lucide-react";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { SECURITY_STATEMENT, TRUST_SECTIONS } from "@/lib/security-content";
import { OPEN_SETTINGS_EVENT } from "@/lib/cookie-consent";
import { ASSURANCE_LABEL, ACCESS_LEVEL_LABEL } from "@/lib/security-compliance-model";
import { requestTrustDocument, type PublicTrustItem } from "@/lib/trust-center-public.functions";

/**
 * Harmonious Trust Center. Built-in copy describes product behaviour only;
 * everything else (assurance status, extra sections, trust documents) appears
 * only after Harmonious approves and publishes it internally. No seals or logos.
 */
export function SecurityCenterPage({ items }: { items: PublicTrustItem[] }) {
  const s = SECURITY_STATEMENT;
  const sections = items.filter((i) => i.item_type === "section");
  const assurance = items.filter((i) => i.item_type === "assurance");
  const documents = items.filter((i) => i.item_type === "document");
  const built = new Map(s.sections.map((x) => [x.key, x]));
  const visible = TRUST_SECTIONS.filter((t) => built.has(t.key) || sections.some((p) => p.item_key === t.key));
  const extra = sections.filter((p) => !TRUST_SECTIONS.some((t) => t.key === p.item_key));
  return (
    <MarketingShell>
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-4xl px-6 py-16">
          <p className="font-heading text-sm uppercase tracking-[0.16em] text-accent">Harmonious / Trust Center</p>
          <h1 className="mt-3 font-heading text-[clamp(1.9rem,4vw,2.75rem)] font-semibold leading-tight">{s.title}</h1>
          <div className="mt-6 h-px w-24 bg-accent" />
          <p className="mt-6 max-w-3xl leading-relaxed opacity-90">{s.summary}</p>
          <p className="mt-6 text-sm opacity-75">Last updated {s.updated}</p>
        </div>
      </section>

      <article className="mx-auto max-w-3xl px-6 py-14">
        <nav aria-label="Trust Center sections" className="mb-12 flex flex-wrap gap-2 text-sm">
          {[...visible.map((v) => [v.key, v.heading]), ["assurance", "Compliance & Assurance"], ["contact", "Security Contact"], ["documents", "Trust Documents"]].map(([k, h]) => (
            <a key={k} href={`#${k}`} className="rounded-full border px-3 py-1 hover:bg-muted">{h}</a>
          ))}
        </nav>

        {visible.map((t) => {
          const section = built.get(t.key);
          const published = sections.filter((p) => p.item_key === t.key);
          return (
            <section key={t.key} id={t.key} className="mb-12 scroll-mt-24 last:mb-0">
              <h2 className="flex items-center gap-2 font-heading text-xl font-semibold"><ShieldCheck className="h-5 w-5 shrink-0 text-accent" aria-hidden />{t.heading}</h2>
              {section?.intro ? <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{section.intro}</p> : null}
              <ul className="mt-4 space-y-3">
                {(section?.bullets ?? []).map((b) => (
                  <li key={b} className="flex gap-3 text-sm leading-relaxed"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden /><span>{b}</span></li>
                ))}
              </ul>
              {published.map((p) => <p key={p.id} className="mt-4 whitespace-pre-line text-sm leading-relaxed">{p.body}</p>)}
              {t.key === "cookies" ? (
                <button type="button" className="mt-4 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted" onClick={() => window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT))}>Cookie settings</button>
              ) : null}
            </section>
          );
        })}
        {extra.map((p) => (
          <section key={p.id} className="mb-12"><h2 className="font-heading text-xl font-semibold">{p.title}</h2><p className="mt-3 whitespace-pre-line text-sm leading-relaxed">{p.body}</p></section>
        ))}

        <section id="assurance" className="mb-12 scroll-mt-24">
          <h2 className="flex items-center gap-2 font-heading text-xl font-semibold"><ShieldCheck className="h-5 w-5 shrink-0 text-accent" aria-hidden />Compliance & Assurance</h2>
          {!assurance.length ? (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">No external assessments have been completed yet, so Harmonious makes no SOC 2, ISO, CSA STAR or GDPR certification claim. Results will appear here only once an outside assessor's report exists.</p>
          ) : (
            <ul className="mt-4 divide-y rounded-lg border">
              {assurance.map((a) => (
                <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 p-4 text-sm">
                  <div><p className="font-medium">{a.title}</p>{a.body ? <p className="mt-1 text-muted-foreground">{a.body}</p> : null}</div>
                  <span className="rounded-full border px-3 py-1 text-xs font-medium">{ASSURANCE_LABEL[a.assurance_status as keyof typeof ASSURANCE_LABEL] ?? "Planned"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mb-12">
          <h2 className="flex items-center gap-2 font-heading text-xl font-semibold"><AlertTriangle className="h-5 w-5 shrink-0 text-warning" aria-hidden />What this page does not claim</h2>
          <ul className="mt-4 space-y-3">{s.disclaimers.map((d) => <li key={d} className="text-sm leading-relaxed text-muted-foreground">{d}</li>)}</ul>
        </section>

        <section id="contact" className="mb-12 scroll-mt-24 rounded-lg border bg-muted/40 p-6">
          <h2 className="font-heading text-lg font-semibold">Security Contact</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Found something that looks wrong or unsafe? Write to <a className="underline" href={`mailto:${s.contact}`}>{s.contact}</a>. A person reads every message, and two staff members must confirm your identity before we change anything on your account.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            Related: <Link className="underline" to="/privacy">Privacy Policy</Link>{" · "}<Link className="underline" to="/terms">Terms of Service</Link>{" · "}<a className="underline" href="/.well-known/trust.html">Hosting provider&rsquo;s platform evidence</a>
          </p>
        </section>

        <section id="documents" className="scroll-mt-24">
          <h2 className="flex items-center gap-2 font-heading text-xl font-semibold"><FileText className="h-5 w-5 shrink-0 text-accent" aria-hidden />Trust Documents</h2>
          {!documents.length ? <p className="mt-3 text-sm text-muted-foreground">No documents are available yet. Ask {s.contact} if you need security information for a review.</p> : (
            <ul className="mt-4 space-y-3">{documents.map((d) => <DocumentRow key={d.id} d={d} />)}</ul>
          )}
        </section>
      </article>
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
          <button type="submit" disabled={state === "sending"} className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground sm:col-span-2">{state === "sending" ? "Sending..." : "Request document"}</button>
          {state === "error" ? <p className="text-destructive sm:col-span-2">Couldn't send your request. Please email us instead.</p> : null}
        </form>
      ) : <button type="button" className="mt-2 rounded-md border px-3 py-1.5 font-medium hover:bg-muted" onClick={() => setOpen(true)}>Request access</button>}
    </li>
  );
}
