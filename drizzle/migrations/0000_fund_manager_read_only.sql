-- Least-privilege fund managers: read-only at the database level.
-- Every legitimate manager mutation now runs through an authorized server
-- function. Administrator and owner/investor policies are untouched.

DROP POLICY IF EXISTS "managers review applications" ON public.investor_applications;
CREATE POLICY "managers read applications"
  ON public.investor_applications FOR SELECT TO authenticated
  USING (private.manages_offering(offering_id));

DROP POLICY IF EXISTS "managers manage payments" ON public.payments;
CREATE POLICY "managers read payments"
  ON public.payments FOR SELECT TO authenticated
  USING (private.can_review_application(application_id));

DROP POLICY IF EXISTS "managers manage subscriptions" ON public.subscriptions;
CREATE POLICY "managers read subscriptions"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (private.can_review_application(application_id));

DROP POLICY IF EXISTS "managers manage accreditation" ON public.accreditation_records;
CREATE POLICY "managers read accreditation"
  ON public.accreditation_records FOR SELECT TO authenticated
  USING (private.can_review_application(application_id));

DROP POLICY IF EXISTS "managers manage kyc" ON public.kyc_verifications;
CREATE POLICY "managers read kyc"
  ON public.kyc_verifications FOR SELECT TO authenticated
  USING (private.can_review_application(application_id));

DROP POLICY IF EXISTS "managers manage aml" ON public.aml_screenings;
CREATE POLICY "managers read aml"
  ON public.aml_screenings FOR SELECT TO authenticated
  USING (private.can_review_application(application_id));

DROP POLICY IF EXISTS "managers manage investor emails" ON public.investor_emails;
CREATE POLICY "managers read investor emails"
  ON public.investor_emails FOR SELECT TO authenticated
  USING (private.can_review_application(application_id));

-- Notes are append-only for managers: reads here, writes only through the
-- authenticated server function, which sets author_id from the session.
DROP POLICY IF EXISTS "managers manage notes" ON public.admin_notes;
CREATE POLICY "managers read notes"
  ON public.admin_notes FOR SELECT TO authenticated
  USING (private.can_review_application(application_id));

DROP POLICY IF EXISTS "managers manage fund managers for their funds" ON public.fund_managers;
CREATE POLICY "managers read fund managers for their funds"
  ON public.fund_managers FOR SELECT TO authenticated
  USING (private.manages_offering(offering_id));

DROP POLICY IF EXISTS "managers manage invitations for their funds" ON public.fund_invitations;
CREATE POLICY "managers read invitations for their funds"
  ON public.fund_invitations FOR SELECT TO authenticated
  USING (private.manages_offering(offering_id));