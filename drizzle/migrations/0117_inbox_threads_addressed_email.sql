ALTER TABLE public.inbox_threads ADD COLUMN IF NOT EXISTS addressed_email text;
ALTER TABLE public.inbox_threads ADD COLUMN IF NOT EXISTS started_side text NOT NULL DEFAULT 'client';
CREATE INDEX IF NOT EXISTS inbox_threads_addressed_email_idx ON public.inbox_threads (lower(addressed_email));