import { RISK_QUESTIONS } from './investor-risk-questions';
export { RISK_QUESTIONS };
export type AssessmentMetric = { label: string; score: number | null; weight: number; evidence: string };
export const DEFAULT_THRESHOLDS = [95,90,87,83,80,77,73,70,67,60];
const GRADES = ['A+','A','A−','B+','B','B−','C+','C','C−','D','F'];
export function assessmentGrade(metrics: AssessmentMetric[], thresholds = DEFAULT_THRESHOLDS) {
  const eligible = metrics.filter(m => m.score !== null && Number.isFinite(m.score) && m.score >= 0 && m.score <= 100 && m.weight > 0 && m.evidence.trim());
  const weight = eligible.reduce((s,m) => s + m.weight,0);
  const score = weight ? Math.round(eligible.reduce((s,m) => s + Number(m.score)*m.weight,0)/weight) : null;
  return { score, grade: score === null ? 'Not assessed' : GRADES[thresholds.findIndex(t => score >= t) < 0 ? 10 : thresholds.findIndex(t => score >= t)], coverage: metrics.length ? Math.round(eligible.length/metrics.length*100) : 0 };
}
export function riskAssessment(answers: Record<string,number>) {
  if (RISK_QUESTIONS.some(q => !q.options.some(o => o.value === answers[q.id]))) throw new Error('Answer every risk question.');
  const score = Math.round(RISK_QUESTIONS.reduce((s,q) => s+(answers[q.id]??0),0)/(RISK_QUESTIONS.length*4)*100);
  const profile = score < 40 ? 'Conservative' : score < 60 ? 'Balanced' : score < 80 ? 'Growth' : 'Aggressive';
  const actions = ['Review each fund’s strategy, fees and lock-up terms with your adviser before committing.'];
  if ((answers["liquidity"]??0) <= 2 || answers["horizon"] === 1) actions.push('Review near-term cash needs against each investment’s redemption and lock-up terms.');
  if ((answers["experience"]??0) <= 2) actions.push('Discuss private-market risks and possible losses with a qualified adviser.');
  if ((answers["concentration"]??0) <= 2) actions.push('Review single-fund and single-manager concentration across your full portfolio.');
  if ((answers["esg"]??0) >= 3) actions.push('Ask managers for evidence of their stated values-based investment policies.');
  return { score, profile, actions };
}
export function canReadAssessment(input: { kind: string; published: boolean; staff: boolean; manager: boolean; owner: boolean; investorVisible: boolean; diligenceAccess: boolean; ndaAccepted: boolean }) {
  if (input.kind === 'investor') return input.owner;
  if (input.kind === 'diligence') return input.manager || (input.published && input.investorVisible && input.diligenceAccess && input.ndaAccepted);
  return input.staff || (input.manager && input.published);
}
export function publicationError(input: { sameAuthor: boolean; override: boolean; evidenceCount: number; metrics: AssessmentMetric[] }) {
  if(input.sameAuthor && !input.override) return 'A different approver is required.';
  if(!input.evidenceCount || assessmentGrade(input.metrics).score === null) return 'Attach evidence and record at least one supported metric before publication.';
  return null;
}
