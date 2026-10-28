CREATE TABLE public.fund_questionnaire_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  version integer NOT NULL,
  title text NOT NULL DEFAULT 'Additional fund questions',
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_note text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','retired')),
  prepared_by uuid,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid,
  approved_at timestamptz,
  approval_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offering_id, version)
);
GRANT ALL ON public.fund_questionnaire_sections TO service_role;
ALTER TABLE public.fund_questionnaire_sections ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.guard_fund_questionnaire_section() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'Approved question sections are kept; retire them instead.'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'draft' THEN
    IF NEW.questions IS DISTINCT FROM OLD.questions OR NEW.title IS DISTINCT FROM OLD.title OR NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at OR NOT (OLD.status = 'approved' AND NEW.status = 'retired') THEN
      RAISE EXCEPTION 'Approved question sections cannot be changed; create a new version.';
    END IF;
  END IF;
  IF NEW.status = 'approved' AND OLD.status = 'draft' AND NEW.approved_by IS NULL THEN
    RAISE EXCEPTION 'Approval needs a reviewer.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_fund_questionnaire_section BEFORE UPDATE OR DELETE ON public.fund_questionnaire_sections
  FOR EACH ROW EXECUTE FUNCTION public.guard_fund_questionnaire_section();

ALTER TABLE public.investor_onboardings ADD COLUMN IF NOT EXISTS questionnaire_section_version integer;