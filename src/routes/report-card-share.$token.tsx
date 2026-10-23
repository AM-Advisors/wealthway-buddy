import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { readSharedReportCard } from '@/lib/portfolio-report-cards.functions';
import { Card, CardContent } from '@/components/ui/card';

export const Route = createFileRoute('/report-card-share/$token')({
  ssr: false,
  head: () => ({ meta: [
    { title: 'Shared Report Card | Harmonious' },
    { name: 'description', content: 'A Report Card shared with you by Harmonious.' },
    { property: 'og:title', content: 'Shared Report Card | Harmonious' },
    { property: 'og:description', content: 'A time-limited Report Card shared by Harmonious.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex' },
  ] }),
  component: SharedCard,
});

function SharedCard() {
  const { token } = Route.useParams();
  const valid = /^[0-9a-f]{64}$/.test(token);
  const q = useQuery({ queryKey: ['shared-card', token], queryFn: () => readSharedReportCard({ data: { token } }), enabled: valid, staleTime: Infinity, retry: false });
  const r: any = q.data;
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-12">
      <p className="text-sm font-medium text-primary">Harmonious</p>
      {!valid || q.isError || (r && r.state !== 'active') ? (
        <p className="text-muted-foreground">{r?.state === 'expired' ? 'This link has expired.' : 'This link is no longer available.'} Ask the person who shared it for a new one.</p>
      ) : !r ? <p className="text-muted-foreground">Loading…</p> : (
        <>
          <div><h1 className="text-3xl">{r.card.subject}</h1><p className="text-sm text-muted-foreground">Report Card · {r.card.periodStart} to {r.card.periodEnd}</p></div>
          <Card><CardContent className="flex items-end gap-4 pt-6"><span className="text-5xl font-semibold">{r.card.grade.grade}</span>{r.card.grade.score !== null ? <span className="pb-2 text-muted-foreground">{r.card.grade.score} / 100</span> : null}</CardContent></Card>
          {r.card.summary ? <p className="whitespace-pre-wrap text-sm">{r.card.summary}</p> : null}
          <div className="space-y-2">{r.card.metrics.map((m: any) => <div key={m.label} className="flex justify-between border-b py-2 text-sm"><span>{m.label}</span><span>{m.score ?? ' · '} / 100</span></div>)}</div>
          <p className="text-xs text-muted-foreground">Shared view, available until {new Date(r.expiresAt).toLocaleDateString()}. It is an assessment summary, not investment, legal or tax advice.</p>
        </>
      )}
    </main>
  );
}
