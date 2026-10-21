/** Send the existing request only; never recreate a request or adopt a signature. */
export async function emailFundSignatory(db: any, actorId: string, input: { offeringId: string; signatureId: string }) {
  const { data: sig, error } = await db.from('document_signatures').select('id, application_id, offering_document_id, provider_agreement_id, provider_status, provider_completed_at, cancelled_at, superseded_by').eq('id', input.signatureId).maybeSingle();
  if (error || !sig || sig.cancelled_at || sig.superseded_by) throw new Error('No active signing request is available.');
  const { data: ob } = await db.from('investor_onboardings').select('id, offering_id').eq('application_id', sig.application_id).is('removed_at', null).maybeSingle();
  if (!ob || ob.offering_id !== input.offeringId) throw new Error('This agreement is not for this fund.');
  const { data: rows, error: rowsError } = await db.from('document_signature_signers').select('*').eq('signature_id', sig.id);
  if (rowsError) throw new Error('Signer records could not be checked.');
  const signer = (rows ?? []).find((r: any) => r.role_key === 'fund_manager' && ['waiting','sent','viewed'].includes(r.status));
  if (!signer?.signer_user_id || !signer.signer_email) throw new Error('There is no outstanding fund signature to email.');
  const { data: manager, error: managerError } = await db.from('fund_managers').select('id').eq('offering_id', input.offeringId).eq('user_id', signer.signer_user_id).maybeSingle();
  if (managerError || !manager) throw new Error('The signatory is no longer assigned to this fund.');
  const investorSignedAt = (rows ?? []).find((r: any) => r.role_key !== 'fund_manager' && r.status === 'signed')?.signed_at ?? (sig.provider_status === 'completed' ? sig.provider_completed_at : null);
  const { managerApprovedSigned } = await import('@/lib/investor-document-review.server');
  if (!(await managerApprovedSigned(db, ob.id, sig.offering_document_id, investorSignedAt))) throw new Error('Approve the investor’s signed document before emailing the signatory.');
  const requestId = String(signer.provider_signer_id ?? '').startsWith('cs:') ? String(signer.provider_signer_id).slice(3) : sig.provider_agreement_id;
  if (!requestId) throw new Error('Prepare the fund countersignature before sending its email.');
  const box = await import('@/lib/box.server');
  const detail = await box.getSignRequestDetail(requestId);
  const pending = detail.signers.filter(s => s.decision !== 'signed');
  // Resend addresses every outstanding signer: never send an investor another request.
  if (pending.length !== 1 || pending[0]?.email.toLowerCase() !== signer.signer_email.toLowerCase() || !['created','sent','out_for_signature','signer_signed','signer_viewed'].includes(detail.status)) throw new Error('This request is not ready for a signatory-only email. Refresh signing status first.');
  const { data: doc } = await db.from('offering_documents').select('title').eq('id', sig.offering_document_id).maybeSingle();
  const { sendSigningReminder } = await import('@/lib/signing-reminder.server');
  return sendSigningReminder(actorId, {
    offeringId: input.offeringId, reminderKey: `fund-signatory:${sig.id}:${signer.id}`, documentTitle: doc?.title ?? 'Subscription Agreement',
    recipientEmail: signer.signer_email, recipientName: signer.signer_name ?? 'Fund signatory', recipientUserId: signer.signer_user_id,
    path: `/manager/countersign/${signer.id}`, steps: [], nativeSend: () => box.resendSignRequest(requestId),
  });
}