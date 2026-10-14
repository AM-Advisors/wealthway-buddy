import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getInvestorFundPortal } from "@/lib/my-funds.functions";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "subscription", label: "Subscription" },
  { id: "documents", label: "Documents" },
  { id: "tax", label: "Tax forms" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export const Route = createFileRoute("/_authenticated/my-funds/$fundId")({
  head: () => ({
    meta: [
      { title: "Your fund - Harmonious" },
      { name: "description", content: "Your fund, subscription, documents and tax forms in one place." },
      { property: "og:title", content: "Your fund - Harmonious" },
      { property: "og:description", content: "Your investor view of a fund on Harmonious." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } =>
    TABS.some((t) => t.id === s["tab"]) ? { tab: s["tab"] as Tab } : {},
  component: InvestorFundPage,
});

const money = (c: number | null | undefined) => (c == null ? "—" : `$${Math.round(c / 100).toLocaleString("en-US")}`);
const human = (s: string | null | undefined) => (s ? s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "—");
const day = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-background">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium">{value}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

function InvestorFundPage() {
  const { fundId } = Route.useParams();
  const { tab = "overview" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const load = useServerFn(getInvestorFundPortal);
  const q = useQuery({ queryKey: ["investor-fund-portal", fundId], queryFn: () => load({ data: { offeringId: fundId } }), retry: false });

  if (q.isLoading) return <div className="mx-auto max-w-6xl space-y-3 p-6">{[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />)}</div>;
  if (q.error) return (
    <div className="mx-auto max-w-6xl space-y-3 p-6">
      <p className="text-sm text-destructive">{(q.error as Error).message}</p>
      <Button variant="outline" size="sm" onClick={() => q.refetch()}>Try again</Button>
    </div>
  );
  const v = q.data!;
  const committed = v.subscriptions.reduce((a, s) => a + (s.commitmentCents ?? 0), 0);
  const funded = v.subscriptions.reduce((a, s) => a + (s.fundedCents ?? 0), 0);

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
        <div>
          <Link to="/my-funds" className="text-xs text-muted-foreground hover:underline">← My Funds</Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{v.fund.name}</h1>
          <p className="text-sm text-muted-foreground">{[v.fund.legalName, human(v.fund.fundType)].filter((x) => x && x !== "—").join(" · ")}</p>
        </div>

        <div role="tablist" className="flex items-center gap-1 overflow-x-auto border-b pb-2">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
              onClick={() => navigate({ search: { tab: t.id }, replace: true })}
              className={cn("shrink-0 rounded-md border px-3.5 py-1.5 text-sm font-medium transition-colors", tab === t.id ? "border-border bg-muted text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {t.label}{t.id === "documents" && v.documents.length ? ` (${v.documents.length})` : t.id === "tax" && v.tax.length ? ` (${v.tax.length})` : ""}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="space-y-4">
            <Section title="Your investment">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Field label="Committed" value={money(committed)} />
                <Field label="Funded" value={money(funded)} />
                <Field label="Subscriptions" value={v.subscriptions.length} />
                <Field label="Documents" value={v.documents.length + v.tax.length} />
              </div>
            </Section>
            <Section title="About the fund">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Field label="Fund type" value={human(v.fund.fundType)} />
                <Field label="Entity type" value={human(v.fund.entityType)} />
                <Field label="Minimum commitment" value={money(v.fund.minInvestmentCents)} />
                <Field label="Legal name" value={v.fund.legalName ?? "—"} />
              </div>
              {v.fund.summary && <p className="mt-4 text-sm text-muted-foreground">{v.fund.summary}</p>}
            </Section>
          </div>
        )}

        {tab === "subscription" && (
          <Section title="Your subscription">
            {v.subscriptions.length === 0 ? <Empty text="No subscription on record for this fund yet." /> : (
              <div className="divide-y">
                {v.subscriptions.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="space-y-1">
                      <div className="text-sm font-medium">{s.profile ?? "Investment"}</div>
                      <div className="text-xs text-muted-foreground">Commitment {money(s.commitmentCents)} · Funded {money(s.fundedCents)} · Started {day(s.startedAt)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{human(s.stage)}</Badge>
                      <Button asChild size="sm" variant="outline"><Link to="/investment/$onboardingId" params={{ onboardingId: s.id }}>Open</Link></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {tab === "documents" && (
          <Section title="Documents" action={<Link to="/documents" className="text-xs text-primary hover:underline">Open to download</Link>}>
            {v.documents.length === 0 ? <Empty text="No documents have been shared with you for this fund yet." /> : (
              <div className="divide-y">
                {v.documents.map((d) => (
                  <div key={`${d.source}-${d.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div>
                      <div className="text-sm font-medium">{d.name}</div>
                      <div className="text-xs text-muted-foreground">{human(d.kind)} · {d.source === "you" ? "Uploaded by you" : "From the fund"} · {day(d.date)}</div>
                    </div>
                    {d.status && <Badge variant="outline">{human(d.status)}</Badge>}
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {tab === "tax" && (
          <Section title="Tax forms" action={<Link to="/tax" className="text-xs text-primary hover:underline">Open to download</Link>}>
            {v.tax.length === 0 ? <Empty text="No tax forms are available for this fund yet." /> : (
              <div className="divide-y">
                {v.tax.map((t) => (
                  <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div>
                      <div className="text-sm font-medium">{t.name}</div>
                      <div className="text-xs text-muted-foreground">{t.year ? `Tax year ${t.year}` : "Tax year —"} · {day(t.date)}</div>
                    </div>
                    <Badge variant="outline">{t.form}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}
      </div>
    </div>
  );
}
