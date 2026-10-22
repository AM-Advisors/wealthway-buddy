/** Event-bound notices to the quote's assigned rep; no payment initiation or broadcast. */
export async function sendCommissionNotice(db: any, input: { sowId?: string; invoiceId?: string }) {
  let query = db.from('sales_quotes').select('id, title, owner_user_id, sow_id').eq('status', 'signed');
  if (input.invoiceId) {
    const { data: inv, error } = await db.from('invoices').select('sow_id, sales_quote_id, status, paid_on, voided_at').eq('id', input.invoiceId).maybeSingle();
    if (error) throw new Error('Commission invoice unavailable');
    if (!inv || inv.status !== 'paid' || !inv.paid_on || inv.voided_at) return { sent: false };
    query = inv.sales_quote_id ? query.eq('id', inv.sales_quote_id) : query.eq('sow_id', inv.sow_id);
  } else if (input.sowId) query = query.eq('sow_id', input.sowId);
  else return { sent: false };
  const { data: quote, error } = await query.maybeSingle();
  if (error) throw new Error('Commission assignment unavailable');
  if (!quote?.owner_user_id) return { sent: false };
  let amount = 0; let dueOn: string | undefined;
  if (input.invoiceId) {
    const { data: rows, error: queueError } = await db.from('commission_payout_queue').select('amount_cents, due_on').eq('invoice_id', input.invoiceId).eq('user_id', quote.owner_user_id).eq('status', 'scheduled');
    if (queueError) throw new Error('Commission schedule unavailable');
    if (!rows?.length) return { sent: false };
    amount = rows.reduce((sum: number, row: any) => sum + Number(row.amount_cents), 0);
    dueOn = rows[0].due_on;
  }
  let expected: { dueOn: string; amount: string }[] = [];
  if (!input.invoiceId && input.sowId) {
    const { expectedSowCommissions } = await import('@/lib/commissions.server');
    const totals = new Map<string, number>();
    for (const row of await expectedSowCommissions(db, input.sowId)) {
      if (row.userId === quote.owner_user_id) totals.set(row.payoutDue, (totals.get(row.payoutDue) ?? 0) + row.amountCents);
    }
    expected = [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([dueOn, cents]) => ({ dueOn, amount: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100) }));
  }
  const { data: auth, error: authError } = await db.auth.admin.getUserById(quote.owner_user_id);
  if (authError) throw new Error('Commission recipient unavailable');
  if (!auth?.user?.email || !auth.user.email_confirmed_at) return { sent: false };
  const { sendTemplateEmail } = await import('@/lib/email-templates/send-email');
  return sendTemplateEmail('commission-scheduled', auth.user.email, {
    managed: true, inboxForAnyUser: true,
    idempotencyKey: `commission-notice:${input.invoiceId ? `invoice:${input.invoiceId}` : `sow:${input.sowId}`}:${quote.owner_user_id}`,
    templateData: { expected, title: quote.title, scheduled: Boolean(input.invoiceId), amount: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount / 100), dueOn },
  });
}

/** Retry-safe signature handoff: existing paid invoices are queued, unpaid invoices stay unearned. */
export async function onSowSigned(sowId: string) {
  const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
  const { data: sow, error } = await db.from('client_sows').select('id, client_signed_at, executed_at').eq('id', sowId).maybeSingle();
  if (error) throw new Error('SOW signature facts unavailable');
  if (!sow || (!sow.client_signed_at && !sow.executed_at)) return;
  const { syncQuotesForSow } = await import('@/lib/sales-quotes.server');
  await syncQuotesForSow(sowId);
  const { data: invoices, error: invoiceError } = await db.from('invoices').select('id').eq('sow_id', sowId).eq('status', 'paid').is('voided_at', null);
  if (invoiceError) throw new Error('SOW invoices unavailable');
  const { queueInvoicePayouts } = await import('@/lib/commissions.server');
  for (const invoice of invoices ?? []) await queueInvoicePayouts(invoice.id);
  if (!invoices?.length) await sendCommissionNotice(db, { sowId });
}

export async function afterSowSigned(sowId: string) {
  try { await onSowSigned(sowId); }
  catch { console.error('[sow-commission] scheduling or notice unavailable'); }
}