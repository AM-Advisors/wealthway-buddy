import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getInvestorStepHistory } from '@/lib/investor-step-history.functions';

/** Read-only: who completed or changed each profile and investment step. */
export function InvestorStepHistory({ offeringId, onboardingId }: { offeringId: string; onboardingId?: string }) {
  const load = useServerFn(getInvestorStepHistory);
  const q = useQuery({ queryKey: ['investor-step-history', offeringId, onboardingId ?? 'all'], queryFn: () => load({ data: { offeringId, ...(onboardingId ? { onboardingId } : {}) } }) });
  const [investor, setInvestor] = useState('all'), [kind, setKind] = useState('all');
  const rows = useMemo(() => (q.data?.entries ?? []).filter((e) => (investor === 'all' || e.onboardingId === investor) && (kind === 'all' || e.kind === kind)), [q.data, investor, kind]);
  const nameOf = (id: string | null) => q.data?.investors.find((i) => i.id === id)?.name ?? '';
  return (
    <Card><CardHeader><CardTitle className="text-base">Record history</CardTitle><p className="text-xs text-muted-foreground">Who completed or changed each profile and investment step. Read-only.</p></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {q.isPending ? <Skeleton className="h-24 w-full" /> : q.isError ? <p className="text-destructive">History couldn't load.</p> : <>
          <div className="flex flex-wrap gap-2">
            {!onboardingId ? <select aria-label="Investor" className="h-9 rounded-md border bg-background px-2" value={investor} onChange={(e) => setInvestor(e.target.value)}><option value="all">All investors</option>{q.data.investors.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select> : null}
            <select aria-label="Type" className="h-9 rounded-md border bg-background px-2" value={kind} onChange={(e) => setKind(e.target.value)}><option value="all">All</option><option value="step">Investment steps</option><option value="profile">Profile</option><option value="change">Changes</option></select>
          </div>
          {rows.length === 0 ? <p className="text-muted-foreground">Nothing recorded yet.</p> : <ul className="divide-y">{rows.map((e) => (
            <li key={e.id} className="py-2">
              <div className="flex flex-wrap justify-between gap-2"><b>{e.label}{!onboardingId ? ` · ${nameOf(e.onboardingId)}` : ''}</b><span className="text-xs text-muted-foreground">{new Date(e.at).toLocaleString()}</span></div>
              <p className="text-xs text-muted-foreground">By {e.who}{e.before || e.after ? ` · ${e.before ?? '(empty)'} → ${e.after ?? '(empty)'}` : ''}</p>
            </li>))}</ul>}
        </>}
      </CardContent></Card>
  );
}
