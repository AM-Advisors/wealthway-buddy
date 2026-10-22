import { beforeEach, describe, expect, it, vi } from 'vitest';
import { onSowSigned, sendCommissionNotice } from './commission-notify.server';
import { queueInvoicePayouts } from './commissions.server';

const state = vi.hoisted(() => ({ tables: {} as Record<string, any[]>, sends: [] as any[], delivered: new Set<string>(), synced: [] as string[], confirmed: true }));
vi.mock('@/lib/sales-hub.server', () => ({ names: vi.fn(), salesActor: vi.fn() }));
vi.mock('@/lib/sales-quotes.server', () => ({ syncQuotesForSow: async (id: string) => {
  state.synced.push(id);
  for (const q of state.tables['sales_quotes'] ?? []) if (q.sow_id === id) q.status = 'signed';
} }));
vi.mock('@/lib/email-templates/send-email', () => ({ sendTemplateEmail: async (template: string, email: string, options: any) => {
  if (!state.delivered.has(options.idempotencyKey)) {
    state.sends.push({ template, email, options }); state.delivered.add(options.idempotencyKey);
  }
  return { sent: true };
} }));

function from(table: string) {
  const filters: ((row: any) => boolean)[] = []; let inserted: any = null;
  const run = () => {
    const rows = state.tables[table] ?? [];
    if (inserted) {
      if (table === 'commission_payout_queue' && rows.some(r => r.invoice_line_id === inserted.invoice_line_id && r.user_id === inserted.user_id && r.layer === inserted.layer)) return { data: null, error: { code: '23505' } };
      const row = { id: `record-${rows.length}`, status: 'scheduled', ...inserted };
      (state.tables[table] ??= []).push(row);
      return { data: row, error: null };
    }
    return { data: rows.filter(r => filters.every(f => f(r))), error: null };
  };
  const query: any = {
    select: () => query, order: () => query,
    eq: (key: string, value: any) => { filters.push(r => r[key] === value); return query; },
    is: (key: string, value: any) => { filters.push(r => (r[key] ?? null) === value); return query; },
    insert: (row: any) => { inserted = row; return query; },
    maybeSingle: async () => { const result = run(); return { ...result, data: Array.isArray(result.data) ? result.data[0] ?? null : result.data }; },
    then: (resolve: any, reject: any) => Promise.resolve(run()).then(resolve, reject),
  };
  return query;
}
const db = { from, auth: { admin: { getUserById: async (id: string) => ({ data: { user: { email: `${id}@example.invalid`, email_confirmed_at: state.confirmed ? '2026-01-01' : null } }, error: null }) } } };
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: db }));

beforeEach(() => {
  state.sends = []; state.delivered.clear(); state.synced = []; state.confirmed = true;
  state.tables = {
    client_sows: [{ id: 'sow', client_signed_at: '2026-10-22', executed_at: null }],
    sales_quotes: [{ id: 'quote', title: 'Fictional services', owner_user_id: 'rep', bdr_user_id: null, sow_id: 'sow', status: 'sent' }],
    invoices: [{ id: 'invoice', sow_id: 'sow', sales_quote_id: 'quote', status: 'paid', paid_on: '2026-10-22', voided_at: null }],
    invoice_lines: [{ id: 'line', invoice_id: 'invoice', service_key: 'services', amount_cents: 100000 }],
    user_roles: [{ user_id: 'rep', role: 'sales' }], sales_reporting_lines: [], commission_rate_versions: [],
    commission_payout_queue: [], commission_payout_queue_events: [],
  };
});

describe('signed SOW commission handoff (fictional records only)', () => {
  it('schedules the paid invoice for Q4 and sends only the rep their own commission', async () => {
    await onSowSigned('sow');
    expect(state.synced).toEqual(['sow']);
    const own = state.tables['commission_payout_queue']?.filter(r => r.user_id === 'rep');
    expect(own).toEqual([expect.objectContaining({ amount_cents: 10000, due_on: '2026-12-31' })]);
    expect(state.sends).toHaveLength(1);
    expect(state.sends[0]).toMatchObject({ email: 'rep@example.invalid', options: { managed: true, templateData: { scheduled: true, amount: '$100.00', dueOn: '2026-12-31' } } });
    expect(state.tables['commission_payouts']).toBeUndefined();
  });
  it('does not earn an unpaid invoice and notifies the rep of payment-dependent scheduling', async () => {
    const invoice = state.tables['invoices']?.[0]; if (invoice) { invoice.status = 'issued'; invoice.paid_on = null; }
    await onSowSigned('sow');
    expect(state.tables['commission_payout_queue']).toEqual([]);
    expect(state.sends[0]?.options.templateData.scheduled).toBe(false);
    if (invoice) { invoice.status = 'paid'; invoice.paid_on = '2027-01-10'; }
    await queueInvoicePayouts('invoice');
    expect(state.tables['commission_payout_queue']?.[0]?.due_on).toBe('2027-03-31');
    expect(state.sends).toHaveLength(2);
  });
  it('signature retries do not duplicate commission rows or logical rep sends', async () => {
    await onSowSigned('sow'); await onSowSigned('sow');
    expect(state.tables['commission_payout_queue']?.filter(r => r.user_id === 'rep')).toHaveLength(1);
    expect(state.sends).toHaveLength(1);
    expect(state.sends[0]?.options.idempotencyKey).toBe('commission-notice:invoice:invoice:rep');
  });
  it('ignores unsigned SOWs', async () => {
    const sow = state.tables['client_sows']?.[0]; if (sow) sow.client_signed_at = null;
    await onSowSigned('sow');
    expect(state.synced).toEqual([]); expect(state.sends).toEqual([]);
  });
  it('never queues voided paid invoices', async () => {
    const invoice = state.tables['invoices']?.[0]; if (invoice) invoice.voided_at = '2026-10-22';
    expect(await queueInvoicePayouts('invoice')).toEqual({ queued: 0 });
    expect(state.sends).toEqual([]);
  });
  it('supports canonical quote-linked paid invoices without a SOW id on the invoice', async () => {
    const invoice = state.tables['invoices']?.[0]; if (invoice) invoice.sow_id = null;
    const quote = state.tables['sales_quotes']?.[0]; if (quote) quote.status = 'signed';
    await queueInvoicePayouts('invoice');
    expect(state.tables['commission_payout_queue']?.[0]?.due_on).toBe('2026-12-31');
    expect(state.sends).toHaveLength(1);
  });
  it('refuses to guess a payment quarter when no payment date is recorded', async () => {
    const invoice = state.tables['invoices']?.[0]; if (invoice) invoice.paid_on = null;
    expect(await queueInvoicePayouts('invoice')).toEqual({ queued: 0 });
  });
  it('does not email an unconfirmed rep address', async () => {
    state.confirmed = false;
    const quote = state.tables['sales_quotes']?.[0]; if (quote) quote.status = 'signed';
    expect(await sendCommissionNotice(db, { sowId: 'sow' })).toEqual({ sent: false });
    expect(state.sends).toEqual([]);
  });
});