import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { decideDuplicateFlagFn, listDuplicateFlagsFn, sweepDuplicatesFn } from '@/lib/person-merge.functions';

/** Harmonious-only: people that may be the same person. Merges keep everything; nothing is deleted. */
export function PossibleDuplicates() {
  const load = useServerFn(listDuplicateFlagsFn), decide = useServerFn(decideDuplicateFlagFn), sweep = useServerFn(sweepDuplicatesFn), qc = useQueryClient();
  const q = useQuery({ queryKey: ['person-duplicates'], queryFn: () => load(), retry: false });
  const refresh = () => qc.invalidateQueries({ queryKey: ['person-duplicates'] });
  const act = async (id: string, action: 'merge' | 'dismiss', keepPersonId?: string) => {
    try { await decide({ data: { id, action, ...(keepPersonId ? { keepPersonId } : {}) } }); toast.success(action === 'merge' ? 'Records merged' : 'Marked as different people'); refresh(); } catch (e) { toast.error((e as Error).message); }
  };
  if (q.isError) return null;
  return (
    <Card><CardHeader className="flex-row items-center justify-between gap-2"><div><CardTitle className="text-base">Possible duplicates</CardTitle><p className="text-xs text-muted-foreground">Exact matches (same email, name and date of birth) merge automatically. These need a decision.</p></div>
      <Button size="sm" variant="outline" onClick={async () => { try { const r = await sweep(); toast.success(`Merged ${r.merged}, flagged ${r.flagged}`); refresh(); } catch (e) { toast.error((e as Error).message); } }}>Check again</Button></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {q.isPending ? <p className="text-muted-foreground">Loading…</p> : (q.data ?? []).length === 0 ? <p className="text-muted-foreground">No possible duplicates.</p> : q.data!.map((f) => (
          <div key={f.id} className="space-y-2 rounded-md border p-3">
            <p className="text-xs text-muted-foreground">{f.reason}</p>
            <div className="grid gap-2 sm:grid-cols-2">{[f.a, f.b].map((p) => (
              <div key={p.id} className="rounded bg-muted/40 p-2"><b>{p.name}</b><p className="text-xs">{p.email ?? 'No email'} · {p.hasAccount ? 'has account' : 'no account'} · {p.investments} investment(s)</p>
                <Button size="sm" className="mt-2" onClick={() => act(f.id, 'merge', p.id)}>Merge, keep this one</Button></div>))}</div>
            <Button size="sm" variant="ghost" onClick={() => act(f.id, 'dismiss')}>Not the same person</Button>
          </div>))}
      </CardContent></Card>
  );
}
