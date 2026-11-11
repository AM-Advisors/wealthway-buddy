import { useState } from 'react';
import { useSuspenseQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Download, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { listWealthReports, getWealthReportSnapshot, publishWealthReport } from '@/lib/wealth-portfolio.functions';
import { portfolioReportCsv, portfolioReportPdf, lastCompletedQuarter, type PortfolioView } from '@/lib/wealth-portfolio-model';
import { downloadPdfDoc } from '@/lib/pdf-render';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export const wealthReportsKey = (ownerId: string | undefined) => ['wealth-reports', ownerId ?? 'me'] as const;

function saveText(text: string, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

/** Published quarterly reports. Each version is fixed when published; later corrections create a new version. */
export function WealthReportsPanel({ ownerUserId, ownerLabel, canPublish, currentView }: { ownerUserId?: string | undefined; ownerLabel: string; canPublish: boolean; currentView?: PortfolioView | undefined }) {
  const list = useServerFn(listWealthReports), get = useServerFn(getWealthReportSnapshot), publish = useServerFn(publishWealthReport), qc = useQueryClient();
  const { data: reports } = useSuspenseQuery({ queryKey: wealthReportsKey(ownerUserId), queryFn: () => list({ data: ownerUserId ? { ownerUserId } : {} }) });
  const [busy, setBusy] = useState<string | null>(null);
  const q = lastCompletedQuarter(new Date().toISOString().slice(0, 10));
  const already = reports.some(r => r.periodEnd === q.end);
  const download = async (id: string, kind: 'pdf' | 'csv') => {
    setBusy(`${id}:${kind}`);
    try {
      const r = await get({ data: { reportId: id } });
      const snap = r.snapshot as { view: PortfolioView; periodLabel: string };
      if (kind === 'pdf') await downloadPdfDoc(portfolioReportPdf(snap.view, snap.periodLabel, ownerLabel, r.version));
      else saveText(portfolioReportCsv(snap.view, snap.periodLabel), `portfolio-report-${snap.periodLabel.replace(/\s+/g, '-').toLowerCase()}-v${r.version}.csv`);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const doPublish = async () => {
    if (!window.confirm(already ? `Publish a new version of the ${q.label} report? The earlier version stays available.` : `Publish the ${q.label} report? It is fixed once published.`)) return;
    setBusy('publish');
    try { const r = await publish({ data: { periodEnd: q.end } }); toast.success(`${q.label} report published (version ${r.version})`); await qc.invalidateQueries({ queryKey: wealthReportsKey(ownerUserId) }); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="text-xl font-semibold">Quarterly reports</h3><p className="text-base text-muted-foreground">Each published report is a fixed copy. Corrections publish a new version; earlier versions stay.</p></div>
      <div className="flex flex-wrap gap-2">
        {currentView ? <Button variant="outline" onClick={() => saveText(portfolioReportCsv(currentView, `As of ${currentView.asOf}`), `portfolio-${currentView.asOf}.csv`)}><Download className="mr-2 size-4" />Current view (CSV)</Button> : null}
        {canPublish ? <Button size="lg" disabled={busy === 'publish'} onClick={() => void doPublish()}><FileText className="mr-2 size-4" />{already ? `Publish new ${q.label} version` : `Publish ${q.label} report`}</Button> : null}
      </div>
    </div>
    {!reports.length ? <p className="rounded-md border border-dashed p-6 text-base text-muted-foreground">No quarterly report published yet.{canPublish ? ` Publish ${q.label} when your figures are complete.` : ''}</p> :
      <ul className="divide-y rounded-md border">{reports.map(r => <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div><div className="text-base font-medium">{r.periodLabel} <span className="text-muted-foreground">· version {r.version}</span> {r.current ? <Badge variant="outline">Current</Badge> : <Badge variant="secondary">Replaced</Badge>}</div><p className="text-sm text-muted-foreground">Published {new Date(r.publishedAt).toLocaleDateString()}</p></div>
        <div className="flex gap-2"><Button variant="outline" disabled={busy === `${r.id}:pdf`} onClick={() => void download(r.id, 'pdf')}><Download className="mr-2 size-4" />PDF</Button><Button variant="outline" disabled={busy === `${r.id}:csv`} onClick={() => void download(r.id, 'csv')}><Download className="mr-2 size-4" />CSV</Button></div>
      </li>)}</ul>}
  </section>;
}
