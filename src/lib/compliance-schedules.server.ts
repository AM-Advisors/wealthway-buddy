import { capabilitiesFor } from './ops-capabilities';
import { complianceSummary, nextRunOn, recipientAllowed, REPORT_TYPES, type ReportType, type ScheduleFrequency } from './compliance-schedule-model';
const database = async () => (await import('@/integrations/supabase/client.server')).supabaseAdmin as any;
function checked<T>(r: { data: T; error: any }): T { if (r.error) throw new Error('The requested records could not be loaded or saved.'); return r.data; }
async function can(db: any, userId: string, action: 'see' | 'prepare' | 'approve') {
  const rs = (checked<any[]>(await db.from('user_roles').select('role').eq('user_id', userId)) ?? []).map((r) => r.role);
  if (!capabilitiesFor(rs).includes(`reports:${action}` as any)) throw new Error('Compliance reporting access required.');
}
const today = () => new Date().toISOString().slice(0, 10);

export async function listSchedules(userId: string) {
  const db = await database(); await can(db, userId, 'see');
  const [s, d] = await Promise.all([
    db.from('compliance_report_schedules').select('*').order('created_at', { ascending: false }),
    db.from('compliance_report_deliveries').select('*').order('created_at', { ascending: false }).limit(200),
  ]);
  const schedules = checked<any[]>(s) ?? [], deliveries = checked<any[]>(d) ?? [];
  const ids = [...new Set([...schedules.map((x) => x.created_by), ...deliveries.map((x) => x.decided_by)].filter(Boolean))];
  const people = ids.length ? checked<any[]>(await db.from('profiles').select('user_id,legal_name,email').in('user_id', ids)) ?? [] : [];
  const name = (id: string | null) => (id ? people.find((p) => p.user_id === id)?.legal_name || people.find((p) => p.user_id === id)?.email || 'Team member' : null);
  return {
    viewerId: userId,
    schedules: schedules.map((x) => ({ id: x.id, name: x.name, reportType: x.report_type, frequency: x.frequency, recipients: x.recipients, nextRunOn: x.next_run_on, active: x.active, createdBy: x.created_by, createdByName: name(x.created_by) })),
    deliveries: deliveries.map((x) => ({ id: x.id, scheduleId: x.schedule_id, scheduleName: schedules.find((s) => s.id === x.schedule_id)?.name ?? 'Schedule', periodOn: x.period_on, snapshot: x.snapshot, recipients: x.recipients, status: x.status, preparedBy: x.prepared_by, decidedByName: name(x.decided_by), decidedAt: x.decided_at, reason: x.decision_reason, sentAt: x.sent_at, error: x.error })),
  };
}

export async function saveSchedule(userId: string, input: { id?: string | undefined; name: string; reportType: ReportType; frequency: ScheduleFrequency; recipients: string[]; firstRunOn: string; active: boolean }) {
  const db = await database(); await can(db, userId, 'prepare');
  const recipients = [...new Set(input.recipients.map((r) => r.trim().toLowerCase()).filter(Boolean))];
  if (!recipients.length) throw new Error('Add at least one recipient.');
  const bad = recipients.filter((r) => !recipientAllowed(r)); if (bad.length) throw new Error(`Only harmonious.co addresses may receive compliance reports: ${bad.join(', ')}`);
  const row = { name: input.name, report_type: input.reportType, frequency: input.frequency, recipients, next_run_on: input.firstRunOn, active: input.active, updated_by: userId, updated_at: new Date().toISOString() };
  if (input.id) checked(await db.from('compliance_report_schedules').update(row).eq('id', input.id));
  else checked(await db.from('compliance_report_schedules').insert({ ...row, created_by: userId }));
  return { ok: true };
}

async function buildSnapshot(db: any, type: ReportType, asOf: string) {
  const [items, holds] = await Promise.all([
    type === 'open_holds' ? Promise.resolve({ data: [], error: null }) : db.from('fund_compliance_items').select('status,due_date,filed_on'),
    type === 'compliance_items_due' ? Promise.resolve({ data: [], error: null }) : db.from('compliance_holds').select('id').is('cleared_at', null),
  ]);
  const s = complianceSummary(checked<any[]>(items) ?? [], (checked<any[]>(holds) ?? []).length, asOf);
  return { reportType: type, title: REPORT_TYPES[type], ...s };
}

/** Prepares any due reports for approval. Never sends; runs from the existing internal job. */
export async function prepareDueReports() {
  const db = await database(); const asOf = today();
  const due = checked<any[]>(await db.from('compliance_report_schedules').select('*').eq('active', true).lte('next_run_on', asOf)) ?? [];
  let prepared = 0;
  for (const s of due) {
    const snapshot = await buildSnapshot(db, s.report_type, asOf);
    const { error } = await db.from('compliance_report_deliveries').insert({ schedule_id: s.id, period_on: s.next_run_on, snapshot, recipients: s.recipients, prepared_by: s.created_by });
    if (error && !String(error.message).includes('duplicate')) continue;
    if (!error) prepared++;
    let next = s.next_run_on as string; while (next <= asOf) next = nextRunOn(next, s.frequency);
    await db.from('compliance_report_schedules').update({ next_run_on: next }).eq('id', s.id);
  }
  return { prepared };
}

/** Second-person approval, then delivery through the branded email sender. */
export async function decideDelivery(userId: string, id: string, decision: 'approved' | 'rejected', reason: string) {
  const db = await database(); await can(db, userId, 'approve');
  const d = checked<any>(await db.from('compliance_report_deliveries').select('*').eq('id', id).maybeSingle());
  if (!d || d.status !== 'awaiting_approval') throw new Error('This report is not waiting for approval.');
  if (d.prepared_by === userId) throw new Error('A different person must approve this report.');
  checked(await db.from('compliance_report_deliveries').update({ status: decision, decided_by: userId, decided_at: new Date().toISOString(), decision_reason: reason || null }).eq('id', id).eq('status', 'awaiting_approval'));
  if (decision === 'rejected') return { status: 'rejected' };
  const snap = d.snapshot ?? {};
  try {
    const { sendTemplateEmail } = await import('./email-templates/send-email');
    for (const to of d.recipients as string[]) {
      if (!recipientAllowed(to)) continue;
      await sendTemplateEmail('client-admin-alert', to, {
        idempotencyKey: `compliance-report:${d.id}:${to}`,
        templateData: {
          contactName: 'team', headline: `${snap.title ?? 'Compliance report'} — ${d.period_on}`,
          intro: 'Your scheduled compliance report was approved for delivery. Open Operations for the item-level detail.',
          details: [
            ...(snap.reportType !== 'open_holds' ? [{ label: 'Open compliance items', value: String(snap.openItems ?? 0) }, { label: 'Overdue', value: String(snap.overdue ?? 0) }, { label: 'Due in the next 30 days', value: String(snap.dueNext30Days ?? 0) }] : []),
            ...(snap.reportType !== 'compliance_items_due' ? [{ label: 'Open holds', value: String(snap.openHolds ?? 0) }] : []),
          ],
          actionLabel: 'Open compliance schedules', actionUrl: 'https://ops.harmonious.co/ops/compliance-schedules',
          footnote: 'Internal Harmonious report. It is a summary only and is not a regulatory filing.',
        },
      });
    }
    await db.from('compliance_report_deliveries').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', id);
    return { status: 'sent' };
  } catch (e) {
    await db.from('compliance_report_deliveries').update({ status: 'failed', error: String(e).slice(0, 300) }).eq('id', id);
    return { status: 'failed' };
  }
}
