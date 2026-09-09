CREATE TABLE public.diligence_cap_table (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references public.offerings(id) on delete cascade,
  holder_name text not null,
  holder_type text not null default 'investor',
  security_type text not null default 'common',
  shares numeric,
  ownership_pct numeric,
  fully_diluted_pct numeric,
  notes text,
  sort_order integer not null default 0,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.diligence_cap_table TO authenticated;
GRANT ALL ON public.diligence_cap_table TO service_role;

ALTER TABLE public.diligence_cap_table ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Room viewers can read the cap table"
ON public.diligence_cap_table FOR SELECT TO authenticated
USING (public.diligence_access_open(offering_id));

CREATE POLICY "Managers manage the cap table"
ON public.diligence_cap_table FOR ALL TO authenticated
USING (public.can_manage_diligence(offering_id))
WITH CHECK (public.can_manage_diligence(offering_id));

CREATE INDEX diligence_cap_table_offering_idx ON public.diligence_cap_table (offering_id, sort_order);

CREATE TRIGGER diligence_cap_table_updated
BEFORE UPDATE ON public.diligence_cap_table
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();