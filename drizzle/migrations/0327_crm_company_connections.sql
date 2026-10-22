CREATE TABLE public.crm_companies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 scope text NOT NULL DEFAULT 'harmonious',
 offering_id uuid REFERENCES public.offerings(id),
 owner_user_id uuid NOT NULL,
 name text NOT NULL,
 website text,
 phone text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.crm_companies TO service_role;
ALTER TABLE public.crm_companies ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX crm_companies_scoped_name ON public.crm_companies (scope, owner_user_id, coalesce(offering_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(name)));
ALTER TABLE public.crm_contacts ADD COLUMN company_id uuid REFERENCES public.crm_companies(id);
CREATE INDEX crm_contacts_company_id ON public.crm_contacts(company_id);
INSERT INTO public.crm_companies(scope, offering_id, owner_user_id, name)
 SELECT scope, offering_id, owner_user_id, min(btrim(organization)) FROM public.crm_contacts
 WHERE nullif(btrim(organization), '') IS NOT NULL
 GROUP BY scope, offering_id, owner_user_id, lower(btrim(organization));
UPDATE public.crm_contacts c SET company_id = o.id FROM public.crm_companies o
 WHERE c.scope = o.scope AND c.owner_user_id = o.owner_user_id
 AND c.offering_id IS NOT DISTINCT FROM o.offering_id AND lower(btrim(c.organization)) = lower(btrim(o.name));