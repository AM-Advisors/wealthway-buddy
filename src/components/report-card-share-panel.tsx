import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createReportCardShare, listReportCardShares, revokeReportCardShare } from '@/lib/portfolio-report-cards.functions';

export function ShareLinksPanel({ cardId }: { cardId: string }) {
  const [open, setOpen] = useState(false), [days, setDays] = useState('14'), [label, setLabel] = useState(''), [fresh, setFresh] = useState<string | null>(null);
  const list = useServerFn(listReportCardShares), create = useServerFn(createReportCardShare), revoke = useServerFn(revokeReportCardShare), qc = useQueryClient();
  const q = useQuery({ queryKey: ['report-card-shares', cardId], queryFn: () => list({ data: { cardId } }), enabled: open });
  const make = async () => {
    try {
      const r = await create({ data: { cardId, days: Number(days), ...(label.trim() ? { label: label.trim() } : {}) } });
      const url = `${window.location.origin}/report-card-share/${r.token}`;
      setFresh(url); await navigator.clipboard?.writeText(url).catch(() => undefined);
      toast.success('Share link created and copied'); setLabel(''); qc.invalidateQueries({ queryKey: ['report-card-shares', cardId] });
    } catch (e) { toast.error((e as Error).message); }
  };
  if (!open) return <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Share</Button>;
  return (
    <div className="w-full space-y-3 rounded-md border p-3">
      <p className="text-sm font-medium">Share links</p>
      <p className="text-xs text-muted-foreground">Recipients see the grade, summary and measure scores only — never evidence files. Every view is logged. Links expire and can be revoked.</p>
      <div className="grid gap-2 sm:grid-cols-[2fr_1fr_auto]">
        <Input aria-label="Who is this for" placeholder="Who is this for (optional)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <select aria-label="Expires after" className="h-10 rounded-md border bg-background px-3 text-sm" value={days} onChange={(e) => setDays(e.target.value)}>
          {['1', '7', '14', '30'].map((d) => <option key={d} value={d}>{d} day{d === '1' ? '' : 's'}</option>)}
        </select>
        <Button size="sm" onClick={make}>Create link</Button>
      </div>
      {fresh ? <p className="break-all text-xs">Copy now — this link is shown only once: <span className="font-mono">{fresh}</span></p> : null}
      {(q.data?.links ?? []).map((l) => (
        <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-sm">
          <span>{l.label || 'Unlabeled link'} · expires {new Date(l.expiresAt).toLocaleDateString()} · {l.views} view{l.views === 1 ? '' : 's'}</span>
          <span className="flex items-center gap-2"><Badge variant={l.state === 'active' ? 'default' : 'secondary'}>{l.state}</Badge>
            {l.state === 'active' ? <Button size="sm" variant="ghost" onClick={async () => { try { await revoke({ data: { id: l.id } }); toast.success('Link revoked'); qc.invalidateQueries({ queryKey: ['report-card-shares', cardId] }); } catch (e) { toast.error((e as Error).message); } }}>Revoke</Button> : null}
          </span>
        </div>
      ))}
    </div>
  );
}
