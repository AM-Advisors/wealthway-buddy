ALTER TABLE public.investor_documents ADD COLUMN IF NOT EXISTS investment_profile_id uuid REFERENCES public.investment_profiles(id);
CREATE INDEX IF NOT EXISTS investor_documents_profile_kind_idx ON public.investor_documents (investment_profile_id, doc_kind, uploaded_at DESC);
COMMENT ON COLUMN public.investor_documents.investment_profile_id IS 'Reusable investing-profile evidence; onboarding_id retains immutable upload provenance. Fund subscriptions and signatures are never reused here.';
CREATE OR REPLACE FUNCTION public.guard_investor_profile_document() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.investment_profile_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.investment_profiles p WHERE p.id = NEW.investment_profile_id AND p.owner_user_id = NEW.user_id) OR NOT EXISTS (SELECT 1 FROM public.investor_onboardings o WHERE o.id = NEW.onboarding_id AND o.investor_user_id = NEW.user_id AND o.investment_profile_id = NEW.investment_profile_id AND o.offering_id = NEW.offering_id) THEN
      RAISE EXCEPTION 'Document must belong to the investor and investing profile';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.investment_profile_id IS NOT NULL THEN
    IF ROW(NEW.investment_profile_id,NEW.user_id,NEW.onboarding_id,NEW.offering_id,NEW.storage_path,NEW.doc_kind,NEW.file_name) IS DISTINCT FROM ROW(OLD.investment_profile_id,OLD.user_id,OLD.onboarding_id,OLD.offering_id,OLD.storage_path,OLD.doc_kind,OLD.file_name) THEN
      RAISE EXCEPTION 'Profile document originals cannot be replaced; upload a new version';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' AND OLD.investment_profile_id IS NOT NULL THEN
    RAISE EXCEPTION 'Profile documents are retained; upload an updated version';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER investor_profile_document_guard BEFORE INSERT OR UPDATE OR DELETE ON public.investor_documents FOR EACH ROW EXECUTE FUNCTION public.guard_investor_profile_document();