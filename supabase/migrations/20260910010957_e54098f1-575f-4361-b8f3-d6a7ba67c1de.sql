ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS sow_id uuid REFERENCES public.client_sows(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS service_requests_sow_id_idx ON public.service_requests(sow_id);