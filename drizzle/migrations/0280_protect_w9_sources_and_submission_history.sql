ALTER FUNCTION public.protect_fund_w9_source() SECURITY DEFINER;
CREATE OR REPLACE FUNCTION public.protect_fund_w9_submission_source() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.fund_w9_signature_requests WHERE source_ref = 'fund_manager_submissions:' || OLD.id::text AND status <> 'cancelled') THEN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'A W-9 signature source cannot be deleted'; END IF;
  IF NEW.file_path IS DISTINCT FROM OLD.file_path THEN RAISE EXCEPTION 'A W-9 signature source cannot be replaced'; END IF;
 END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_fund_w9_submission_source BEFORE UPDATE OR DELETE ON public.fund_manager_submissions FOR EACH ROW EXECUTE FUNCTION public.protect_fund_w9_submission_source();