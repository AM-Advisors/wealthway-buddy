/** Pure normaliser for investor profile + investment step history. */
export const STEP_LABELS: Record<string, string> = {
  investor_record_created: 'Investor added', onboarding_started: 'Investment started', deal_reviewed: 'Reviewed the deal',
  questionnaire_submitted: 'About You submitted', amount_requested: 'Investment amount submitted', verification_completed: 'Verification complete',
  signature_completed: 'Documents signed', investor_reports_funds_sent: 'Investor reported funds sent', approved_to_fund: 'Approved to fund',
  funding_released: 'Funding released', accepted: 'Accepted', closed: 'Closed', removed: 'Removed', investor_confirmed: 'Investor confirmed',
  personal_link_created: 'Personal link created', personal_link_emailed: 'Personal link emailed', personal_link_copied: 'Personal link copied',
  tax_form_uploaded: 'Tax form uploaded', w9_uploaded: 'W-9 uploaded',
};
export const stepLabel = (e: string) => STEP_LABELS[e] ?? e.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export type RawStep = { id: string; at: string; onboardingId: string | null; kind: 'step' | 'change' | 'profile'; event: string; actorId: string | null; actorRole?: string | null; before?: unknown; after?: unknown };
export type StepEntry = { id: string; at: string; onboardingId: string | null; kind: RawStep['kind']; label: string; who: string; before: string | null; after: string | null };

const show = (v: unknown) => (v === null || v === undefined || v === '' ? null : (typeof v === 'string' ? v : JSON.stringify(v)).slice(0, 140));

/** Managers see Harmonious staff as "Harmonious team"; missing actors are never guessed. */
export function normaliseSteps(raw: RawStep[], ctx: { viewerIsStaff: boolean; staffIds: Set<string>; investorIds: Set<string>; names: Map<string, string> }): StepEntry[] {
  return raw.map((r) => {
    let who = 'Not recorded';
    if (r.actorId) {
      if (ctx.staffIds.has(r.actorId) || r.actorRole === 'harmonious') who = ctx.viewerIsStaff ? `${ctx.names.get(r.actorId) ?? 'Staff member'} (Harmonious)` : 'Harmonious team';
      else if (ctx.investorIds.has(r.actorId)) who = `${ctx.names.get(r.actorId) ?? 'Investor'} (investor)`;
      else who = `${ctx.names.get(r.actorId) ?? 'Fund manager'} (fund manager)`;
    }
    const label = r.kind === 'change' ? `${r.event.replace(/_/g, ' ')} changed` : stepLabel(r.event);
    return { id: r.id, at: r.at, onboardingId: r.onboardingId, kind: r.kind, label, who, before: show(r.before), after: show(r.after) };
  }).sort((a, b) => b.at.localeCompare(a.at));
}

/** Server-side scope rule: staff see everything; managers only funds they manage. */
export function canReadFundHistory(actor: { isStaff: boolean; managedOfferingIds: string[] }, offeringId: string) {
  return actor.isStaff || actor.managedOfferingIds.includes(offeringId);
}
