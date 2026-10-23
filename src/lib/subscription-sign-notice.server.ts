/** Emails one investor a link to the Sign step of their own investment. No signing or approval is recorded here. */
const CLOSED = ['declined', 'cancelled', 'closed', 'funded']

export async function sendSubscriptionSignNotice(db: any, actorId: string, input: { fundId: string; onboardingId: string }) {
  // Only that fund's managers or Harmonious staff — general fund membership is not enough.
  const { isStaff } = await import('@/lib/fund-tabs.server')
  const staff = await isStaff(actorId)
  if (!staff) {
    const { data: mgr, error } = await db.from('fund_managers').select('id').eq('user_id', actorId).eq('offering_id', input.fundId).maybeSingle()
    if (error || !mgr) throw new Error("Only this fund's managers or Harmonious can send this.")
  }
  const { data: ob, error } = await db.from('investor_onboardings')
    .select('id, offering_id, investor_user_id, stage, removed_at').eq('id', input.onboardingId).maybeSingle()
  if (error) throw new Error('Investment unavailable.')
  if (!ob || ob.offering_id !== input.fundId || ob.removed_at) throw new Error('Investment not found for this fund.')
  if (CLOSED.includes(ob.stage)) throw new Error('This investment is no longer open for signing.')
  if (!ob.investor_user_id) throw new Error("The investor hasn't created their account yet. Send their invitation first.")
  const { data: auth, error: authError } = await db.auth.admin.getUserById(ob.investor_user_id)
  if (authError || !auth?.user?.email) throw new Error('Investor email unavailable.')
  const { data: fund } = await db.from('offerings').select('name').eq('id', ob.offering_id).maybeSingle()
  const { data: sender } = await db.auth.admin.getUserById(actorId)
  const day = new Date().toISOString().slice(0, 10)
  const { sendTemplateEmail } = await import('@/lib/email-templates/send-email')
  const result: any = await sendTemplateEmail('signing-reminder', auth.user.email, {
    managed: true,
    inboxForAnyUser: true,
    // One notice per investment per day, so repeated clicks don't spam the investor.
    idempotencyKey: `subscription-sign:${ob.id}:${day}`,
    templateData: {
      recipientName: auth.user.user_metadata?.name || 'there',
      documentTitle: 'Your Subscription Agreement',
      fundName: fund?.name ?? 'your fund',
      steps: ['Sign in to Harmonious', 'Finish any earlier steps shown', 'Review and sign the Subscription Agreement'],
      requestedBy: sender?.user?.user_metadata?.name || undefined,
      ctaUrl: `https://app.harmonious.co/investment/${ob.id}?step=sign`,
      ctaLabel: 'Open and sign',
    },
  })
  if (result && result.sent === false) return { sent: false, reason: result.reason ?? 'not_sent' }
  return { sent: true }
}
