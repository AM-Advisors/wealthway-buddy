CREATE TABLE public.cap_table_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL,
  company_name text NOT NULL,
  source_provider text NOT NULL DEFAULT 'none',
  shareholder_count integer,
  note text,
  status text NOT NULL DEFAULT 'new',
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  internal_note text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_ip text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cap_table_leads_status_check CHECK (status IN ('new','contacted','converted','declined')),
  CONSTRAINT cap_table_leads_provider_check CHECK (source_provider IN ('carta','pulley','angellist','spreadsheet','none','other'))
);

CREATE INDEX cap_table_leads_status_idx ON public.cap_table_leads (status, created_at DESC);
CREATE INDEX cap_table_leads_email_idx ON public.cap_table_leads (lower(email), created_at DESC);

GRANT SELECT, UPDATE ON public.cap_table_leads TO authenticated;
GRANT ALL ON public.cap_table_leads TO service_role;

ALTER TABLE public.cap_table_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read cap table requests"
ON public.cap_table_leads FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::public.app_role) OR
  private.has_role(auth.uid(), 'super_admin'::public.app_role) OR
  private.has_role(auth.uid(), 'client_success'::public.app_role) OR
  private.has_role(auth.uid(), 'executive'::public.app_role) OR
  private.has_role(auth.uid(), 'legal'::public.app_role) OR
  private.has_role(auth.uid(), 'compliance'::public.app_role) OR
  private.has_role(auth.uid(), 'finance'::public.app_role)
);

CREATE POLICY "Staff can update cap table requests"
ON public.cap_table_leads FOR UPDATE TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::public.app_role) OR
  private.has_role(auth.uid(), 'super_admin'::public.app_role) OR
  private.has_role(auth.uid(), 'client_success'::public.app_role) OR
  private.has_role(auth.uid(), 'executive'::public.app_role) OR
  private.has_role(auth.uid(), 'legal'::public.app_role) OR
  private.has_role(auth.uid(), 'compliance'::public.app_role) OR
  private.has_role(auth.uid(), 'finance'::public.app_role)
)
WITH CHECK (
  private.has_role(auth.uid(), 'admin'::public.app_role) OR
  private.has_role(auth.uid(), 'super_admin'::public.app_role) OR
  private.has_role(auth.uid(), 'client_success'::public.app_role) OR
  private.has_role(auth.uid(), 'executive'::public.app_role) OR
  private.has_role(auth.uid(), 'legal'::public.app_role) OR
  private.has_role(auth.uid(), 'compliance'::public.app_role) OR
  private.has_role(auth.uid(), 'finance'::public.app_role)
);

CREATE TRIGGER cap_table_leads_set_updated_at
BEFORE UPDATE ON public.cap_table_leads
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();