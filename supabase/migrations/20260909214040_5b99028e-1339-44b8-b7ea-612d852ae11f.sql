CREATE TABLE public.investor_personas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.investor_type NOT NULL DEFAULT 'individual',
  label text NOT NULL,
  legal_name text,
  entity_name text,
  tax_id text,
  date_of_birth date,
  phone text,
  email text,
  address_line1 text,
  address_line2 text,
  city text,
  region text,
  postal_code text,
  country text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.investor_personas TO authenticated;
GRANT ALL ON public.investor_personas TO service_role;

ALTER TABLE public.investor_personas ENABLE ROW LEVEL SECURITY;

CREATE INDEX investor_personas_user_idx ON public.investor_personas (user_id);
CREATE UNIQUE INDEX investor_personas_one_default ON public.investor_personas (user_id) WHERE is_default;

CREATE TRIGGER investor_personas_updated
BEFORE UPDATE ON public.investor_personas
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Investors manage their own accounts"
ON public.investor_personas FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

INSERT INTO public.investor_personas (
  user_id, kind, label, legal_name, entity_name, tax_id, date_of_birth, phone, email,
  address_line1, address_line2, city, region, postal_code, country, is_default
)
SELECT
  p.user_id,
  COALESCE(p.investor_type, 'individual'::public.investor_type),
  COALESCE(NULLIF(p.entity_name, ''), NULLIF(p.legal_name, ''), 'Primary account'),
  p.legal_name, p.entity_name, p.tax_id, p.date_of_birth, p.phone, p.email,
  p.address_line1, p.address_line2, p.city, p.region, p.postal_code, p.country,
  true
FROM public.profiles p;

ALTER TABLE public.profiles ADD COLUMN active_persona_id uuid REFERENCES public.investor_personas(id) ON DELETE SET NULL;

ALTER TABLE public.investor_applications ADD COLUMN persona_id uuid REFERENCES public.investor_personas(id) ON DELETE RESTRICT;

UPDATE public.investor_applications a
SET persona_id = ip.id
FROM public.investor_personas ip
WHERE ip.user_id = a.user_id AND ip.is_default AND a.persona_id IS NULL;

UPDATE public.profiles p
SET active_persona_id = ip.id
FROM public.investor_personas ip
WHERE ip.user_id = p.user_id AND ip.is_default;

ALTER TABLE public.investor_applications DROP CONSTRAINT investor_applications_user_id_offering_id_key;

CREATE UNIQUE INDEX investor_applications_user_offering_persona_key
ON public.investor_applications (user_id, offering_id, persona_id);

CREATE INDEX investor_applications_persona_idx ON public.investor_applications (persona_id);

CREATE POLICY "Reviewers read investor accounts"
ON public.investor_personas FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.investor_applications a
    JOIN public.fund_managers fm ON fm.offering_id = a.offering_id
    WHERE a.persona_id = investor_personas.id AND fm.user_id = auth.uid()
  )
);