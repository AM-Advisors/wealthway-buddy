-- One-time: Steven Gelerman's accreditation proof copy was approved before copy approvals recorded accreditation.
INSERT INTO public.profile_accreditations (profile_id, offering_id, status, basis, verification_method, verifier_kind, evidence, verified_at, expires_at)
SELECT d.investment_profile_id, d.offering_id, 'approved', 'net_worth', 'document_review', 'reviewer',
       jsonb_build_object('documents', jsonb_build_array(jsonb_build_object('id', d.id)), 'recorded_from', 'approved_copy'),
       coalesce(d.reviewed_at, now()), now() + interval '90 days'
FROM public.investor_documents d
WHERE d.id = 'b04bb04e-8f1c-49c6-aef8-602b6fadd9c2'
  AND d.doc_kind = 'accreditation_proof' AND d.review_status = 'accepted'
  AND NOT EXISTS (SELECT 1 FROM public.profile_accreditations pa WHERE pa.profile_id = d.investment_profile_id AND pa.offering_id = d.offering_id);

INSERT INTO public.investment_profile_events (profile_id, actor_id, event, detail)
SELECT d.investment_profile_id, d.reviewed_by, 'accreditation_proof_approved',
       jsonb_build_object('document_id', d.id, 'onboarding_id', d.onboarding_id, 'notes', 'Recorded from previously approved copy')
FROM public.investor_documents d
WHERE d.id = 'b04bb04e-8f1c-49c6-aef8-602b6fadd9c2' AND d.review_status = 'accepted';