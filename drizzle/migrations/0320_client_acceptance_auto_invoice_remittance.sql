ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS sales_document_id uuid, ADD COLUMN IF NOT EXISTS sales_quote_id uuid, ADD COLUMN IF NOT EXISTS acceptance_key text;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_acceptance_key_uniq ON public.invoices(acceptance_key) WHERE acceptance_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS invoices_sales_quote_idx ON public.invoices(sales_quote_id);

CREATE TABLE public.sales_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('quote','proposal','rfp','rfq')),
  sales_document_id uuid,
  sales_quote_id uuid,
  version integer NOT NULL,
  client_id uuid,
  signer_name text NOT NULL,
  signer_title text,
  signer_email text,
  signer_user_id uuid,
  via text NOT NULL CHECK (via IN ('link','portal')),
  content_hash text NOT NULL,
  ip text,
  user_agent text,
  payment_method text CHECK (payment_method IN ('card','wire','ach')),
  invoice_id uuid,
  invoice_error text,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  acceptance_key text NOT NULL UNIQUE
);
GRANT ALL ON public.sales_acceptances TO service_role;
ALTER TABLE public.sales_acceptances ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.block_sales_acceptance_rewrite() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Signed acceptances are permanent'; END IF;
  IF NEW.signer_name IS DISTINCT FROM OLD.signer_name OR NEW.version IS DISTINCT FROM OLD.version OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
     OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at OR NEW.acceptance_key IS DISTINCT FROM OLD.acceptance_key
     OR (OLD.invoice_id IS NOT NULL AND NEW.invoice_id IS DISTINCT FROM OLD.invoice_id) THEN
    RAISE EXCEPTION 'Signed acceptances are permanent';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sales_acceptances_immutable BEFORE UPDATE OR DELETE ON public.sales_acceptances FOR EACH ROW EXECUTE FUNCTION public.block_sales_acceptance_rewrite();

CREATE TABLE public.harmonious_remittance_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  method text NOT NULL CHECK (method IN ('wire','ach')),
  bank_name text NOT NULL,
  account_name text NOT NULL,
  account_number text NOT NULL,
  routing_number text NOT NULL,
  swift_code text,
  bank_address text,
  beneficiary_address text,
  reference_note text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','retired','rejected')),
  prepared_by uuid NOT NULL,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid,
  approved_at timestamptz,
  self_approval_reason text,
  retired_at timestamptz
);
GRANT ALL ON public.harmonious_remittance_versions TO service_role;
ALTER TABLE public.harmonious_remittance_versions ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX harmonious_remittance_one_approved ON public.harmonious_remittance_versions(method) WHERE status = 'approved';

CREATE OR REPLACE FUNCTION public.block_remittance_rewrite() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Payment instruction versions are permanent'; END IF;
  IF NEW.bank_name IS DISTINCT FROM OLD.bank_name OR NEW.account_name IS DISTINCT FROM OLD.account_name OR NEW.account_number IS DISTINCT FROM OLD.account_number
     OR NEW.routing_number IS DISTINCT FROM OLD.routing_number OR NEW.swift_code IS DISTINCT FROM OLD.swift_code OR NEW.bank_address IS DISTINCT FROM OLD.bank_address
     OR NEW.beneficiary_address IS DISTINCT FROM OLD.beneficiary_address OR NEW.method IS DISTINCT FROM OLD.method OR NEW.prepared_by IS DISTINCT FROM OLD.prepared_by THEN
    RAISE EXCEPTION 'Payment instruction details cannot be edited; add a new version';
  END IF;
  IF OLD.status IN ('retired','rejected') THEN RAISE EXCEPTION 'This version is closed'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER harmonious_remittance_immutable BEFORE UPDATE OR DELETE ON public.harmonious_remittance_versions FOR EACH ROW EXECUTE FUNCTION public.block_remittance_rewrite();

CREATE TABLE public.remittance_view_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  remittance_version_id uuid,
  invoice_id uuid,
  viewer_user_id uuid,
  viewer_email text,
  via text NOT NULL,
  revealed boolean NOT NULL DEFAULT false,
  ip text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.remittance_view_events TO service_role;
ALTER TABLE public.remittance_view_events ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER remittance_view_events_immutable BEFORE UPDATE OR DELETE ON public.remittance_view_events FOR EACH ROW EXECUTE FUNCTION public.block_access_audit_mutation();