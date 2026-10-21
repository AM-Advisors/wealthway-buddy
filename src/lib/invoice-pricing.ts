import { duePeriods, isFrequency } from "@/lib/invoice-schedule-model";
import { PRICING_AUTHORITY_ROLES } from "@/lib/commercial-pricing";

type Row = Record<string, any>;
export type InvoicePricingInput = {
  periodStart: string; periodEnd: string; offeringId?: string | null; sowId?: string | null;
  pricing: Row[]; entitlements: Row[]; sows: Row[]; catalog: Row[];
  snapshots: Row[]; snapshotLines: Row[]; schedules: Row[]; approverRoles: Row[];
  billedRefs: string[];
};

/** One applicable obligation per service/scope, using frozen terms before new rates. */
export function invoiceRateLines(input: InvoicePricingInput) {
  const { periodStart, periodEnd, offeringId, sowId } = input;
  if (periodEnd < periodStart) throw new Error("The invoice period ends before it starts.");
  const sows = input.sows.filter(s => s.status === "active" && (!sowId || s.id === sowId));
  if (sowId && !sows.length) throw new Error("Choose an active statement of work for this client.");
  const activeSows = new Set(sows.map(s => s.id));
  const approved = new Set(input.approverRoles.filter(r => (PRICING_AUTHORITY_ROLES as readonly string[]).includes(r.role)).map(r => r.user_id));
  const billed = new Set(input.billedRefs);
  const seen = new Set<string>();
  const lines: Row[] = [];
  let skipped = 0;
  for (const entitlement of input.entitlements) {
    const fund = entitlement.offering_id ?? null;
    const key = entitlement.service_key;
    if (!key || !["active", "included"].includes(entitlement.status) ||
      (offeringId && fund && fund !== offeringId) ||
      (entitlement.effective_date && entitlement.effective_date > periodStart) ||
      (entitlement.termination_date && entitlement.termination_date < periodStart)) continue;
    const scope = fund ?? offeringId ?? null;
    const identity = `${scope ?? "client"}:${key}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    // Scheduled service obligations are billed only through their existing period identity.
    if (input.schedules.some(s => s.service_key === key && (!sowId || s.sow_id === sowId))) { skipped++; continue; }
    const snapshot = scope ? input.snapshots.find(s => s.offering_id === scope && !s.superseded_at && s.created_at?.slice(0, 10) <= periodStart) : null;
    if (snapshot && snapshot.status !== "approved") throw new Error("This fund's pricing still needs approval before invoicing.");
    const frozen = snapshot ? input.snapshotLines.find(l => l.snapshot_id === snapshot.id && l.service_key === key && !l.pass_through) : null;
    const applicableSows = sows.filter(s => !entitlement.sow_id || s.id === entitlement.sow_id);
    const contracted = applicableSows.flatMap(s => (Array.isArray(s.generated_lines) ? s.generated_lines : []).map((l: Row, index: number) => ({ ...l, sow: s, index })))
      .filter(l => (l.service_key ?? l.serviceKey) === key && (!l.offering_id || l.offering_id === scope) && (!l.first_bill_on || l.first_bill_on <= periodStart));
    if (contracted.length > 1) throw new Error(`More than one active agreement prices ${key}. Reconcile the agreements before invoicing.`);
    const contract = contracted[0];
    const candidates = input.pricing.filter(p => p.service_key === key && !p.superseded_at &&
      (!p.offering_id || p.offering_id === scope) && (!p.sow_id || activeSows.has(p.sow_id)) &&
      (!sowId || !p.sow_id || p.sow_id === sowId) && (!p.effective_date || p.effective_date <= periodStart) &&
      (!p.expires_on || p.expires_on >= periodStart) && p.approved_at && approved.has(p.approved_by))
      .sort((a, b) => Number(Boolean(b.offering_id)) - Number(Boolean(a.offering_id)) ||
        String(b.effective_date ?? "").localeCompare(String(a.effective_date ?? "")) || String(a.id).localeCompare(String(b.id)));
    const price = candidates[0];
    const standard = input.catalog.find(p => p.service_key === key && !p.pass_through);
    const quantity = contract ? Number(contract.quantity ?? 1) : 1;
    const contractUnit = contract ? Number(contract.unit_cents ?? Number(contract.amount_cents) / quantity) : null;
    if (frozen && contract && Number(frozen.final_cents) !== contractUnit) throw new Error(`The fund's displayed rate and agreement disagree for ${key}. Reconcile pricing before invoicing.`);
    const unit = contractUnit ?? (frozen ? Number(frozen.final_cents) : price ? Number(price.contracted_cents ?? price.standard_cents) : standard ? Number(standard.amount_cents) : null);
    if (unit === null || !Number.isSafeInteger(unit) || unit < 0 || !Number.isSafeInteger(quantity) || quantity < 1) throw new Error(`No approved payable rate is available for ${key}.`);
    const frequency = contract?.billing_frequency ?? frozen?.pricing_model ?? price?.pricing_model ?? standard?.pricing_model;
    if (!isFrequency(frequency)) throw new Error(`${key} needs a recorded billing frequency or an event-specific invoice.`);
    const start = contract?.first_bill_on ?? contract?.sow.effective_date ?? price?.effective_date ?? entitlement.effective_date;
    if (!start) throw new Error(`${key} needs a first billing date before invoicing.`);
    const ref = contract ? `sow:${contract.sow.id}:${contract.index}` : frozen ? `snapshot:${frozen.id}` : price ? `price:${price.id}` : `card:${standard?.id}:${identity}`;
    for (const period of duePeriods(frequency, String(start).slice(0, 10), periodEnd, 120)) {
      if (period.start < periodStart) continue;
      const sourceRef = `${ref}:${period.start}`;
      if (billed.has(sourceRef)) { skipped++; continue; }
      lines.push({ source: "rate", source_ref: sourceRef, service_key: key,
        label: contract?.label ?? frozen?.label ?? price?.label ?? standard?.label ?? key,
        description: `${frequency.replace(/_/g, " ")} · ${period.start} to ${period.end}`,
        quantity, unit_cents: unit, amount_cents: unit * quantity,
        pricing_id: !contract && !frozen ? price?.id ?? null : null,
        expense_id: null, offering_id: scope, sort_order: lines.length });
    }
  }
  return { lines, skipped, activeSow: sows.length === 1 ? sows[0] : null };
}

/** Review the recorded obligation, never an unordered current-price map. */
export function invoiceRateCheck(line: Row, unitCents: number | null) {
  const billed = Number(line.amount_cents ?? 0);
  const expected = unitCents === null ? null : unitCents * Number(line.quantity ?? 1);
  return { label: String(line.label), billedCents: billed, contractedCents: expected,
    varianceCents: expected === null ? billed : billed - expected, offRateCard: expected === null };
}