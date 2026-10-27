CREATE TABLE public.crm_import_match_reviews(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),external_source text NOT NULL,external_id text NOT NULL,email text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(external_source,external_id));
GRANT SELECT,INSERT ON public.crm_import_match_reviews TO service_role;
ALTER TABLE public.crm_import_match_reviews ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER crm_import_match_review_history BEFORE UPDATE OR DELETE ON public.crm_import_match_reviews FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_link_history();
CREATE FUNCTION public.record_promotional_unsubscribe(_email text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE normalized text := lower(btrim(_email));
BEGIN
 IF normalized='' THEN RAISE EXCEPTION 'Email is required'; END IF;
 INSERT INTO public.email_unsubscribes(email,unsubscribed_at) VALUES(normalized,now()) ON CONFLICT(email) DO UPDATE SET unsubscribed_at=excluded.unsubscribed_at;
 UPDATE public.crm_contacts SET consent='unsubscribed',consent_recorded_at=now() WHERE lower(btrim(email))=normalized;
 UPDATE public.email_flow_enrollments SET status='stopped',stop_reason='Unsubscribed',stopped_at=now(),next_due_at=NULL WHERE status='active' AND contact_id IN (SELECT id FROM public.crm_contacts WHERE lower(btrim(email))=normalized);
END $$;
REVOKE ALL ON FUNCTION public.record_promotional_unsubscribe(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_promotional_unsubscribe(text) TO service_role;