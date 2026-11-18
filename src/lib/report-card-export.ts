/**
 * Browser-only file builders for Report Card downloads. The content comes from
 * prepareReportCardDownload, which has already checked access and recorded the download.
 */
import { KIND_LABEL, compareCards, exportRows, safeCell, toCsv, type ExportCard } from './report-card-insights-model';

export type DownloadFormat = 'pdf' | 'csv' | 'xlsx' | 'json';
export const FORMAT_LABEL: Record<DownloadFormat, string> = { pdf: 'PDF report', csv: 'Spreadsheet (CSV)', xlsx: 'Excel', json: 'Data file' };

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const stamp = () => new Date().toISOString().slice(0, 10);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'report-card';

function compareRows(a: ExportCard, b: ExportCard) {
  const head = { Measure: 'Overall grade', [a.subject]: a.grade, [`${b.subject} `]: b.grade, Difference: a.score !== null && b.score !== null ? b.score - a.score : '' } as Record<string, string | number>;
  return [head, ...compareCards(a as any, b as any).map((r) => ({ Measure: r.label, [a.subject]: r.a ?? '', [`${b.subject} `]: r.b ?? '', Difference: r.diff ?? '' }))];
}

async function pdf(cards: ExportCard[], title: string, compare: boolean) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 48;
  let y = M;
  const need = (h: number) => { if (y + h > H - M) { doc.addPage(); y = M; } };
  const text = (s: string, size = 10, bold = false, color: [number, number, number] = [34, 31, 32]) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color);
    for (const line of doc.splitTextToSize(s, W - M * 2) as string[]) { need(size + 4); doc.text(line, M, y); y += size + 4; }
  };
  text('Harmonious', 10, true, [93, 198, 209]);
  text(title, 18, true, [20, 38, 71]); y += 6;
  text(`Prepared ${new Date().toLocaleDateString('en-US')}. Grades use recorded evidence only.`, 9, false, [110, 110, 110]); y += 8;
  if (compare && cards.length === 2) {
    for (const r of compareRows(cards[0]!, cards[1]!)) text(Object.values(r).map(String).join('   ·   '), 10, r['Measure'] === 'Overall grade');
  } else for (const c of cards) {
    need(80); doc.setDrawColor(20, 38, 71); doc.line(M, y, W - M, y); y += 16;
    text(c.subject, 14, true, [20, 38, 71]);
    text(`${KIND_LABEL[c.kind] ?? c.kind} · ${c.periodStart} to ${c.periodEnd} · ${c.status}`, 9, false, [110, 110, 110]);
    text(c.risk ? `Profile: ${c.risk.profile} (${c.risk.score} / 100)` : `Grade: ${c.grade}${c.score !== null ? ` (${c.score} / 100)` : ''}${c.coverage !== null ? ` · evidence coverage ${c.coverage}%` : ''}`, 12, true);
    if (c.summary) { y += 2; text(c.summary, 10); }
    if (c.metrics.length) { y += 4; text('Measures', 11, true); for (const m of c.metrics) { text(`${m.label}: ${m.score ?? 'No score'} / 100 · weight ${m.weight}`, 10); if (m.evidence) text(`Evidence: ${m.evidence}`, 9, false, [110, 110, 110]); } }
    if (c.risk?.actions.length) { y += 4; text('Suggested next steps', 11, true); for (const a of c.risk.actions) text(`• ${a}`, 10); }
    y += 10;
  }
  return doc.output('blob');
}

export async function buildDownload(format: DownloadFormat, cards: ExportCard[], opts: { compare?: boolean } = {}) {
  const compare = Boolean(opts.compare && cards.length === 2);
  const title = compare ? `${cards[0]!.subject} compared with ${cards[1]!.subject}` : cards.length === 1 ? `${cards[0]!.subject} Report Card` : 'Report Cards';
  const base = `harmonious-${compare ? 'comparison' : slug(cards.length === 1 ? cards[0]!.subject : 'report-cards')}-${stamp()}`;
  const rows = compare ? compareRows(cards[0]!, cards[1]!) : exportRows(cards);
  if (format === 'json') return save(new Blob([JSON.stringify({ title, generatedAt: new Date().toISOString(), cards }, null, 2)], { type: 'application/json' }), `${base}.json`);
  if (format === 'csv') return save(new Blob(['\ufeff' + toCsv(rows)], { type: 'text/csv;charset=utf-8' }), `${base}.csv`);
  if (format === 'xlsx') {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, safeCell(v)])))), compare ? 'Comparison' : 'Report Cards');
    if (!compare) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cards.map((c) => ({ Subject: safeCell(c.subject), Type: KIND_LABEL[c.kind] ?? c.kind, 'Period start': c.periodStart, 'Period end': c.periodEnd, Status: c.status, Grade: c.risk ? c.risk.profile : c.grade, Score: c.risk ? c.risk.score : c.score ?? '', Summary: safeCell(c.summary) }))), 'Summary');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return save(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${base}.xlsx`);
  }
  return save(await pdf(cards, title, compare), `${base}.pdf`);
}
