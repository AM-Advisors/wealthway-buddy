CREATE TABLE public.investor_document_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL,
  onboarding_id uuid NOT NULL,
  offering_document_id uuid NOT NULL,
  version integer,
  decision text NOT NULL CHECK (decision IN ('approved','returned')),
  note text,
  decided_by uuid NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  CHECK (decision = 'approved' OR coalesce(length(trim(note)),0) > 0)
);
CREATE INDEX investor_document_approvals_lookup ON public.investor_document_approvals (onboarding_id, offering_document_id, decided_at DESC);
GRANT ALL ON public.investor_document_approvals TO service_role;
ALTER TABLE public.investor_document_approvals ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.block_investor_document_approval_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Investor document approvals are append-only'; END; $$;
CREATE TRIGGER investor_document_approvals_append_only BEFORE UPDATE OR DELETE ON public.investor_document_approvals
FOR EACH ROW EXECUTE FUNCTION public.block_investor_document_approval_mutation();