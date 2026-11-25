import { bandForRaise, spvTxnQuoteKey, type SpvBand } from "./spv-transaction-pricing";
import { SIDE_LETTER_FEE_CENTS } from "./side-letter-fee";
import { PRICING_AUTHORITY_ROLES } from "./commercial-pricing";
import { countsInFundTotals, investmentAmountCents } from './investment-amounts';
import { isEmployeeEmail } from './test-investor';

type Row = Record<string, any>;
export type CloseFeeLine = { key: string; label: string; unitCents: number | null; quantity: number; cents: number | null; cadence: string; scope: string; source: string; reference: string | null; issue: string | null };
export type CloseHarmoniousFees = { raiseCents: number | null; lines: CloseFeeLine[]; sideLetterPaidCount: number; oneTimeCents: number; needsReview: boolean };
export function closeFeeRaise(rows: Row[]): number | null {
  const live = rows.filter(r => countsInFundTotals(r) && !isEmployeeEmail(r['persons']?.email) && !['declined','cancelled','rejected','withdrawn'].includes(r['stage']));
  const amounts = live.map(investmentAmountCents);
  return amounts.length && amounts.every(a => a !== null && Number.isSafeInteger(a) && a >= 0) ? amounts.reduce<number>((s,a) => s + (a ?? 0), 0) : null;
}
/** Estimate only. Active exact-scope agreements and approved prices control; missing prices are never zero. */
export function closeHarmoniousFees(input: { fundId: string; today: string; isSpv: boolean; raiseCents: number | null; bands: SpvBand[]; pricing: Row[]; roles: Row[]; catalog: Row[]; selections: Row[]; entitlements: Row[]; agreementLines: Row[]; snapshots: Row[]; snapshotLines: Row[]; sideLetterCount: number; sideLetterPaidCount: number }): CloseHarmoniousFees {
  const approved = new Set(input.roles.filter(r => (PRICING_AUTHORITY_ROLES as readonly string[]).includes(r['role'])).map(r => r['user_id']));
  const scopeOk = (r: Row) => !r['offering_id'] || r['offering_id'] === input.fundId;
  const prices = input.pricing.filter(r => scopeOk(r) && !r['superseded_at'] && r['approved_at'] && approved.has(r['approved_by']) && (!r['effective_date'] || r['effective_date'] <= input.today) && (!r['expires_on'] || r['expires_on'] >= input.today));
  const keys = new Set<string>(['side_letters']);
  const band = input.isSpv && input.raiseCents !== null ? bandForRaise(input.bands, input.raiseCents / 100) : null;
  const contractedSpvKeys = [...new Set(input.agreementLines.filter(scopeOk).map(r => r['service_key']).filter(k => typeof k === 'string' && k.startsWith('SPV_TXN:')))];
  const spvKey = input.isSpv ? contractedSpvKeys.length === 1 ? String(contractedSpvKeys[0]) : band ? spvTxnQuoteKey(band.id) : 'SPV_TXN:unresolved' : null;
  if (spvKey) keys.add(spvKey);
  for (const r of [...input.entitlements, ...input.selections]) {
    const key = r['service_key'];
    if (scopeOk(r) && ['active', 'included', 'contracted'].includes(r['status']) && (!r['effective_date'] || r['effective_date'] <= input.today) && (!r['termination_date'] || r['termination_date'] >= input.today) && typeof key === 'string' && !key.startsWith('SPV_TXN:')) keys.add(key);
  }
  for (const r of input.agreementLines) if (scopeOk(r) && typeof r['service_key'] === 'string' && !r['service_key'].startsWith('SPV_TXN:')) keys.add(r['service_key']);
  const lines = [...keys].map((key): CloseFeeLine => {
    const agreements = input.agreementLines.filter(r => scopeOk(r) && r['service_key'] === key);
    const candidates = prices.filter(r => r['service_key'] === key).sort((a,b) => Number(!!b['offering_id']) - Number(!!a['offering_id']) || String(b['effective_date'] ?? '').localeCompare(String(a['effective_date'] ?? '')));
    const p = candidates[0];
    const sameScope = candidates.filter(r => !!r['offering_id'] === !!p?.['offering_id'] && r['effective_date'] === p?.['effective_date']);
    const snapshot = input.snapshots.find(r => r['offering_id'] === input.fundId && r['status'] === 'approved' && !r['superseded_at']);
    const frozen = snapshot ? input.snapshotLines.find(r => r['snapshot_id'] === snapshot['id'] && r['service_key'] === key && !r['pass_through']) : null;
    const standard = input.catalog.find(r => r['service_key'] === key && !r['pass_through']);
    const a = agreements[0];
    const entitled = input.entitlements.find(r => scopeOk(r) && r['service_key'] === key && ['active','included'].includes(r['status']));
    const included = entitled?.['status'] === 'included' && !a && !p && !frozen;
    const unit = included ? 0 : a ? a['unit_cents'] ?? (a['amount_cents'] == null ? null : Number(a['amount_cents']) / Number(a['quantity'] ?? 1)) : p ? p['contracted_cents'] : frozen ? frozen['final_cents'] : key === spvKey ? (band?.fee_usd == null ? null : Math.round(Number(band.fee_usd) * 100)) : standard?.['amount_cents'] ?? (key === 'side_letters' ? SIDE_LETTER_FEE_CENTS : null);
    let issue: string | null = agreements.length > 1 ? 'Conflicting agreement lines need review.' : new Set(sameScope.map(r => r['contracted_cents'])).size > 1 ? 'Conflicting client prices need review.' : null;
    if (unit == null || !Number.isSafeInteger(Number(unit)) || Number(unit) < 0) issue ??= 'Price needs Harmonious review.';
    const quantity = key === 'side_letters' ? Math.max(0, input.sideLetterCount - input.sideLetterPaidCount) : Number(a?.['quantity'] ?? 1);
    const cadence = included ? 'included' : key === 'side_letters' ? 'per letter' : key === spvKey ? 'one_time' : a?.['billing_frequency'] ?? a?.['pricing_model'] ?? p?.['pricing_model'] ?? frozen?.['pricing_model'] ?? standard?.['pricing_model'] ?? 'Needs billing basis';
    if (!Number.isSafeInteger(quantity) || quantity < 0 || !Number.isSafeInteger(Number(unit) * quantity)) issue ??= 'Quantity needs Harmonious review.';
    if (key === spvKey && contractedSpvKeys.length > 1) issue = 'Conflicting SPV agreements need review.';
    return { key, label: key === spvKey ? 'Harmonized SPV' : key === 'side_letters' ? 'Side letters' : a?.['label'] ?? p?.['label'] ?? frozen?.['label'] ?? standard?.['label'] ?? key, unitCents: issue ? null : Number(unit), quantity, cents: issue ? null : Number(unit) * quantity, cadence, scope: (a ?? p ?? entitled)?.['offering_id'] ? 'This fund' : key === 'side_letters' || key === spvKey ? 'This fund' : 'Client service', source: included ? 'Included with package' : a ? 'Signed agreement' : p ? 'Approved client price' : frozen ? 'Approved fund price' : 'Standard fee', reference: a?.['source_id'] ?? p?.['id'] ?? frozen?.['id'] ?? standard?.['id'] ?? (key === spvKey ? band?.id ?? null : null), issue };
  });
  return { raiseCents: input.raiseCents, lines, sideLetterPaidCount: input.sideLetterPaidCount, oneTimeCents: lines.filter(l => ['one_time', 'per letter', 'transaction', 'per_request'].includes(l.cadence)).reduce((s,l) => s + (l.cents ?? 0), 0), needsReview: lines.some(l => l.cents === null) };
}