import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getFundChanges } from "@/lib/fund-changes.functions";

export function FundChangeSummary({ fundId, onNavigate }: { fundId: string; onNavigate: (tab: string) => void }) {
  const load = useServerFn(getFundChanges);
  const q = useQuery({ queryKey: ["fund-changes", fundId], queryFn: () => load({ data: { fundId } }), refetchInterval: 60_000 });
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading fund requests…</p>;
  if (q.error) return <div className="flex flex-wrap items-center gap-2 text-sm text-destructive"><p>{q.error.message}</p><Button size="sm" variant="outline" onClick={() => q.refetch()}>Retry</Button></div>;
  if (!q.data || (!q.data.pending.length && !q.data.updates.length)) return null;
  return <section aria-label="Fund requests and updates" className="space-y-2 border-y py-3">
    <h3 className="flex items-center gap-2 text-sm font-semibold"><Bell className="size-4" /> Fund requests & updates <Badge variant="secondary">{q.data.pending.length} open</Badge></h3>
    <ul className="divide-y">{q.data.pending.map(r => <li key={r.id} className="flex flex-wrap items-center gap-2 py-2"><Clock className="size-4 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{r.title}</p><p className="text-xs text-muted-foreground">{r.status} · {new Date(r.at).toLocaleDateString()}</p></div><Button size="sm" variant="outline" onClick={() => onNavigate(r.tab)}>Review</Button></li>)}</ul>
    {q.data.updates.length > 0 && <details><summary className="cursor-pointer text-xs text-muted-foreground">Recent updates ({q.data.updates.length})</summary><ul className="space-y-1 pt-2 text-xs">{q.data.updates.map(r => <li key={r.id}>{r.title} · {new Date(r.at).toLocaleString()}</li>)}</ul></details>}
  </section>;
}