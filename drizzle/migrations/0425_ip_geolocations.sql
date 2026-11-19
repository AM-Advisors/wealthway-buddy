CREATE TABLE public.ip_geolocations (
  ip text PRIMARY KEY,
  city text,
  region text,
  region_code text,
  postal text,
  country text,
  country_code text,
  time_zone text,
  network text,
  source text,
  looked_up_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ip_geolocations TO service_role;
REVOKE ALL ON public.ip_geolocations FROM anon, authenticated;
ALTER TABLE public.ip_geolocations ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.ip_geolocations IS 'Approximate location and time zone per sign-in IP address. Server-only cache; read through staff-authorized activity views.';