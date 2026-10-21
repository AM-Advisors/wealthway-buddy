/** Single-recipient event notices. No queue, credentials, bank details or approval writes. */
export async function notifyInvestorApproval(input: { onboardingId: string; action: 'review' | 'sign' | 'fund'; ref: string; signerUserId?: string | null }) {
  try {
    const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server')
    await sendInvestorApprovalNotice(db, input)
  } catch {
    // A notification failure must never undo a saved signature or approval.
    console.error('[investor-approval-notice] notification unavailable')
  }
}

export async function sendInvestorApprovalNotice(db: any, input: { onboardingId: string; action: 'review' | 'sign' | 'fund'; ref: string; signerUserId?: string | null }) {
  const { data: ob, error } = await db.from('investor_onboardings')
    .select('id, offering_id, investor_user_id, person_id, assigned_to, stage, approved_to_fund_at, approved_to_fund_by, removed_at')
    .eq('id', input.onboardingId).maybeSingle()
  if (error) throw new Error('Investment notification facts unavailable')
  if (!ob || ob.removed_at || ['declined', 'cancelled', 'closed'].includes(ob.stage)) return { sent: false }
  if (input.action === 'fund' && (!ob.approved_to_fund_at || !ob.approved_to_fund_by)) return { sent: false }
  const { data: managers, error: managerError } = await db.from('fund_managers').select('user_id').eq('offering_id', ob.offering_id).order('user_id')
  if (managerError) throw new Error('Manager notification facts unavailable')
  const managerIds = (managers ?? []).map((m: any) => m.user_id).filter((id: string) => id && id !== ob.investor_user_id)
  // One responsible manager per event, not a broadcast. Assigned manager wins.
  const recipientId = input.action === 'fund' ? ob.investor_user_id
    : input.action === 'sign' ? (managerIds.includes(input.signerUserId) ? input.signerUserId : null)
    : managerIds.includes(ob.assigned_to) ? ob.assigned_to : managerIds[0]
  if (!recipientId || (input.action === 'fund' && !managerIds.includes(ob.approved_to_fund_by))) return { sent: false }
  const { data: auth, error: authError } = await db.auth.admin.getUserById(recipientId)
  if (authError) throw new Error('Recipient unavailable')
  const recipient = auth?.user
  if (!recipient?.email || !recipient.email_confirmed_at) return { sent: false }
  const [{ data: fund, error: fundError }, { data: person, error: personError }] = await Promise.all([
    db.from('offerings').select('name').eq('id', ob.offering_id).maybeSingle(),
    ob.person_id ? db.from('persons').select('legal_first_name, legal_last_name').eq('id', ob.person_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ])
  if (fundError || personError || !fund) throw new Error('Notification facts unavailable')
  let instructionsAvailable = false
  if (input.action === 'fund') {
    const { fundingInstructions } = await import('@/lib/investor-onboarding.server')
    const result = await fundingInstructions(ob.investor_user_id, ob.id)
    instructionsAvailable = Boolean(result.unlocked && result.instructions)
  }
  const { sendTemplateEmail } = await import('@/lib/email-templates/send-email')
  return sendTemplateEmail('investment-approval', recipient.email, {
    managed: true,
    idempotencyKey: `investment-approval:${input.action}:${input.ref}:${recipientId}`,
    inboxForAnyUser: input.action === 'fund',
    templateData: {
      name: recipient.user_metadata?.name || 'there',
      investorName: [person?.legal_first_name, person?.legal_last_name].filter(Boolean).join(' ') || 'An investor',
      fundName: fund.name, action: input.action, instructionsAvailable,
      portalUrl: input.action === 'fund' ? `https://app.harmonious.co/investment/${ob.id}?step=fund`
        : `https://app.harmonious.co/manager/fund/${ob.offering_id}/approvals`,
    },
  })
}