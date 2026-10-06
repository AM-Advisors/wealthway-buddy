CREATE TABLE public.staff_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  description text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','blocked','done','cancelled')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  team text,
  assignee_user_id uuid,
  created_by uuid,
  due_date date,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','hubspot')),
  source_ref text,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  offering_id uuid REFERENCES public.offerings(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX staff_tasks_source_ref_uq ON public.staff_tasks(source, source_ref) WHERE source_ref IS NOT NULL;
CREATE INDEX staff_tasks_assignee_idx ON public.staff_tasks(assignee_user_id, status);
GRANT ALL ON public.staff_tasks TO service_role;
ALTER TABLE public.staff_tasks ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.staff_task_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.staff_tasks(id) ON DELETE CASCADE,
  actor_user_id uuid,
  kind text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX staff_task_events_task_idx ON public.staff_task_events(task_id, created_at);
GRANT ALL ON public.staff_task_events TO service_role;
ALTER TABLE public.staff_task_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.block_staff_task_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'staff_task_events is append-only'; END $$;
CREATE TRIGGER staff_task_events_append_only BEFORE UPDATE OR DELETE ON public.staff_task_events
FOR EACH ROW EXECUTE FUNCTION public.block_staff_task_event_mutation();

ALTER TABLE public.hubspot_ops_tickets DROP CONSTRAINT IF EXISTS hubspot_ops_tickets_status_check;
ALTER TABLE public.hubspot_ops_tickets ADD CONSTRAINT hubspot_ops_tickets_status_check CHECK (status IN ('linked','created','needs_review','service_request','dismissed','task'));