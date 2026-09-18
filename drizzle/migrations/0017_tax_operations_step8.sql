-- Step 8: complete tax operations.
-- Tax is a separate subsystem that CONSUMES finalized accounting. Nothing here
-- writes to posted books: book-to-tax differences live in their own ledger.
-- Book capital, tax capital and outside basis are modelled as distinct concepts.

ALTER TYPE public.delegation_capability ADD VALUE IF NOT EXISTS 'view_tax_returns';
ALTER TYPE public.delegation_capability ADD VALUE IF NOT EXISTS 'prepare_entity_return';
ALTER TYPE public.delegation_capability ADD VALUE IF NOT EXISTS 'review_entity_return';
ALTER TYPE public.delegation_capability ADD VALUE IF NOT EXISTS 'prepare_individual_return';
ALTER TYPE public.delegation_capability ADD VALUE IF NOT EXISTS 'review_individual_return';
ALTER TYPE public.delegation_capability ADD VALUE IF NOT EXISTS 'request_tax_information';
ALTER TYPE public.delegation_capability ADD VALUE IF NOT EXISTS 'deliver_tax_return';
ALTER TYPE public.delegation_capability ADD VALUE IF NOT EXISTS 'manage_tax_workpapers';

CREATE TABLE public.tax_classification_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID REFERENCES public.persons(id) ON DELETE SET NULL,
  investment_profile_id UUID REFERENCES public.investment_profiles(id) ON DELETE CASCADE,
  subject_user_id UUID,
  classification TEXT NOT NULL,
  sub_classification TEXT,
  is_foreign BOOLEAN NOT NULL DEFAULT false,
  residency_country TEXT,
  treaty_country TEXT,
  treaty_rate_bps INTEGER,
  effective_from DATE NOT NULL,
  effective_to DATE,
  version INTEGER NOT NULL DEFAULT 1,
  supersedes_id UUID REFERENCES public.tax_classification_records(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded')),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_by UUID,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_taxclass_profile ON public.tax_classification_records(investment_profile_id);
GRANT SELECT, INSERT, UPDATE ON public.tax_classification_records TO authenticated;
GRANT ALL ON public.tax_classification_records TO service_role;
ALTER TABLE public.tax_classification_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read tax classifications" ON public.tax_classification_records
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "subject reads own tax classification" ON public.tax_classification_records
  FOR SELECT TO authenticated USING (subject_user_id = auth.uid());

CREATE TABLE public.tax_document_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID REFERENCES public.persons(id) ON DELETE SET NULL,
  investment_profile_id UUID REFERENCES public.investment_profiles(id) ON DELETE CASCADE,
  subject_user_id UUID,
  offering_id UUID REFERENCES public.offerings(id) ON DELETE SET NULL,
  form_type TEXT NOT NULL,
  is_substitute BOOLEAN NOT NULL DEFAULT false,
  classification TEXT,
  tin_type TEXT CHECK (tin_type IN ('ssn','ein','itin','foreign','none')),
  tin_last4 TEXT CHECK (tin_last4 IS NULL OR tin_last4 ~ '^[0-9A-Za-z]{4}$'),
  tin_on_file BOOLEAN NOT NULL DEFAULT false,
  certification_date DATE,
  received_date DATE,
  effective_from DATE,
  expires_on DATE,
  validation_status TEXT NOT NULL DEFAULT 'received'
    CHECK (validation_status IN ('received','in_review','valid','invalid','expired','superseded')),
  validation_notes TEXT,
  storage_path TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  supersedes_id UUID REFERENCES public.tax_document_records(id) ON DELETE SET NULL,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_taxdoc_profile ON public.tax_document_records(investment_profile_id);
CREATE INDEX idx_taxdoc_expires ON public.tax_document_records(expires_on);
GRANT SELECT, INSERT, UPDATE ON public.tax_document_records TO authenticated;
GRANT ALL ON public.tax_document_records TO service_role;
ALTER TABLE public.tax_document_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read tax documents" ON public.tax_document_records
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "subject reads own tax documents" ON public.tax_document_records
  FOR SELECT TO authenticated USING (subject_user_id = auth.uid());

CREATE TABLE public.tax_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL CHECK (scope IN ('entity','individual')),
  offering_id UUID REFERENCES public.offerings(id) ON DELETE CASCADE,
  entity_id UUID,
  household_id UUID,
  tax_year INTEGER NOT NULL,
  period_start DATE,
  period_end DATE,
  ein_last4 TEXT,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN (
    'not_started','collecting_documents','accounting_ready','tax_adjustments',
    'allocation_review','return_preparation','review','approved','ready_to_file',
    'filed','accepted','rejected','delivered','amended')),
  readiness JSONB NOT NULL DEFAULT '{}'::jsonb,
  exceptions JSONB NOT NULL DEFAULT '[]'::jsonb,
  opened_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_tax_year_entity ON public.tax_years(offering_id, tax_year)
  WHERE offering_id IS NOT NULL;
CREATE UNIQUE INDEX idx_tax_year_household ON public.tax_years(household_id, tax_year)
  WHERE household_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE ON public.tax_years TO authenticated;
GRANT ALL ON public.tax_years TO service_role;
ALTER TABLE public.tax_years ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read tax years" ON public.tax_years
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "managers read their fund tax years" ON public.tax_years
  FOR SELECT TO authenticated
  USING (offering_id IS NOT NULL AND private.manages_offering(offering_id));

CREATE TABLE public.book_tax_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_year_id UUID NOT NULL REFERENCES public.tax_years(id) ON DELETE CASCADE,
  offering_id UUID REFERENCES public.offerings(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  item_code TEXT NOT NULL,
  category TEXT NOT NULL,
  difference_type TEXT NOT NULL CHECK (difference_type IN ('timing','permanent')),
  book_amount_cents BIGINT NOT NULL DEFAULT 0,
  adjustment_cents BIGINT NOT NULL DEFAULT 0,
  tax_amount_cents BIGINT NOT NULL DEFAULT 0,
  source TEXT,
  explanation TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','review','approved','superseded')),
  prepared_by UUID,
  prepared_at TIMESTAMPTZ,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bta_year ON public.book_tax_adjustments(tax_year_id);
GRANT SELECT, INSERT, UPDATE ON public.book_tax_adjustments TO authenticated;
GRANT ALL ON public.book_tax_adjustments TO service_role;
ALTER TABLE public.book_tax_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read book tax adjustments" ON public.book_tax_adjustments
  FOR SELECT TO authenticated USING (public.is_any_staff());

CREATE TABLE public.tax_allocation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_year_id UUID NOT NULL REFERENCES public.tax_years(id) ON DELETE CASCADE,
  offering_id UUID NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL,
  methodology_code TEXT NOT NULL,
  methodology_version INTEGER NOT NULL DEFAULT 1,
  methodology_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  inputs_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  entity_totals JSONB NOT NULL DEFAULT '{}'::jsonb,
  allocated_totals JSONB NOT NULL DEFAULT '{}'::jsonb,
  difference_cents BIGINT NOT NULL DEFAULT 0,
  exceptions JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','review','approved','finalized','superseded')),
  version INTEGER NOT NULL DEFAULT 1,
  supersedes_id UUID REFERENCES public.tax_allocation_runs(id) ON DELETE SET NULL,
  prepared_by UUID,
  prepared_at TIMESTAMPTZ,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  finalized_by UUID,
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_taxalloc_year ON public.tax_allocation_runs(tax_year_id);
GRANT SELECT, INSERT, UPDATE ON public.tax_allocation_runs TO authenticated;
GRANT ALL ON public.tax_allocation_runs TO service_role;
ALTER TABLE public.tax_allocation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read tax allocation runs" ON public.tax_allocation_runs
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "managers read their tax allocation runs" ON public.tax_allocation_runs
  FOR SELECT TO authenticated USING (private.manages_offering(offering_id));

CREATE TABLE public.tax_allocation_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.tax_allocation_runs(id) ON DELETE CASCADE,
  offering_id UUID NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  position_id UUID REFERENCES public.investor_positions(id) ON DELETE SET NULL,
  investment_profile_id UUID REFERENCES public.investment_profiles(id) ON DELETE SET NULL,
  investor_user_id UUID,
  item_code TEXT NOT NULL,
  item_label TEXT,
  k1_box TEXT,
  amount_cents BIGINT NOT NULL DEFAULT 0,
  ownership_pct NUMERIC(12,8),
  basis JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_taxallocline_run ON public.tax_allocation_lines(run_id);
GRANT SELECT, INSERT ON public.tax_allocation_lines TO authenticated;
GRANT ALL ON public.tax_allocation_lines TO service_role;
ALTER TABLE public.tax_allocation_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read tax allocation lines" ON public.tax_allocation_lines
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "managers read their tax allocation lines" ON public.tax_allocation_lines
  FOR SELECT TO authenticated USING (private.manages_offering(offering_id));

CREATE TABLE public.partnership_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_year_id UUID NOT NULL REFERENCES public.tax_years(id) ON DELETE CASCADE,
  offering_id UUID NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL,
  form_type TEXT NOT NULL DEFAULT '1065',
  ein_last4 TEXT,
  book_income_cents BIGINT NOT NULL DEFAULT 0,
  adjustments_cents BIGINT NOT NULL DEFAULT 0,
  tax_income_cents BIGINT NOT NULL DEFAULT 0,
  separately_stated JSONB NOT NULL DEFAULT '[]'::jsonb,
  capital_reconciliation JSONB NOT NULL DEFAULT '{}'::jsonb,
  allocation_run_id UUID REFERENCES public.tax_allocation_runs(id) ON DELETE SET NULL,
  source_manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
  exceptions JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','prepared','review','approved','ready_to_file','transmitted',
    'accepted','rejected','amended','superseded')),
  filing_status TEXT NOT NULL DEFAULT 'not_filed' CHECK (filing_status IN (
    'not_filed','ready_to_file','transmitted','accepted','rejected')),
  document_generated_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  supersedes_id UUID REFERENCES public.partnership_returns(id) ON DELETE SET NULL,
  amendment_reason TEXT,
  prepared_by UUID,
  prepared_at TIMESTAMPTZ,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  manager_response TEXT,
  manager_note TEXT,
  manager_responded_by UUID,
  manager_responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_1065_year ON public.partnership_returns(tax_year_id);
GRANT SELECT, INSERT, UPDATE ON public.partnership_returns TO authenticated;
GRANT ALL ON public.partnership_returns TO service_role;
ALTER TABLE public.partnership_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read partnership returns" ON public.partnership_returns
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "managers read their partnership returns" ON public.partnership_returns
  FOR SELECT TO authenticated USING (private.manages_offering(offering_id));

CREATE TABLE public.k1_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID REFERENCES public.partnership_returns(id) ON DELETE SET NULL,
  tax_year_id UUID NOT NULL REFERENCES public.tax_years(id) ON DELETE CASCADE,
  offering_id UUID NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL,
  position_id UUID REFERENCES public.investor_positions(id) ON DELETE SET NULL,
  investment_profile_id UUID REFERENCES public.investment_profiles(id) ON DELETE SET NULL,
  investor_user_id UUID NOT NULL,
  partner_classification TEXT,
  is_foreign BOOLEAN NOT NULL DEFAULT false,
  boxes JSONB NOT NULL DEFAULT '{}'::jsonb,
  tax_capital JSONB NOT NULL DEFAULT '{}'::jsonb,
  book_capital JSONB NOT NULL DEFAULT '{}'::jsonb,
  outside_basis_available BOOLEAN NOT NULL DEFAULT false,
  outside_basis JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','review','approved','final','delivered','superseded','amended')),
  version INTEGER NOT NULL DEFAULT 1,
  supersedes_id UUID REFERENCES public.k1_forms(id) ON DELETE SET NULL,
  amendment_reason TEXT,
  prepared_by UUID,
  prepared_at TIMESTAMPTZ,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  storage_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_k1_year ON public.k1_forms(tax_year_id);
CREATE INDEX idx_k1_investor ON public.k1_forms(investor_user_id, tax_year);
GRANT SELECT, INSERT, UPDATE ON public.k1_forms TO authenticated;
GRANT ALL ON public.k1_forms TO service_role;
ALTER TABLE public.k1_forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read k1 forms" ON public.k1_forms
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "investors read their delivered k1" ON public.k1_forms
  FOR SELECT TO authenticated
  USING (investor_user_id = auth.uid() AND status IN ('delivered','superseded','amended'));

-- Extend the existing withholding ledger rather than replacing it.
ALTER TABLE public.withholding_records
  ADD COLUMN IF NOT EXISTS position_id UUID REFERENCES public.investor_positions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tax_document_id UUID REFERENCES public.tax_document_records(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS classification TEXT,
  ADD COLUMN IF NOT EXISTS withholding_classification TEXT NOT NULL DEFAULT 'chapter_3',
  ADD COLUMN IF NOT EXISTS rate_basis TEXT NOT NULL DEFAULT 'statutory',
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS source_id UUID,
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT,
  ADD COLUMN IF NOT EXISTS authority_reference TEXT,
  ADD COLUMN IF NOT EXISTS exceptions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS recorded_by UUID,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID;
CREATE UNIQUE INDEX IF NOT EXISTS idx_withholding_dedupe
  ON public.withholding_records(dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE TABLE public.form_1042s_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id UUID NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  tax_year_id UUID REFERENCES public.tax_years(id) ON DELETE SET NULL,
  tax_year INTEGER NOT NULL,
  recipient_user_id UUID,
  investment_profile_id UUID REFERENCES public.investment_profiles(id) ON DELETE SET NULL,
  income_code TEXT NOT NULL,
  chapter TEXT NOT NULL DEFAULT '3',
  country TEXT,
  gross_income_cents BIGINT NOT NULL DEFAULT 0,
  withheld_cents BIGINT NOT NULL DEFAULT 0,
  rate_bps INTEGER NOT NULL DEFAULT 0,
  exemption_code TEXT,
  withholding_record_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','review','approved','final','delivered','superseded','amended')),
  version INTEGER NOT NULL DEFAULT 1,
  supersedes_id UUID REFERENCES public.form_1042s_records(id) ON DELETE SET NULL,
  amendment_reason TEXT,
  prepared_by UUID,
  reviewed_by UUID,
  approved_by UUID,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_1042s_year ON public.form_1042s_records(offering_id, tax_year);
GRANT SELECT, INSERT, UPDATE ON public.form_1042s_records TO authenticated;
GRANT ALL ON public.form_1042s_records TO service_role;
ALTER TABLE public.form_1042s_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read 1042s" ON public.form_1042s_records
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "recipients read own delivered 1042s" ON public.form_1042s_records
  FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid() AND status IN ('delivered','superseded','amended'));

CREATE TABLE public.form_1042_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id UUID NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  tax_year_id UUID REFERENCES public.tax_years(id) ON DELETE SET NULL,
  tax_year INTEGER NOT NULL,
  control_totals JSONB NOT NULL DEFAULT '{}'::jsonb,
  recipient_totals JSONB NOT NULL DEFAULT '{}'::jsonb,
  difference_cents BIGINT NOT NULL DEFAULT 0,
  exceptions JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','prepared','review','approved','ready_to_file','transmitted',
    'accepted','rejected','amended','superseded')),
  filing_status TEXT NOT NULL DEFAULT 'not_filed' CHECK (filing_status IN (
    'not_filed','ready_to_file','transmitted','accepted','rejected')),
  version INTEGER NOT NULL DEFAULT 1,
  supersedes_id UUID REFERENCES public.form_1042_returns(id) ON DELETE SET NULL,
  prepared_by UUID,
  reviewed_by UUID,
  approved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.form_1042_returns TO authenticated;
GRANT ALL ON public.form_1042_returns TO service_role;
ALTER TABLE public.form_1042_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read 1042" ON public.form_1042_returns
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "managers read their 1042" ON public.form_1042_returns
  FOR SELECT TO authenticated USING (private.manages_offering(offering_id));

CREATE TABLE public.payee_payment_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id UUID REFERENCES public.offerings(id) ON DELETE CASCADE,
  entity_id UUID,
  tax_year INTEGER NOT NULL,
  payee_user_id UUID,
  payee_profile_id UUID REFERENCES public.investment_profiles(id) ON DELETE SET NULL,
  payee_name TEXT NOT NULL,
  payee_classification TEXT,
  tax_document_id UUID REFERENCES public.tax_document_records(id) ON DELETE SET NULL,
  tin_on_file BOOLEAN NOT NULL DEFAULT false,
  payment_type TEXT NOT NULL,
  gross_amount_cents BIGINT NOT NULL DEFAULT 0,
  reportable_amount_cents BIGINT,
  withheld_cents BIGINT NOT NULL DEFAULT 0,
  paid_on DATE,
  source_type TEXT NOT NULL,
  source_id UUID,
  dedupe_key TEXT NOT NULL,
  proposed_form_type TEXT,
  filing_responsibility TEXT NOT NULL DEFAULT 'undetermined'
    CHECK (filing_responsibility IN ('undetermined','harmonious','client','third_party','not_reportable')),
  determination_status TEXT NOT NULL DEFAULT 'identified' CHECK (determination_status IN (
    'identified','documentation_check','needs_review','calculated','excluded','reported')),
  determination_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_payee_payment_dedupe ON public.payee_payment_records(dedupe_key);
GRANT SELECT, INSERT, UPDATE ON public.payee_payment_records TO authenticated;
GRANT ALL ON public.payee_payment_records TO service_role;
ALTER TABLE public.payee_payment_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read payee payments" ON public.payee_payment_records
  FOR SELECT TO authenticated USING (public.is_any_staff());

CREATE TABLE public.form_1099_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id UUID REFERENCES public.offerings(id) ON DELETE CASCADE,
  tax_year_id UUID REFERENCES public.tax_years(id) ON DELETE SET NULL,
  tax_year INTEGER NOT NULL,
  form_type TEXT NOT NULL,
  payer_name TEXT NOT NULL,
  payer_entity_id UUID,
  recipient_user_id UUID,
  recipient_profile_id UUID REFERENCES public.investment_profiles(id) ON DELETE SET NULL,
  recipient_name TEXT NOT NULL,
  recipient_classification TEXT,
  tin_on_file BOOLEAN NOT NULL DEFAULT false,
  boxes JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_amount_cents BIGINT NOT NULL DEFAULT 0,
  withheld_cents BIGINT NOT NULL DEFAULT 0,
  payment_record_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
  exceptions JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'identified' CHECK (status IN (
    'identified','documentation_check','calculated','draft','review','approved',
    'ready_to_file','filed','recipient_delivered','corrected','superseded')),
  filing_status TEXT NOT NULL DEFAULT 'not_filed' CHECK (filing_status IN (
    'not_filed','ready_to_file','transmitted','accepted','rejected')),
  is_correction BOOLEAN NOT NULL DEFAULT false,
  corrects_id UUID REFERENCES public.form_1099_records(id) ON DELETE SET NULL,
  correction_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  prepared_by UUID,
  reviewed_by UUID,
  approved_by UUID,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_1099_year ON public.form_1099_records(tax_year, form_type);
GRANT SELECT, INSERT, UPDATE ON public.form_1099_records TO authenticated;
GRANT ALL ON public.form_1099_records TO service_role;
ALTER TABLE public.form_1099_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read 1099" ON public.form_1099_records
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "recipients read own delivered 1099" ON public.form_1099_records
  FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid()
    AND status IN ('recipient_delivered','corrected','superseded'));

CREATE TABLE public.taxpayer_households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  primary_person_id UUID REFERENCES public.persons(id) ON DELETE SET NULL,
  primary_user_id UUID NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.taxpayer_households TO authenticated;
GRANT ALL ON public.taxpayer_households TO service_role;
ALTER TABLE public.taxpayer_households ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read households" ON public.taxpayer_households
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "primary reads own household" ON public.taxpayer_households
  FOR SELECT TO authenticated USING (primary_user_id = auth.uid());

CREATE TABLE public.taxpayer_household_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.taxpayer_households(id) ON DELETE CASCADE,
  person_id UUID REFERENCES public.persons(id) ON DELETE SET NULL,
  member_user_id UUID,
  tax_year INTEGER NOT NULL,
  relationship TEXT NOT NULL CHECK (relationship IN (
    'primary','spouse','dependent','other')),
  filing_status TEXT CHECK (filing_status IN (
    'single','married_filing_jointly','married_filing_separately',
    'head_of_household','qualifying_surviving_spouse')),
  access_authorized BOOLEAN NOT NULL DEFAULT false,
  access_authorized_at TIMESTAMPTZ,
  access_authorized_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_household_member_year
  ON public.taxpayer_household_members(household_id, tax_year, member_user_id)
  WHERE member_user_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE ON public.taxpayer_household_members TO authenticated;
GRANT ALL ON public.taxpayer_household_members TO service_role;
ALTER TABLE public.taxpayer_household_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read household members" ON public.taxpayer_household_members
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "members read own membership" ON public.taxpayer_household_members
  FOR SELECT TO authenticated USING (member_user_id = auth.uid());

CREATE TABLE public.individual_tax_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.taxpayer_households(id) ON DELETE CASCADE,
  tax_year_id UUID REFERENCES public.tax_years(id) ON DELETE SET NULL,
  tax_year INTEGER NOT NULL,
  primary_user_id UUID NOT NULL,
  filing_status TEXT NOT NULL DEFAULT 'single',
  schedules JSONB NOT NULL DEFAULT '[]'::jsonb,
  totals JSONB NOT NULL DEFAULT '{}'::jsonb,
  missing_information JSONB NOT NULL DEFAULT '[]'::jsonb,
  calculation_version TEXT NOT NULL DEFAULT 'ind-1040-v1',
  source_manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'document_collection' CHECK (status IN (
    'document_collection','organizer','data_import','calculation','missing_information',
    'preparer_review','taxpayer_review','approved','ready_to_file','transmitted',
    'accepted','rejected','delivered','amended','superseded')),
  filing_status_code TEXT NOT NULL DEFAULT 'not_filed' CHECK (filing_status_code IN (
    'not_filed','ready_to_file','transmitted','accepted','rejected')),
  document_generated_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  supersedes_id UUID REFERENCES public.individual_tax_returns(id) ON DELETE SET NULL,
  amendment_reason TEXT,
  prepared_by UUID,
  prepared_at TIMESTAMPTZ,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  taxpayer_approved_by UUID,
  taxpayer_approved_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_1040_household ON public.individual_tax_returns(household_id, tax_year);
GRANT SELECT, INSERT, UPDATE ON public.individual_tax_returns TO authenticated;
GRANT ALL ON public.individual_tax_returns TO service_role;
ALTER TABLE public.individual_tax_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read individual returns" ON public.individual_tax_returns
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "primary taxpayer reads own return" ON public.individual_tax_returns
  FOR SELECT TO authenticated USING (primary_user_id = auth.uid());
CREATE POLICY "authorized household member reads return" ON public.individual_tax_returns
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.taxpayer_household_members m
    WHERE m.household_id = individual_tax_returns.household_id
      AND m.tax_year = individual_tax_returns.tax_year
      AND m.member_user_id = auth.uid()
      AND m.access_authorized
  ));

CREATE TABLE public.individual_tax_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.taxpayer_households(id) ON DELETE CASCADE,
  return_id UUID REFERENCES public.individual_tax_returns(id) ON DELETE SET NULL,
  owner_user_id UUID,
  person_id UUID REFERENCES public.persons(id) ON DELETE SET NULL,
  tax_year INTEGER NOT NULL,
  document_type TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'external' CHECK (origin IN ('harmonious','external','taxpayer')),
  source_table TEXT,
  source_id UUID,
  source_version INTEGER,
  issuer TEXT,
  structured_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  storage_path TEXT,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('requested','received','imported','excluded','superseded')),
  dedupe_key TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_indtaxdoc_dedupe ON public.individual_tax_documents(dedupe_key)
  WHERE dedupe_key IS NOT NULL;
GRANT SELECT, INSERT, UPDATE ON public.individual_tax_documents TO authenticated;
GRANT ALL ON public.individual_tax_documents TO service_role;
ALTER TABLE public.individual_tax_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read individual tax documents" ON public.individual_tax_documents
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "owner reads own individual tax documents" ON public.individual_tax_documents
  FOR SELECT TO authenticated USING (owner_user_id = auth.uid());

CREATE TABLE public.tax_return_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID NOT NULL REFERENCES public.individual_tax_returns(id) ON DELETE CASCADE,
  schedule_code TEXT NOT NULL,
  line_code TEXT NOT NULL,
  line_label TEXT,
  amount_cents BIGINT NOT NULL DEFAULT 0,
  provenance JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_taxreturnline_return ON public.tax_return_lines(return_id);
GRANT SELECT, INSERT ON public.tax_return_lines TO authenticated;
GRANT ALL ON public.tax_return_lines TO service_role;
ALTER TABLE public.tax_return_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read return lines" ON public.tax_return_lines
  FOR SELECT TO authenticated USING (public.is_any_staff());
CREATE POLICY "taxpayer reads own return lines" ON public.tax_return_lines
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.individual_tax_returns r
    WHERE r.id = tax_return_lines.return_id AND r.primary_user_id = auth.uid()
  ));

CREATE TABLE public.state_tax_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  federal_return_id UUID REFERENCES public.individual_tax_returns(id) ON DELETE CASCADE,
  partnership_return_id UUID REFERENCES public.partnership_returns(id) ON DELETE CASCADE,
  household_id UUID REFERENCES public.taxpayer_households(id) ON DELETE CASCADE,
  offering_id UUID REFERENCES public.offerings(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL,
  jurisdiction TEXT NOT NULL,
  residency TEXT CHECK (residency IN ('resident','part_year','nonresident')),
  source_income JSONB NOT NULL DEFAULT '{}'::jsonb,
  state_withholding_cents BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'not_started',
  filing_status_code TEXT NOT NULL DEFAULT 'not_filed',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.state_tax_returns TO authenticated;
GRANT ALL ON public.state_tax_returns TO service_role;
ALTER TABLE public.state_tax_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read state returns" ON public.state_tax_returns
  FOR SELECT TO authenticated USING (public.is_any_staff());

CREATE TABLE public.tax_workpapers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_year_id UUID REFERENCES public.tax_years(id) ON DELETE CASCADE,
  offering_id UUID REFERENCES public.offerings(id) ON DELETE CASCADE,
  household_id UUID REFERENCES public.taxpayer_households(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  exceptions JSONB NOT NULL DEFAULT '[]'::jsonb,
  support JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','prepared','reviewed','approved','superseded')),
  prepared_by UUID,
  prepared_at TIMESTAMPTZ,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.tax_workpapers TO authenticated;
GRANT ALL ON public.tax_workpapers TO service_role;
ALTER TABLE public.tax_workpapers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read tax workpapers" ON public.tax_workpapers
  FOR SELECT TO authenticated USING (public.is_any_staff());

CREATE TABLE public.tax_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_table TEXT NOT NULL,
  subject_id UUID NOT NULL,
  tax_year INTEGER,
  offering_id UUID,
  household_id UUID,
  event TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id UUID,
  on_behalf_of UUID,
  delegation_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tax_events_subject ON public.tax_events(subject_table, subject_id);
GRANT SELECT, INSERT ON public.tax_events TO authenticated;
GRANT ALL ON public.tax_events TO service_role;
ALTER TABLE public.tax_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read tax events" ON public.tax_events
  FOR SELECT TO authenticated USING (public.is_any_staff());

CREATE TABLE public.tax_access_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL,
  on_behalf_of UUID,
  delegation_id UUID,
  capability TEXT,
  resource_table TEXT NOT NULL,
  resource_id UUID,
  action TEXT NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT true,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.tax_access_events TO authenticated;
GRANT ALL ON public.tax_access_events TO service_role;
ALTER TABLE public.tax_access_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read tax access events" ON public.tax_access_events
  FOR SELECT TO authenticated USING (public.is_any_staff());

CREATE TABLE public.tax_provider_exchanges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'none',
  direction TEXT NOT NULL CHECK (direction IN ('outbound','inbound')),
  operation TEXT NOT NULL,
  subject_table TEXT NOT NULL,
  subject_id UUID NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider_reference TEXT,
  provider_status TEXT,
  accepted_by UUID,
  accepted_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.tax_provider_exchanges TO authenticated;
GRANT ALL ON public.tax_provider_exchanges TO service_role;
ALTER TABLE public.tax_provider_exchanges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read provider exchanges" ON public.tax_provider_exchanges
  FOR SELECT TO authenticated USING (public.is_any_staff());

CREATE OR REPLACE FUNCTION public.protect_final_tax_form()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  locked TEXT[] := ARRAY['final','delivered','filed','recipient_delivered','accepted','superseded','amended','corrected'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Tax forms cannot be deleted.';
  END IF;
  IF OLD.status = ANY(locked) THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status IN ('superseded','amended','corrected','delivered') THEN
      RETURN NEW;
    END IF;
    IF row_to_json(NEW)::text IS DISTINCT FROM row_to_json(OLD)::text THEN
      RAISE EXCEPTION 'A final or filed tax form cannot be rewritten; issue a corrected version.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_k1 BEFORE UPDATE OR DELETE ON public.k1_forms
  FOR EACH ROW EXECUTE FUNCTION public.protect_final_tax_form();
CREATE TRIGGER trg_protect_1042s BEFORE UPDATE OR DELETE ON public.form_1042s_records
  FOR EACH ROW EXECUTE FUNCTION public.protect_final_tax_form();
CREATE TRIGGER trg_protect_1099 BEFORE UPDATE OR DELETE ON public.form_1099_records
  FOR EACH ROW EXECUTE FUNCTION public.protect_final_tax_form();
CREATE TRIGGER trg_protect_1065 BEFORE UPDATE OR DELETE ON public.partnership_returns
  FOR EACH ROW EXECUTE FUNCTION public.protect_final_tax_form();
CREATE TRIGGER trg_protect_1040 BEFORE UPDATE OR DELETE ON public.individual_tax_returns
  FOR EACH ROW EXECUTE FUNCTION public.protect_final_tax_form();

CREATE OR REPLACE FUNCTION public.protect_tax_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Tax audit events are append-only.';
END;
$$;

CREATE TRIGGER trg_protect_tax_events BEFORE UPDATE OR DELETE ON public.tax_events
  FOR EACH ROW EXECUTE FUNCTION public.protect_tax_events();
CREATE TRIGGER trg_protect_tax_access_events BEFORE UPDATE OR DELETE ON public.tax_access_events
  FOR EACH ROW EXECUTE FUNCTION public.protect_tax_events();

CREATE OR REPLACE FUNCTION public.protect_finalized_tax_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Finalized tax allocations cannot be deleted.';
  END IF;
  IF OLD.status = 'finalized' AND NEW.status NOT IN ('finalized','superseded') THEN
    RAISE EXCEPTION 'A finalized tax allocation run can only be superseded.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_tax_alloc BEFORE UPDATE OR DELETE ON public.tax_allocation_runs
  FOR EACH ROW EXECUTE FUNCTION public.protect_finalized_tax_allocation();
