import type { SideLetterTerm } from './side-letter-model';

export const INVESTOR_TERM_FIELDS = [
  { key: 'management', label: 'Management fee', unit: '%', category: 'fee_discount', description: 'Investor management fee' },
  { key: 'carry', label: 'Carried interest', unit: '%', category: 'carry_reduction', description: 'Investor carried interest' },
  { key: 'minimum', label: 'Minimum investment', unit: 'USD', category: 'other', description: 'Investor minimum investment' },
] as const;
export type InvestorTermField = (typeof INVESTOR_TERM_FIELDS)[number];
export function matchesInvestorField(term: SideLetterTerm, field: InvestorTermField) {
  return term.description === field.description && term.category === field.category;
}
export function investorFieldValue(terms: SideLetterTerm[], field: InvestorTermField) {
  const value = terms.find(t => matchesInvestorField(t, field))?.value ?? '';
  return value.replace(/[%$,]/g, '').trim();
}
export function setInvestorField(terms: SideLetterTerm[], field: InvestorTermField, value: string, id: string): SideLetterTerm[] {
  const existing = terms.find(t => matchesInvestorField(t, field));
  const rest = terms.filter(t => !matchesInvestorField(t, field));
  if (!value.trim()) return rest;
  return [...rest, { id: existing?.id ?? id, category: field.category, description: field.description,
    value: field.unit === '%' ? `${value}%` : `$${value}`, applicability: existing?.applicability ?? 'This investor only' }];
}