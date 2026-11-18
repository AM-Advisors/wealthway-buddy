/**
 * Pure Report Cards rules: where the service is on (whole client or one fund),
 * grade change alerts, figures to check, side-by-side comparison, the investor
 * progress funnel, access requests and download rows. No reads or writes here.
 */
import { GRADES, type AssessmentMetric } from './report-card-model';

export const REPORT_CARDS_SERVICE_KEY = 'report_cards';
export const SWING_POINTS = 20;
export const MAX_ACCESS_DAYS = 30;

export type ServiceRow = { client_id: string; offering_id: string | null; service_key: string; status: string; effective_date?: string | null; termination_date?: string | null };
export type Coverage = 'fund_add_on' | 'standalone' | null;

function live(r: ServiceRow, today: string) {
  return r.service_key === REPORT_CARDS_SERVICE_KEY && r.status === 'included'
    && (!r.effective_date || r.effective_date <= today) && (!r.termination_date || r.termination_date > today);
}

/**
 * A fund is covered by its own add-on, or by the client's standalone (whole-client) service.
 * A client record is covered only by the standalone service.
 */
export function reportCardsCoverage(rows: ServiceRow[], subject: { clientId: string | null; offeringId: string | null }, today: string): Coverage {
  if (!subject.clientId) return null;
  const on = rows.filter((r) => r.client_id === subject.clientId && live(r, today));
  if (subject.offeringId && on.some((r) => r.offering_id === subject.offeringId)) return 'fund_add_on';
  if (on.some((r) => r.offering_id === null)) return 'standalone';
  return null;
}

export const COVERAGE_LABEL: Record<'fund_add_on' | 'standalone', string> = { fund_add_on: 'Fund add-on', standalone: 'Whole client' };

export type CardLite = {
  id: string; kind: string; subject_type: string; subject_id: string; subjectLabel?: string | undefined;
  period_start: string; period_end: string; created_at: string; status: string; supersedes_id?: string | null;
  grade: { grade: string; score: number | null; coverage?: number }; metrics: AssessmentMetric[];
};

/** Higher is better; null when not assessed. */
export function gradeRank(grade: string): number | null {
  const i = GRADES.indexOf(grade);
  return i < 0 ? null : GRADES.length - i;
}

const order = (a: CardLite, b: CardLite) => (a.period_end === b.period_end ? (a.created_at < b.created_at ? -1 : 1) : a.period_end < b.period_end ? -1 : 1);
const subjectKey = (c: CardLite) => `${c.kind}|${c.subject_type}|${c.subject_id}`;

export type GradeAlert = { key: string; cardId: string; previousCardId: string; subjectLabel: string; from: string; to: string; direction: 'up' | 'down'; at: string; periodEnd: string };

/** Compares each published card with the published card before it for the same subject. */
export function gradeChangeAlerts(cards: CardLite[]): GradeAlert[] {
  const groups = new Map<string, CardLite[]>();
  for (const c of cards) if (c.status === 'published' && c.kind !== 'investor') { const k = subjectKey(c); groups.set(k, [...(groups.get(k) ?? []), c]); }
  const out: GradeAlert[] = [];
  for (const list of groups.values()) {
    const sorted = [...list].sort(order);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!, next = sorted[i]!;
      const a = gradeRank(prev.grade.grade), b = gradeRank(next.grade.grade);
      if (a === null || b === null || a === b) continue;
      out.push({ key: `grade:${next.id}`, cardId: next.id, previousCardId: prev.id, subjectLabel: next.subjectLabel ?? 'Report card', from: prev.grade.grade, to: next.grade.grade, direction: b > a ? 'up' : 'down', at: next.created_at, periodEnd: next.period_end });
    }
  }
  return out.sort((x, y) => (x.at < y.at ? 1 : -1));
}

/** The latest published card for the same subject that came before this one. */
export function previousPublished(cards: CardLite[], card: CardLite): CardLite | null {
  const k = subjectKey(card);
  return cards.filter((c) => c.id !== card.id && c.status === 'published' && subjectKey(c) === k && order(c, card) < 0).sort(order).at(-1) ?? null;
}

const norm = (s: string) => s.trim().toLowerCase();

/** Plain-language checks an approver should look at; never changes a score. */
export function figureChecks(card: CardLite, previous: CardLite | null): string[] {
  const out: string[] = [];
  for (const m of card.metrics ?? []) {
    if (m.score === null || m.score === undefined) out.push(`${m.label} has no score yet.`);
    else if (!String(m.evidence ?? '').trim()) out.push(`${m.label} has a score but no evidence, so it isn't counted in the grade.`);
  }
  if (!previous) return out;
  if (!card.supersedes_id && card.period_start <= previous.period_end) out.push(`This period overlaps the previous published card (${previous.period_start} to ${previous.period_end}).`);
  for (const m of card.metrics ?? []) {
    const p = previous.metrics?.find((x) => norm(x.label) === norm(m.label));
    if (!p) continue;
    if (m.score !== null && p.score !== null && Math.abs(Number(m.score) - Number(p.score)) >= SWING_POINTS) {
      const d = Number(m.score) - Number(p.score);
      out.push(`${m.label} moved from ${p.score} to ${m.score} (${d > 0 ? '+' : ''}${d} points). Check the evidence supports it.`);
    }
    if (Number(p.weight) !== Number(m.weight)) out.push(`${m.label} weight changed from ${p.weight} to ${m.weight}.`);
  }
  for (const p of previous.metrics ?? []) if (!(card.metrics ?? []).some((m) => norm(m.label) === norm(p.label))) out.push(`${p.label} was measured last time but isn't on this card.`);
  return out;
}

export type CompareRow = { label: string; a: number | null; b: number | null; diff: number | null };
export function compareCards(a: { metrics: AssessmentMetric[] }, b: { metrics: AssessmentMetric[] }): CompareRow[] {
  const labels: string[] = [];
  for (const m of [...(a.metrics ?? []), ...(b.metrics ?? [])]) if (!labels.some((l) => norm(l) === norm(m.label))) labels.push(m.label);
  const score = (c: { metrics: AssessmentMetric[] }, l: string) => { const m = c.metrics?.find((x) => norm(x.label) === norm(l)); return m && m.score !== null && m.score !== undefined ? Number(m.score) : null; };
  return labels.map((label) => { const x = score(a, label), y = score(b, label); return { label, a: x, b: y, diff: x !== null && y !== null ? y - x : null }; });
}

export type FunnelInput = { total: number; invited: number; opened: number; started: number; verified: number; signed: number; funded: number };
export const FUNNEL_STEPS: { key: keyof Omit<FunnelInput, 'total'> | 'total'; label: string }[] = [
  { key: 'total', label: 'On the fund' },
  { key: 'invited', label: 'Invited' },
  { key: 'opened', label: 'Clicked the link' },
  { key: 'started', label: 'Started onboarding' },
  { key: 'verified', label: 'Finished identity check' },
  { key: 'signed', label: 'Signed' },
  { key: 'funded', label: 'Money received' },
];
export function funnelSteps(i: FunnelInput) {
  return FUNNEL_STEPS.map((s) => { const count = i[s.key]; return { key: s.key, label: s.label, count, pct: i.total ? Math.round((count / i.total) * 100) : 0 }; });
}

export type AccessDecision = { decision: 'approved' | 'denied' | 'revoked'; expires_at: string | null; created_at: string };
export type AccessState = 'pending' | 'active' | 'expired' | 'denied' | 'revoked';
export function accessState(decisions: AccessDecision[], now = new Date()): AccessState {
  const latest = [...decisions].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
  if (!latest) return 'pending';
  if (latest.decision !== 'approved') return latest.decision;
  return latest.expires_at && new Date(latest.expires_at) > now ? 'active' : 'expired';
}
export const ACCESS_STATE_LABEL: Record<AccessState, string> = { pending: 'Waiting for a decision', active: 'Access approved', expired: 'Access ended', denied: 'Not approved', revoked: 'Access ended' };

export function accessRequestRefusal(i: { kind: string; published: boolean; covered: boolean; alreadyReadable: boolean; state: AccessState | null }): string | null {
  if (i.kind === 'investor') return 'Investor risk assessments are private.';
  if (!i.published) return 'Only published report cards can be requested.';
  if (!i.covered) return "Report Cards isn't switched on for this fund or client.";
  if (i.alreadyReadable) return 'You can already see this report card.';
  if (i.state === 'pending') return 'You already asked for this report card. Someone will decide soon.';
  if (i.state === 'active') return 'You already have access to this report card.';
  return null;
}

export function accessDecisionError(i: { decision: string; days: number | null; deciderIsRequester: boolean; canDecide: boolean }): string | null {
  if (!i.canDecide) return 'Only a Harmonious approver or this fund’s manager can decide.';
  if (i.deciderIsRequester) return 'Someone other than the requester must decide.';
  if (i.decision === 'approved' && (!i.days || i.days < 1 || i.days > MAX_ACCESS_DAYS)) return `Access can last 1 to ${MAX_ACCESS_DAYS} days.`;
  return null;
}

export type ExportCard = {
  subject: string; kind: string; periodStart: string; periodEnd: string; status: string;
  grade: string; score: number | null; coverage: number | null; summary: string;
  metrics: { label: string; score: number | null; weight: number; evidence: string | null }[];
  risk: { profile: string; score: number; actions: string[] } | null;
};
export const KIND_LABEL: Record<string, string> = { operational: 'Operational', diligence: 'Diligence', investor: 'Investor risk' };

/** One row per measure (or one row for a card without measures), ready for spreadsheets. */
export function exportRows(cards: ExportCard[]): Record<string, string | number>[] {
  const rows: Record<string, string | number>[] = [];
  for (const c of cards) {
    const base = { Subject: c.subject, Type: KIND_LABEL[c.kind] ?? c.kind, 'Period start': c.periodStart, 'Period end': c.periodEnd, Status: c.status, Grade: c.risk ? c.risk.profile : c.grade, Score: c.risk ? c.risk.score : c.score ?? '', 'Evidence coverage %': c.coverage ?? '' };
    if (!c.metrics.length) { rows.push({ ...base, Measure: '', 'Measure score': '', Weight: '', Evidence: '' }); continue; }
    for (const m of c.metrics) rows.push({ ...base, Measure: m.label, 'Measure score': m.score ?? '', Weight: m.weight, Evidence: m.evidence ?? '' });
  }
  return rows;
}

/** Spreadsheet-safe text: cells that start like a formula are prefixed so they stay text. */
export function safeCell(v: string | number): string | number {
  if (typeof v === 'number') return v;
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}
export function toCsv(rows: Record<string, string | number>[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]!);
  const esc = (v: string | number) => { const s = String(safeCell(v)); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [headers.map(esc).join(','), ...rows.map((r) => headers.map((h) => esc(r[h] ?? '')).join(','))].join('\r\n');
}
