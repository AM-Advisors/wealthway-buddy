CREATE TABLE public.side_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id),
  onboarding_id uuid REFERENCES public.investor_onboardings(id),
  person_id uuid REFERENCES public.persons(id),
  investor_label text NOT NULL,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','active','terminated','declined')),
  mfn_enabled boolean NOT NULL DEFAULT false,
  mfn_scope text CHECK (mfn_scope IN ('all_investors','same_class','commitment_at_or_below')),
  effective_date date,
  expiry_date date,
  renewal_note text,
  terms jsonb NOT NULL DEFAULT '[]'::jsonb,
  current_version integer NOT NULL DEFAULT 0,
  document_reference text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX side_letters_offering_idx ON public.side_letters(offering_id);

CREATE TABLE public.side_letter_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  side_letter_id uuid NOT NULL REFERENCES public.side_letters(id),
  version integer NOT NULL,
  snapshot jsonb NOT NULL,
  change_request_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (side_letter_id, version)
);

CREATE TABLE public.side_letter_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  side_letter_id uuid NOT NULL REFERENCES public.side_letters(id),
  offering_id uuid NOT NULL REFERENCES public.offerings(id),
  kind text NOT NULL CHECK (kind IN ('create','amend','terminate')),
  before_snapshot jsonb,
  after_snapshot jsonb NOT NULL,
  reason text NOT NULL,
  proposed_by uuid NOT NULL,
  proposer_kind text NOT NULL CHECK (proposer_kind IN ('staff','manager','assistant')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined','withdrawn')),
  decided_by uuid,
  decided_at timestamptz,
  decision_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX side_letter_cr_offering_idx ON public.side_letter_change_requests(offering_id, status);

CREATE TABLE public.side_letter_mfn_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id),
  source_side_letter_id uuid NOT NULL REFERENCES public.side_letters(id),
  source_term_id text NOT NULL,
  holder_side_letter_id uuid NOT NULL REFERENCES public.side_letters(id),
  decision text NOT NULL CHECK (decision IN ('offered','elected','declined','not_eligible')),
  reason text NOT NULL,
  decided_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.side_letter_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.offerings(id),
  side_letter_id uuid REFERENCES public.side_letters(id),
  event text NOT NULL,
  actor_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.side_letters, public.side_letter_versions, public.side_letter_change_requests, public.side_letter_mfn_reviews, public.side_letter_events TO authenticated;
GRANT ALL ON public.side_letters, public.side_letter_versions, public.side_letter_change_requests, public.side_letter_mfn_reviews, public.side_letter_events TO service_role;

CREATE OR REPLACE FUNCTION public.can_view_side_letters(_offering_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_any_staff()
    OR EXISTS (SELECT 1 FROM public.fund_managers fm WHERE fm.offering_id = _offering_id AND fm.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.fund_team_grants g WHERE g.offering_id = _offering_id AND g.grantee_user_id = auth.uid()
               AND g.status = 'active' AND (g.expires_at IS NULL OR g.expires_at > now()))
  )
$$;

ALTER TABLE public.side_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.side_letter_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.side_letter_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.side_letter_mfn_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.side_letter_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fund team reads side letters" ON public.side_letters FOR SELECT TO authenticated USING (public.can_view_side_letters(offering_id));
CREATE POLICY "fund team reads side letter versions" ON public.side_letter_versions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.side_letters s WHERE s.id = side_letter_id AND public.can_view_side_letters(s.offering_id)));
CREATE POLICY "fund team reads side letter changes" ON public.side_letter_change_requests FOR SELECT TO authenticated USING (public.can_view_side_letters(offering_id));
CREATE POLICY "fund team reads mfn reviews" ON public.side_letter_mfn_reviews FOR SELECT TO authenticated USING (public.can_view_side_letters(offering_id));
CREATE POLICY "fund team reads side letter events" ON public.side_letter_events FOR SELECT TO authenticated USING (public.can_view_side_letters(offering_id));

CREATE OR REPLACE FUNCTION public.guard_side_letter_history()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Side letter history is append-only';
END $$;
CREATE TRIGGER side_letter_versions_append_only BEFORE UPDATE OR DELETE ON public.side_letter_versions FOR EACH ROW EXECUTE FUNCTION public.guard_side_letter_history();
CREATE TRIGGER side_letter_mfn_append_only BEFORE UPDATE OR DELETE ON public.side_letter_mfn_reviews FOR EACH ROW EXECUTE FUNCTION public.guard_side_letter_history();
CREATE TRIGGER side_letter_events_append_only BEFORE UPDATE OR DELETE ON public.side_letter_events FOR EACH ROW EXECUTE FUNCTION public.guard_side_letter_history();

CREATE OR REPLACE FUNCTION public.guard_side_letter_change_request()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Side letter change requests cannot be deleted'; END IF;
  IF OLD.status <> 'pending' THEN RAISE EXCEPTION 'Decided change requests are immutable'; END IF;
  IF NEW.status IN ('approved','declined') AND NEW.decided_by = NEW.proposed_by THEN
    RAISE EXCEPTION 'The proposer cannot decide their own side letter change';
  END IF;
  IF NEW.status = 'declined' AND coalesce(btrim(NEW.decision_reason),'') = '' THEN
    RAISE EXCEPTION 'A decline reason is required';
  END IF;
  IF NEW.after_snapshot IS DISTINCT FROM OLD.after_snapshot OR NEW.proposed_by IS DISTINCT FROM OLD.proposed_by THEN
    RAISE EXCEPTION 'Proposal content cannot be changed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER side_letter_cr_guard BEFORE UPDATE OR DELETE ON public.side_letter_change_requests FOR EACH ROW EXECUTE FUNCTION public.guard_side_letter_change_request();

CREATE OR REPLACE FUNCTION public.block_side_letter_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Side letters are retained, never deleted'; END $$;
CREATE TRIGGER side_letters_no_delete BEFORE DELETE ON public.side_letters FOR EACH ROW EXECUTE FUNCTION public.block_side_letter_delete();