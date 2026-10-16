import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FundManagerFirstLoginGuide } from "@/components/help/guide-fund-manager-first-login";
import { SignOperatingAgreementGuide } from "@/components/help/guide-sign-operating-agreement";
import { CLIENT_HELP_ROLES, HELP_SERVICES, STAFF_HELP_ROLES, type HelpArticleView, type HelpAudience } from "@/lib/help-articles";
import { approveHelpArticle, listHelpArticles } from "@/lib/help-center.functions";

export const helpQuery = (audience: HelpAudience) => ({
  queryKey: ["help-center", audience],
  queryFn: () => listHelpArticles({ data: { audience } }),
  staleTime: 60_000,
});

const serviceTitle = (id: string) => HELP_SERVICES.find((s) => s.id === id)?.title ?? id;

function ArticleCard({ a, ops }: { a: HelpArticleView; ops: boolean }) {
  return (
    <Link
      to={ops ? "/ops/help/$slug" : "/help/$slug"}
      params={{ slug: a.slug }}
      className="block rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-foreground">{a.title}</h3>
        {ops && a.audience === "client" && !a.approved ? <Badge variant="outline">Draft – review</Badge> : null}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{a.summary}</p>
    </Link>
  );
}

function Grouped({ articles, by, ops, roleList }: { articles: HelpArticleView[]; by: "role" | "service"; ops: boolean; roleList: readonly { id: string; title: string }[] }) {
  const groups = by === "service" ? HELP_SERVICES : roleList;
  const general = articles.filter((a) => (by === "service" ? a.services.length === 0 : a.roles.length === 0));
  return (
    <div className="space-y-8">
      {general.length ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">General</h2>
          <div className="grid gap-3 md:grid-cols-2">{general.map((a) => <ArticleCard key={a.slug} a={a} ops={ops} />)}</div>
        </section>
      ) : null}
      {groups.map((g) => {
        const list = articles.filter((a) => (by === "service" ? (a.services as string[]).includes(g.id) : a.roles.includes(g.id)));
        if (!list.length) return null;
        return (
          <section key={g.id} className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">{g.title}</h2>
            <div className="grid gap-3 md:grid-cols-2">{list.map((a) => <ArticleCard key={a.slug} a={a} ops={ops} />)}</div>
          </section>
        );
      })}
    </div>
  );
}

export function HelpCenterHome({ ops }: { ops: boolean }) {
  const { data } = useSuspenseQuery(helpQuery(ops ? "staff" : "client"));
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"staff" | "client">("staff");
  const [by, setBy] = useState<"role" | "service">("role");
  const pool = ops ? data.articles.filter((a) => a.audience === tab) : data.articles;
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? pool.filter((a) => `${a.title} ${a.summary} ${a.services.map(serviceTitle).join(" ")}`.toLowerCase().includes(t)) : pool;
  }, [pool, q]);
  const roleList = ops && tab === "staff" ? STAFF_HELP_ROLES : CLIENT_HELP_ROLES;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">{ops ? "Help center" : "Help"}</h1>
        <p className="text-muted-foreground">{ops ? "Staff procedures, plus the client help center exactly as clients see it." : "Guides for your role and the services on your account."}</p>
      </header>
      {ops ? (
        <div className="flex gap-2">
          <Button variant={tab === "staff" ? "default" : "outline"} onClick={() => setTab("staff")}>Staff help</Button>
          <Button variant={tab === "client" ? "default" : "outline"} onClick={() => setTab("client")}>Client help center</Button>
        </div>
      ) : null}
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <Input placeholder="Search help articles" value={q} onChange={(e) => setQ(e.target.value)} className="md:max-w-sm" aria-label="Search help articles" />
        <div className="flex gap-2">
          <Button size="sm" variant={by === "role" ? "secondary" : "ghost"} onClick={() => setBy("role")}>By role</Button>
          <Button size="sm" variant={by === "service" ? "secondary" : "ghost"} onClick={() => setBy("service")}>By service</Button>
        </div>
        {!ops ? <Button asChild variant="outline" size="sm" className="md:ml-auto"><Link to="/messages">Contact Harmonious</Link></Button> : null}
      </div>
      {shown.length ? <Grouped articles={shown} by={by} ops={ops} roleList={roleList} /> : <p className="text-muted-foreground">No articles match.</p>}
    </div>
  );
}

export function HelpArticlePage({ ops, slug }: { ops: boolean; slug: string }) {
  const { data } = useSuspenseQuery(helpQuery(ops ? "staff" : "client"));
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const a = data.articles.find((x) => x.slug === slug);
  if (!a) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 p-8">
        <h1 className="text-xl font-semibold text-foreground">Article not available</h1>
        <p className="text-muted-foreground">This article isn't available for your account.</p>
        <Link to={ops ? "/ops/help" : "/help"} className="text-primary underline">Back to help</Link>
      </div>
    );
  }
  const approve = async () => {
    setBusy(true);
    try {
      await approveHelpArticle({ data: { slug: a.slug, note } });
      toast.success("Approved for clients");
      await qc.invalidateQueries({ queryKey: ["help-center"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't approve");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <div className="mx-auto max-w-3xl space-y-3 px-4 pt-6 md:px-8">
        <Link to={ops ? "/ops/help" : "/help"} className="text-sm text-primary underline">← Help center</Link>
        <div className="flex flex-wrap gap-2">
          {a.services.map((s) => <Badge key={s} variant="secondary">{serviceTitle(s)}</Badge>)}
          {ops && a.audience === "client" ? <Badge variant="outline">{a.approved ? "Approved for clients" : "Draft – review"}</Badge> : null}
          {ops && a.audience === "staff" ? <Badge variant="outline">Staff only</Badge> : null}
        </div>
        {ops && data.canApprove && a.audience === "client" && !a.approved ? (
          <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-4">
            <p className="text-sm text-foreground">Clients can't see this article until it's approved.</p>
            <Textarea placeholder="Review note (required)" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button disabled={busy || note.trim().length < 3} onClick={approve}>Approve for clients</Button>
          </div>
        ) : null}
      </div>
      {a.guide === "fund-manager-first-login" ? <FundManagerFirstLoginGuide /> : a.guide === "sign-operating-agreement" ? <SignOperatingAgreementGuide /> : (
        <article className="mx-auto max-w-3xl space-y-6 px-4 pb-10 md:px-8">
          <h1 className="text-2xl font-semibold text-foreground">{a.title}</h1>
          <p className="text-muted-foreground">{a.summary}</p>
          {a.sections.map((s, i) => (
            <section key={i} className="space-y-3">
              {s.heading ? <h2 className="text-lg font-semibold text-foreground">{s.heading}</h2> : null}
              {s.paragraphs?.map((p, j) => <p key={j} className="leading-relaxed text-foreground">{p}</p>)}
              {s.steps ? <ol className="list-decimal space-y-2 pl-5 text-foreground">{s.steps.map((st, j) => <li key={j}>{st}</li>)}</ol> : null}
            </section>
          ))}
          <p className="text-xs text-muted-foreground">Updated {a.updated}</p>
        </article>
      )}
    </div>
  );
}
