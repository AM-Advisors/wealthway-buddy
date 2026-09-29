ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS contract_structure text NOT NULL DEFAULT 'not_determined';
ALTER TABLE public.clients ADD CONSTRAINT clients_contract_structure_check
  CHECK (contract_structure IN ('combined','separate','msa_only','sow_only','not_determined'));

CREATE TABLE public.contract_structure_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  from_structure text,
  to_structure text NOT NULL,
  reason text,
  actor_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.contract_structure_events TO service_role;
ALTER TABLE public.contract_structure_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.block_contract_structure_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'contract structure history is append-only'; END $$;
CREATE TRIGGER contract_structure_events_append_only BEFORE UPDATE OR DELETE ON public.contract_structure_events
  FOR EACH ROW EXECUTE FUNCTION public.block_contract_structure_event_mutation();

CREATE TABLE public.related_person_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.investment_profiles(id) ON DELETE CASCADE,
  relationship_id uuid NOT NULL REFERENCES public.investment_profile_relationships(id) ON DELETE CASCADE,
  provisional_person_id uuid NOT NULL REFERENCES public.persons(id),
  offering_id uuid,
  match_kind text NOT NULL CHECK (match_kind IN ('possible','ambiguous','claim_ambiguous')),
  candidate_person_ids uuid[] NOT NULL DEFAULT '{}',
  supplied jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','review_later','used_existing','kept_new')),
  resolved_person_id uuid REFERENCES public.persons(id),
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.related_person_reviews TO service_role;
ALTER TABLE public.related_person_reviews ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX related_person_reviews_one_open ON public.related_person_reviews(relationship_id) WHERE status IN ('open','review_later');