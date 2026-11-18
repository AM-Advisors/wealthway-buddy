CREATE TABLE public.report_card_downloads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  card_ids uuid[] NOT NULL,
  format text NOT NULL CHECK (format IN ('pdf','csv','xlsx','json')),
  scope text NOT NULL CHECK (scope IN ('card','list','compare')),
  label text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.report_card_downloads TO service_role;
ALTER TABLE public.report_card_downloads ENABLE ROW LEVEL SECURITY;
CREATE INDEX report_card_downloads_actor_idx ON public.report_card_downloads (actor_id, created_at DESC);

CREATE TABLE public.report_card_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.report_card_versions(id),
  requester_id uuid NOT NULL,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.report_card_access_requests TO service_role;
ALTER TABLE public.report_card_access_requests ENABLE ROW LEVEL SECURITY;
CREATE INDEX report_card_access_requests_card_idx ON public.report_card_access_requests (card_id, requester_id);

CREATE TABLE public.report_card_access_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.report_card_access_requests(id),
  actor_id uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approved','denied','revoked')),
  reason text NOT NULL DEFAULT '',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.report_card_access_decisions TO service_role;
ALTER TABLE public.report_card_access_decisions ENABLE ROW LEVEL SECURITY;
CREATE INDEX report_card_access_decisions_request_idx ON public.report_card_access_decisions (request_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.block_report_card_insight_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Report card download and access history is permanent.';
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_report_card_access_decision()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE requester uuid;
BEGIN
  SELECT requester_id INTO requester FROM public.report_card_access_requests WHERE id = NEW.request_id;
  IF requester = NEW.actor_id THEN
    RAISE EXCEPTION 'Someone other than the requester must decide.';
  END IF;
  IF NEW.decision = 'approved' THEN
    IF NEW.expires_at IS NULL OR NEW.expires_at <= now() OR NEW.expires_at > now() + interval '30 days 1 hour' THEN
      RAISE EXCEPTION 'Approved access must end within 30 days.';
    END IF;
  ELSE
    NEW.expires_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER report_card_downloads_immutable BEFORE UPDATE OR DELETE ON public.report_card_downloads
  FOR EACH ROW EXECUTE FUNCTION public.block_report_card_insight_mutation();
CREATE TRIGGER report_card_access_requests_immutable BEFORE UPDATE OR DELETE ON public.report_card_access_requests
  FOR EACH ROW EXECUTE FUNCTION public.block_report_card_insight_mutation();
CREATE TRIGGER report_card_access_decisions_immutable BEFORE UPDATE OR DELETE ON public.report_card_access_decisions
  FOR EACH ROW EXECUTE FUNCTION public.block_report_card_insight_mutation();
CREATE TRIGGER report_card_access_decisions_validate BEFORE INSERT ON public.report_card_access_decisions
  FOR EACH ROW EXECUTE FUNCTION public.validate_report_card_access_decision();