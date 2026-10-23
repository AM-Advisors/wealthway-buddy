CREATE TABLE public.fund_document_replacements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 file_id uuid NOT NULL UNIQUE REFERENCES public.fund_files(id),
 offering_document_id uuid NOT NULL REFERENCES public.offering_documents(id),
 version integer NOT NULL,
 expected_active_version integer,
 designated_by uuid NOT NULL,
 designated_at timestamptz NOT NULL DEFAULT now(),
 promoted_at timestamptz,
 FOREIGN KEY(offering_document_id,version) REFERENCES public.offering_document_versions(offering_document_id,version)
);
GRANT ALL ON public.fund_document_replacements TO service_role;
ALTER TABLE public.fund_document_replacements ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.promote_signed_fund_replacement(_file uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.fund_document_replacements; f public.fund_files; d public.offering_documents; v public.offering_document_versions;
BEGIN
 SELECT * INTO r FROM public.fund_document_replacements WHERE file_id=_file FOR UPDATE;
 IF NOT FOUND OR r.promoted_at IS NOT NULL THEN RETURN false; END IF;
 SELECT * INTO f FROM public.fund_files WHERE id=_file;
 IF f.status <> 'signed' OR f.deleted_at IS NOT NULL THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.fund_file_signatures WHERE file_id=_file AND status='signed' AND signed_at IS NOT NULL)
 OR EXISTS(SELECT 1 FROM public.fund_file_signatures WHERE file_id=_file AND status<>'cancelled' AND (status<>'signed' OR signed_at IS NULL OR signer_role<>'fund_manager' OR onboarding_id IS NOT NULL)) THEN RETURN false; END IF;
 SELECT * INTO d FROM public.offering_documents WHERE id=r.offering_document_id FOR UPDATE;
 SELECT * INTO v FROM public.offering_document_versions WHERE offering_document_id=d.id AND version=r.version;
 IF d.removed_at IS NOT NULL OR d.offering_id<>f.offering_id OR v.offering_id<>f.offering_id OR f.template_key IS DISTINCT FROM 'operating_agreement' OR d.document_category IS DISTINCT FROM 'operating_agreement' THEN RETURN false; END IF;
 IF d.active_version IS DISTINCT FROM r.expected_active_version OR v.approval_status<>'approved' OR v.signing_config_status<>'confirmed' THEN RETURN false; END IF;
 IF d.active_version IS NOT NULL THEN
 UPDATE public.offering_document_versions SET approval_status='superseded',superseded_at=now() WHERE offering_document_id=d.id AND version=d.active_version;
 INSERT INTO public.offering_document_events(offering_id,offering_document_id,version,event,actor_user_id,detail) VALUES(d.offering_id,d.id,d.active_version,'version_superseded',r.designated_by,jsonb_build_object('replacementFileId',_file));
 END IF;
 UPDATE public.offering_documents SET active_version=v.version,signature_template_version=v.version,file_path=v.file_path,file_name=v.file_name,file_size_bytes=v.file_size_bytes WHERE id=d.id;
 UPDATE public.offering_document_versions SET rollout_scope='new_only',target_onboarding_id=NULL,rolled_out_by=r.designated_by,rolled_out_at=now(),rollout_note='Designated replacement signed; existing sent and signed investor copies retained.' WHERE id=v.id;
 UPDATE public.fund_document_replacements SET promoted_at=now() WHERE id=r.id;
 INSERT INTO public.offering_document_events(offering_id,offering_document_id,version,event,actor_user_id,detail) VALUES(d.offering_id,d.id,v.version,'version_activated',r.designated_by,jsonb_build_object('scope','new_only','resign',0,'replacementFileId',_file,'automaticAfterSigning',true));
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.promote_signed_fund_replacement(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.promote_signed_fund_replacement(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.signed_fund_replacement_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_TABLE_NAME='fund_files' THEN PERFORM public.promote_signed_fund_replacement(NEW.id);
 ELSE PERFORM public.promote_signed_fund_replacement(NEW.file_id); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.signed_fund_replacement_trigger() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER promote_designated_signed_file AFTER UPDATE OF status ON public.fund_files FOR EACH ROW WHEN(NEW.status='signed' AND OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION public.signed_fund_replacement_trigger();
CREATE TRIGGER promote_already_signed_replacement AFTER INSERT ON public.fund_document_replacements FOR EACH ROW EXECUTE FUNCTION public.signed_fund_replacement_trigger();