CREATE TABLE public.fund_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text,
  phone text,
  company text,
  team_role text NOT NULL CHECK (team_role IN ('gp','manager','member','counsel','auditor','tax_preparer','accountant')),
  permissions text[] NOT NULL DEFAULT '{}',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  removed_by uuid
);
GRANT ALL ON public.fund_team_members TO service_role;
ALTER TABLE public.fund_team_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX fund_team_members_off_idx ON public.fund_team_members(offering_id);

CREATE TABLE public.fund_fee_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  management_fee_pct numeric(6,3),
  management_fee_basis text,
  carry_pct numeric(6,3),
  hurdle_pct numeric(6,3),
  notes text,
  status text NOT NULL CHECK (status IN ('active','pending_approval','rejected','superseded')),
  requested_by uuid NOT NULL,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.fund_fee_terms TO service_role;
ALTER TABLE public.fund_fee_terms ENABLE ROW LEVEL SECURITY;
CREATE INDEX fund_fee_terms_off_idx ON public.fund_fee_terms(offering_id, created_at DESC);

CREATE TABLE public.fund_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  file_name text,
  storage_path text,
  content_type text,
  size_bytes bigint,
  body text,
  template_key text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','out_for_signature','signed')),
  signature_boxes jsonb NOT NULL DEFAULT '[]',
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid
);
GRANT ALL ON public.fund_files TO service_role;
ALTER TABLE public.fund_files ENABLE ROW LEVEL SECURITY;
CREATE INDEX fund_files_off_idx ON public.fund_files(offering_id);

CREATE TABLE public.fund_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  bank_transaction_id uuid,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  voided_by uuid,
  void_reason text
);
GRANT ALL ON public.fund_ledger_entries TO service_role;
ALTER TABLE public.fund_ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE INDEX fund_ledger_entries_off_idx ON public.fund_ledger_entries(offering_id, entry_date DESC);

CREATE TABLE public.fund_transaction_tags (
  bank_transaction_id uuid PRIMARY KEY,
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  onboarding_id uuid,
  asset_label text,
  tagged_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.fund_transaction_tags TO service_role;
ALTER TABLE public.fund_transaction_tags ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.fund_proposed_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  close_request_id uuid,
  asset_name text NOT NULL,
  issuer_name text,
  asset_type text,
  amount_cents bigint,
  purchase_agreement_path text,
  purchase_agreement_name text,
  details jsonb NOT NULL DEFAULT '{}',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.fund_proposed_assets TO service_role;
ALTER TABLE public.fund_proposed_assets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.fund_close_requests ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}';