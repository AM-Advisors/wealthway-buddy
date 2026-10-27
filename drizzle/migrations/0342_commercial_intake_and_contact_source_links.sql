CREATE TABLE public.commercial_intake_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 lead_id uuid NOT NULL UNIQUE REFERENCES public.marketing_leads(id),
 contact_id uuid NOT NULL REFERENCES public.crm_contacts(id),
 deal_id uuid NOT NULL REFERENCES public.crm_deals(id),
 actor_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.commercial_intake_links TO service_role;
ALTER TABLE public.commercial_intake_links ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.crm_contact_source_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 contact_id uuid NOT NULL REFERENCES public.crm_contacts(id),
 external_source text NOT NULL,
 external_id text NOT NULL,
 actor_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(external_source, external_id)
);
GRANT SELECT, INSERT ON public.crm_contact_source_links TO service_role;
ALTER TABLE public.crm_contact_source_links ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.guard_commercial_link_history() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN RAISE EXCEPTION 'Commercial linkage history is append-only'; END $$;
CREATE TRIGGER commercial_intake_link_history BEFORE UPDATE OR DELETE ON public.commercial_intake_links FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_link_history();
CREATE TRIGGER crm_contact_source_link_history BEFORE UPDATE OR DELETE ON public.crm_contact_source_links FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_link_history();
CREATE FUNCTION public.transfer_active_contact_followups() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN IF NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id THEN UPDATE public.email_flow_enrollments SET owner_user_id = NEW.owner_user_id WHERE contact_id = NEW.id AND status = 'active'; END IF; RETURN NEW; END $$;
CREATE TRIGGER crm_contact_followup_owner AFTER UPDATE OF owner_user_id ON public.crm_contacts FOR EACH ROW EXECUTE FUNCTION public.transfer_active_contact_followups();
REVOKE ALL ON FUNCTION public.transfer_active_contact_followups() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_commercial_link_history() FROM PUBLIC, anon, authenticated;