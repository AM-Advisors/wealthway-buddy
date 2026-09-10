ALTER TABLE public.service_requests ALTER COLUMN status SET DEFAULT 'requested';
UPDATE public.service_requests SET status = 'requested' WHERE status = 'submitted';