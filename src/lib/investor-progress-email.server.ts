import type { JourneyStepView } from './investor-journey-model'
import { progressDue, progressFrequency, progressRecipientAllowed, type ProgressFrequency } from './investor-progress-email'

const admin = async () => (await import('@/integrations/supabase/client.server')).supabaseAdmin as any
const KIND = 'investor_step_progress'
const SETTING = 'investor_progress_frequency'

/** Settings are append-only fund audit decisions, never onboarding authority. */
export async function getProgressSettings(db: any, fundId: string) {
  const { data, error } = await db.from('offering_audit_events').select('changes,created_at').eq('offering_id', fundId).eq('event_type', SETTING).order('created_at', { ascending: false }).limit(1)
  if (error) throw new Error(error.message)
  const settings = data?.[0]?.changes?.[0]?.to ?? {}
  return { investor: progressFrequency(settings.investor), manager: progressFrequency(settings.manager) }
}

export async function saveProgressSettings(db: any, fundId: string, actorId: string, settings: { investor: ProgressFrequency; manager: ProgressFrequency }) {
  const previous = await getProgressSettings(db, fundId)
  const { error } = await db.from('offering_audit_events').insert({ offering_id: fundId, actor_id: actorId, event_type: SETTING, summary: 'Investor progress email frequency updated', changes: [{ field: SETTING, from: previous, to: settings }] })
  if (error) throw new Error(error.message)
  return settings
}

async function eventId(key: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)))
  const hex = [...bytes.slice(0, 16)].map((v) => v.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

/** Called only after canonical reconciliation, never from page reads. */
export async function captureProgress(row: any, steps: JourneyStepView[], baseline: boolean) {
  const db = await admin()
  const settings = await getProgressSettings(db, row.offering_id)
  const { data: managers, error } = await db.from('fund_managers').select('user_id').eq('offering_id', row.offering_id)
  if (error) throw new Error(error.message)
  const recipients = [
    ...(row.investor_user_id ? [{ userId: row.investor_user_id as string, audience: 'investor' as const }] : []),
    ...[...new Set<string>((managers ?? []).map((m: any) => m.user_id))].map((userId) => ({ userId, audience: 'manager' as const })),
  ]
  for (const step of steps.filter((s) => s.state === 'complete')) {
    for (const recipient of recipients) {
      const id = await eventId(`${KIND}:${row.id}:${step.key}:${recipient.audience}:${recipient.userId}`)
      const { error: insertError } = await db.from('notification_events').upsert({
        id, offering_id: row.offering_id, investor_user_id: row.investor_user_id, event_kind: KIND, field: step.key,
        metadata: { onboarding_id: row.id, audience: recipient.audience, recipient_user_id: recipient.userId, step_label: step.label },
        ...(baseline || settings[recipient.audience] === 'off' ? { sent_at: new Date().toISOString() } : {}),
      }, { onConflict: 'id', ignoreDuplicates: true })
      if (insertError) throw new Error(insertError.message)
    }
  }
  await drainProgressEmails(40)
}

/** Reuses the existing internal notification drain; one private summary per recipient/investment. */
export async function drainProgressEmails(limit = 100) {
  const db = await admin()
  const { data, error } = await db.from('notification_events').select('*').eq('event_kind', KIND).is('sent_at', null).order('created_at').limit(limit)
  if (error) throw new Error(error.message)
  const groups = new Map<string, any[]>()
  for (const row of data ?? []) {
    const meta = row.metadata ?? {}
    const key = `${row.offering_id}:${meta.onboarding_id}:${meta.audience}:${meta.recipient_user_id}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  let sent = 0
  for (const rows of groups.values()) {
    const first = rows[0], meta = first.metadata
    try {
      const settings = await getProgressSettings(db, first.offering_id)
      const frequency = settings[meta.audience as 'investor' | 'manager']
      if (frequency !== 'off' && !progressDue(frequency, first.created_at)) continue
      const stamp = new Date().toISOString(), stale = new Date(Date.now() - 300000).toISOString()
      const { data: claimed, error: claimError } = await db.from('notification_events').update({ claimed_at: stamp }).in('id', rows.map((r) => r.id)).is('sent_at', null).or(`claimed_at.is.null,claimed_at.lt.${stale}`).select('*')
      if (claimError) throw new Error(claimError.message)
      if (!claimed?.length) continue
      const ids = claimed.map((r: any) => r.id)
      try {
        const results = await Promise.all([
          db.from('investor_onboardings').select('investor_user_id,offering_id,removed_at').eq('id', meta.onboarding_id).maybeSingle(),
          db.from('fund_managers').select('user_id').eq('offering_id', first.offering_id),
          db.from('profiles').select('email,legal_name').eq('user_id', meta.recipient_user_id).maybeSingle(),
          db.from('profiles').select('legal_name').eq('user_id', first.investor_user_id).maybeSingle(),
          db.from('offerings').select('name').eq('id', first.offering_id).maybeSingle(),
          db.from('notification_preferences').select('alerts_enabled').eq('user_id', meta.recipient_user_id).maybeSingle(),
        ])
        // Never mark an email sent when a check couldn't be read; release and retry later.
        const lookupError = results.find((r: any) => r.error)?.error
        if (lookupError) throw new Error(lookupError.message)
        const [{ data: onboarding }, { data: managers }, { data: recipient }, { data: investor }, { data: fund }, { data: pref }] = results as any[]
        const allowed = onboarding && !onboarding.removed_at && onboarding.offering_id === first.offering_id && progressRecipientAllowed(meta.audience, meta.recipient_user_id, onboarding.investor_user_id, (managers ?? []).map((m: any) => m.user_id))
        if (frequency !== 'off' && allowed && recipient?.email && pref?.alerts_enabled !== false) {
          const { sendTemplateEmail } = await import('./email-templates/send-email')
          await sendTemplateEmail('investor-progress', recipient.email, {
            idempotencyKey: `investor-progress:${ids.sort().join(':')}`,
            inboxForAnyUser: true,
            templateData: { name: recipient.legal_name ?? 'there', fundName: fund?.name ?? 'your fund', investorName: investor?.legal_name ?? 'Your investor', manager: meta.audience === 'manager', completedSteps: claimed.map((r: any) => r.metadata.step_label), portalUrl: meta.audience === 'investor' ? `https://app.harmonious.co/investment/${meta.onboarding_id}` : `https://app.harmonious.co/manager/fund/${first.offering_id}/investor/${meta.onboarding_id}` },
          })
          sent++
        }
        const { error: finishError } = await db.from('notification_events').update({ sent_at: stamp, error: null }).in('id', ids).eq('claimed_at', stamp)
        if (finishError) throw new Error(finishError.message)
      } catch (e) {
        await db.from('notification_events').update({ claimed_at: null, error: String(e).slice(0, 500) }).in('id', ids).eq('claimed_at', stamp)
        throw e
      }
    } catch (e) { console.error('[investor-progress] delivery failed', first.id, e) }
  }
  return { sent }
}