CREATE TABLE public.record_locks (
  resource_key text PRIMARY KEY,
  locked_by uuid,
  locked_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.record_locks TO service_role;
ALTER TABLE public.record_locks ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.locked_edit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_key text NOT NULL,
  action text NOT NULL,
  summary text NOT NULL DEFAULT '',
  payload jsonb NOT NULL,
  requested_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','withdrawn','failed')),
  decided_by uuid,
  decided_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX locked_edit_requests_pending ON public.locked_edit_requests (status, created_at);
GRANT ALL ON public.locked_edit_requests TO service_role;
ALTER TABLE public.locked_edit_requests ENABLE ROW LEVEL SECURITY;

INSERT INTO public.record_locks (resource_key)
SELECT 'legal_name:' || id FROM public.offerings WHERE coalesce(legal_entity_name,'') <> ''
ON CONFLICT DO NOTHING;
INSERT INTO public.record_locks (resource_key)
SELECT DISTINCT 'economics:' || offering_id FROM public.fund_fee_terms WHERE offering_id IS NOT NULL
ON CONFLICT DO NOTHING;