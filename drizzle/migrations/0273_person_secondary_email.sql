ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS secondary_email text;

-- Must be a real, distinct address when present (checked again on every save).
ALTER TABLE public.persons DROP CONSTRAINT IF EXISTS persons_secondary_email_check;
ALTER TABLE public.persons ADD CONSTRAINT persons_secondary_email_check
  CHECK (
    secondary_email IS NULL
    OR (
      secondary_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
      AND lower(secondary_email) <> lower(coalesce(email, ''))
    )
  );

-- Column-scoped authenticated grant: re-issue the full readable column list
-- including the new column (writes stay service-role only).
GRANT SELECT (
  id, user_id, legal_first_name, legal_middle_name, legal_last_name, preferred_name,
  citizenship_country, residence_country, address_line1, address_line2, city, region,
  postal_code, country, phone, email, secondary_email, tax_residency_country, tax_id_last4,
  kyc_status, aml_status, identity_verified_at, kyc_verified_at, aml_screened_at,
  reverification_due_at, onboarding_state, onboarding_reason, created_at, updated_at
) ON public.persons TO authenticated;

-- Thomas Morgan Jr. asked (via Alyssa) for copies of his Harmonious emails at
-- his personal address. Idempotent: only fills it while empty.
UPDATE public.persons
SET secondary_email = 'morgato27@gmail.com', updated_at = now()
WHERE id = 'ed669351-16d9-438a-a301-cc53db366597'
  AND secondary_email IS NULL
  AND lower(coalesce(email, '')) = 'thomas.morgan@corpscappartners.com';
