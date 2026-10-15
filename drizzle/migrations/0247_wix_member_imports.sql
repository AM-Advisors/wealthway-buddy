CREATE TABLE public.wix_member_imports (
  wix_member_id text PRIMARY KEY,
  site_id text NOT NULL,
  first_name text,
  last_name text,
  email text,
  phone text,
  wix_status text,
  signed_up_at timestamptz,
  last_login_at timestamptz,
  matched_person_id uuid,
  imported_by uuid NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wix_member_imports_email_idx ON public.wix_member_imports (lower(email));
GRANT ALL ON public.wix_member_imports TO service_role;
ALTER TABLE public.wix_member_imports ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.wix_member_imports IS 'Read-only staging copy of Wix member-area members (name, email, phone). Never written back to Wix; never creates persons automatically. Server functions only.';