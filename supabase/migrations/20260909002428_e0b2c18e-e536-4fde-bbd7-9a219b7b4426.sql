-- NDA settings on the room
ALTER TABLE public.diligence_rooms
  ADD COLUMN IF NOT EXISTS nda_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS nda_text text,
  ADD COLUMN IF NOT EXISTS nda_version integer NOT NULL DEFAULT 1;

ALTER TABLE public.diligence_documents
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- ============ NDA acceptances ============
CREATE TABLE public.diligence_nda_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.diligence_rooms(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  nda_version integer NOT NULL,
  signer_name text NOT NULL,
  nda_hash text NOT NULL,
  ip_address text,
  user_agent text,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id, nda_version)
);
GRANT SELECT, INSERT ON public.diligence_nda_acceptances TO authenticated;
GRANT ALL ON public.diligence_nda_acceptances TO service_role;
ALTER TABLE public.diligence_nda_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own nda read" ON public.diligence_nda_acceptances
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_manage_diligence(offering_id));
CREATE POLICY "own nda insert" ON public.diligence_nda_acceptances
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_view_diligence(offering_id));

CREATE INDEX idx_dna_room_user ON public.diligence_nda_acceptances(room_id, user_id);

-- ============ NDA gate helper ============
CREATE OR REPLACE FUNCTION public.diligence_access_open(_offering_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.can_manage_diligence(_offering_id)
    OR EXISTS (
      SELECT 1 FROM public.diligence_rooms r
      WHERE r.offering_id = _offering_id
        AND public.can_view_diligence(_offering_id)
        AND (
          r.nda_required = false
          OR EXISTS (
            SELECT 1 FROM public.diligence_nda_acceptances a
            WHERE a.room_id = r.id AND a.user_id = auth.uid() AND a.nda_version = r.nda_version
          )
        )
    )
  )
$$;
REVOKE EXECUTE ON FUNCTION public.diligence_access_open(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.diligence_access_open(uuid) TO authenticated;

-- Re-gate document reads behind the NDA
DROP POLICY IF EXISTS "diligence documents viewable" ON public.diligence_documents;
DROP POLICY IF EXISTS "diligence_documents_select" ON public.diligence_documents;
CREATE POLICY "diligence documents read behind nda" ON public.diligence_documents
  FOR SELECT TO authenticated
  USING (public.diligence_access_open(offering_id));

-- ============ Document versions ============
CREATE TABLE public.diligence_document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.diligence_documents(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  version integer NOT NULL,
  box_file_id text NOT NULL,
  file_name text NOT NULL,
  size_bytes bigint,
  note text,
  uploaded_by uuid NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version)
);
GRANT SELECT, INSERT ON public.diligence_document_versions TO authenticated;
GRANT ALL ON public.diligence_document_versions TO service_role;
ALTER TABLE public.diligence_document_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "versions readable behind nda" ON public.diligence_document_versions
  FOR SELECT TO authenticated USING (public.diligence_access_open(offering_id));
CREATE POLICY "versions insert by managers" ON public.diligence_document_versions
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_diligence(offering_id));

CREATE INDEX idx_ddv_document ON public.diligence_document_versions(document_id, version DESC);

-- ============ Checklist ============
CREATE TABLE public.diligence_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.diligence_rooms(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'other',
  label text NOT NULL,
  description text,
  is_required boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  document_id uuid REFERENCES public.diligence_documents(id) ON DELETE SET NULL,
  completed_at timestamptz,
  completed_by uuid,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT diligence_checklist_status CHECK (status IN ('pending','in_progress','complete','waived'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.diligence_checklist_items TO authenticated;
GRANT ALL ON public.diligence_checklist_items TO service_role;
ALTER TABLE public.diligence_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checklist readable" ON public.diligence_checklist_items
  FOR SELECT TO authenticated USING (public.diligence_access_open(offering_id));
CREATE POLICY "checklist managed" ON public.diligence_checklist_items
  FOR ALL TO authenticated
  USING (public.can_manage_diligence(offering_id))
  WITH CHECK (public.can_manage_diligence(offering_id));

CREATE INDEX idx_dci_room ON public.diligence_checklist_items(room_id, sort_order);
CREATE TRIGGER diligence_checklist_updated BEFORE UPDATE ON public.diligence_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ Questions & answers ============
CREATE TABLE public.diligence_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.diligence_rooms(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  asked_by uuid NOT NULL,
  asker_name text,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT diligence_question_status CHECK (status IN ('open','answered','closed'))
);
GRANT SELECT, INSERT, UPDATE ON public.diligence_questions TO authenticated;
GRANT ALL ON public.diligence_questions TO service_role;
ALTER TABLE public.diligence_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "questions readable" ON public.diligence_questions
  FOR SELECT TO authenticated
  USING (
    public.can_manage_diligence(offering_id)
    OR (public.diligence_access_open(offering_id) AND (asked_by = auth.uid() OR is_published))
  );
CREATE POLICY "questions asked by viewers" ON public.diligence_questions
  FOR INSERT TO authenticated
  WITH CHECK (asked_by = auth.uid() AND public.diligence_access_open(offering_id));
CREATE POLICY "questions updated by managers" ON public.diligence_questions
  FOR UPDATE TO authenticated
  USING (public.can_manage_diligence(offering_id))
  WITH CHECK (public.can_manage_diligence(offering_id));

CREATE INDEX idx_dq_room ON public.diligence_questions(room_id, created_at DESC);
CREATE TRIGGER diligence_questions_updated BEFORE UPDATE ON public.diligence_questions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.diligence_question_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.diligence_questions(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  author_name text,
  from_reviewer boolean NOT NULL DEFAULT false,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.diligence_question_messages TO authenticated;
GRANT ALL ON public.diligence_question_messages TO service_role;
ALTER TABLE public.diligence_question_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "question messages readable" ON public.diligence_question_messages
  FOR SELECT TO authenticated
  USING (
    public.can_manage_diligence(offering_id)
    OR EXISTS (
      SELECT 1 FROM public.diligence_questions q
      WHERE q.id = question_id
        AND public.diligence_access_open(q.offering_id)
        AND (q.asked_by = auth.uid() OR q.is_published)
    )
  );
CREATE POLICY "question messages written by participants" ON public.diligence_question_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid() AND (
      public.can_manage_diligence(offering_id)
      OR EXISTS (
        SELECT 1 FROM public.diligence_questions q
        WHERE q.id = question_id AND q.asked_by = auth.uid()
          AND public.diligence_access_open(q.offering_id)
      )
    )
  );

CREATE INDEX idx_dqm_question ON public.diligence_question_messages(question_id, created_at);

-- ============ Activity trail ============
CREATE TABLE public.diligence_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES public.diligence_rooms(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  actor_name text,
  actor_email text,
  event_type text NOT NULL,
  summary text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.diligence_activity TO authenticated;
GRANT ALL ON public.diligence_activity TO service_role;
ALTER TABLE public.diligence_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity readable" ON public.diligence_activity
  FOR SELECT TO authenticated
  USING (public.can_manage_diligence(offering_id) OR actor_id = auth.uid());
CREATE POLICY "activity insert own" ON public.diligence_activity
  FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid() AND public.can_view_diligence(offering_id));

CREATE INDEX idx_da_offering ON public.diligence_activity(offering_id, created_at DESC);