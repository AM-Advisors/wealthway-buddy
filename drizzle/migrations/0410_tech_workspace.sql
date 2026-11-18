ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'tech_team';

CREATE TABLE public.tech_backlog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('bug','enhancement')),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 3 AND 200),
  summary text NOT NULL DEFAULT '' CHECK (length(summary) <= 4000),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  area text NOT NULL DEFAULT 'general' CHECK (length(area) BETWEEN 2 AND 60),
  roadmap_column text NOT NULL DEFAULT 'later' CHECK (roadmap_column IN ('now','next','later','done')),
  target_month text CHECK (target_month IS NULL OR target_month ~ '^\d{4}-\d{2}$'),
  source text NOT NULL DEFAULT 'staff' CHECK (source IN ('feedback','error','software_issue','custom_service','staff')),
  source_ref text,
  software_issue_id uuid REFERENCES public.software_issues(id),
  custom_service_id uuid REFERENCES public.sales_custom_services(id),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.tech_backlog_items TO service_role;
ALTER TABLE public.tech_backlog_items ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX tech_backlog_source_ref ON public.tech_backlog_items(source_ref) WHERE source_ref IS NOT NULL;
CREATE INDEX tech_backlog_column_idx ON public.tech_backlog_items(roadmap_column, priority);

CREATE TABLE public.tech_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id uuid NOT NULL,
  audience text NOT NULL CHECK (audience IN ('client','investor','staff')),
  kind text NOT NULL CHECK (kind IN ('bug','idea')),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 3 AND 200),
  details text NOT NULL CHECK (length(trim(details)) BETWEEN 5 AND 4000),
  page text CHECK (page IS NULL OR length(page) <= 300),
  browser text CHECK (browser IS NULL OR length(browser) <= 300),
  screenshot_path text,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','needs_info','accepted','merged','not_planned','released')),
  status_note text CHECK (status_note IS NULL OR length(status_note) <= 2000),
  backlog_item_id uuid REFERENCES public.tech_backlog_items(id),
  merged_into uuid REFERENCES public.tech_feedback(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tech_feedback_not_planned_reason CHECK (status <> 'not_planned' OR status_note IS NOT NULL),
  CONSTRAINT tech_feedback_merge_target CHECK (status <> 'merged' OR merged_into IS NOT NULL)
);
GRANT ALL ON public.tech_feedback TO service_role;
ALTER TABLE public.tech_feedback ENABLE ROW LEVEL SECURITY;
CREATE INDEX tech_feedback_reporter_idx ON public.tech_feedback(reporter_user_id, created_at DESC);
CREATE INDEX tech_feedback_status_idx ON public.tech_feedback(status, created_at DESC);

CREATE TABLE public.tech_release_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 3 AND 200),
  body text NOT NULL CHECK (length(trim(body)) BETWEEN 5 AND 8000),
  audience text NOT NULL DEFAULT 'staff' CHECK (audience IN ('staff','clients')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  published_by uuid
);
GRANT ALL ON public.tech_release_notes TO service_role;
ALTER TABLE public.tech_release_notes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.tech_release_note_items (
  note_id uuid NOT NULL REFERENCES public.tech_release_notes(id),
  backlog_item_id uuid NOT NULL REFERENCES public.tech_backlog_items(id),
  PRIMARY KEY (note_id, backlog_item_id)
);
GRANT ALL ON public.tech_release_note_items TO service_role;
ALTER TABLE public.tech_release_note_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.tech_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL CHECK (subject_type IN ('feedback','backlog','release_note')),
  subject_id uuid NOT NULL,
  actor_id uuid,
  event text NOT NULL CHECK (length(event) BETWEEN 2 AND 40),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.tech_events TO service_role;
ALTER TABLE public.tech_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX tech_events_subject_idx ON public.tech_events(subject_type, subject_id, created_at);

CREATE FUNCTION public.block_tech_history_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'tech_events' THEN RAISE EXCEPTION 'Tech history can''t be changed or deleted'; END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Tech records are kept on file'; END IF;
  IF TG_TABLE_NAME = 'tech_release_notes' AND OLD.published_at IS NOT NULL THEN RAISE EXCEPTION 'A published release note can''t be changed'; END IF;
  IF TG_TABLE_NAME = 'tech_feedback' AND (NEW.reporter_user_id <> OLD.reporter_user_id OR NEW.details <> OLD.details OR NEW.created_at <> OLD.created_at) THEN
    RAISE EXCEPTION 'What the reporter wrote can''t be changed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tech_events_append_only BEFORE UPDATE OR DELETE ON public.tech_events FOR EACH ROW EXECUTE FUNCTION public.block_tech_history_mutation();
CREATE TRIGGER tech_feedback_guard BEFORE UPDATE OR DELETE ON public.tech_feedback FOR EACH ROW EXECUTE FUNCTION public.block_tech_history_mutation();
CREATE TRIGGER tech_backlog_guard BEFORE DELETE ON public.tech_backlog_items FOR EACH ROW EXECUTE FUNCTION public.block_tech_history_mutation();
CREATE TRIGGER tech_release_notes_guard BEFORE UPDATE OR DELETE ON public.tech_release_notes FOR EACH ROW EXECUTE FUNCTION public.block_tech_history_mutation();
CREATE TRIGGER tech_release_note_items_guard BEFORE DELETE ON public.tech_release_note_items FOR EACH ROW EXECUTE FUNCTION public.block_tech_history_mutation();

-- Seed from items already tracked: open software issues and services marked Needs design or build.
INSERT INTO public.tech_backlog_items (kind, title, summary, priority, area, roadmap_column, source, source_ref, software_issue_id)
SELECT 'bug', left(i.title, 200), left(i.impact, 4000), 'normal', 'general', CASE WHEN i.stage IN ('in_progress','fixed','deployed','retest_failed') THEN 'now' ELSE 'next' END, 'software_issue', 'software_issue:' || i.id, i.id
FROM public.software_issues i WHERE i.stage <> 'resolved';
INSERT INTO public.tech_backlog_items (kind, title, summary, area, roadmap_column, source, source_ref, custom_service_id)
SELECT 'enhancement', left(s.name, 200), left(s.summary, 4000), 'sales', 'later', 'custom_service', 'custom_service:' || s.id, s.id
FROM public.sales_custom_services s WHERE s.review_status = 'design_build' AND s.archived_at IS NULL AND s.released_at IS NULL;