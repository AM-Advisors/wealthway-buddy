CREATE TABLE public.person_creation_locks (
  lock_key text PRIMARY KEY,
  holder uuid NOT NULL,
  expires_at timestamptz NOT NULL
);
GRANT ALL ON public.person_creation_locks TO service_role;
ALTER TABLE public.person_creation_locks ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.person_creation_locks IS 'Short-lived mutex so concurrent Person creation for one identity serializes (Phase 3.8). Service role only.';

CREATE OR REPLACE FUNCTION public.acquire_person_creation_lock(_key text, _token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ok boolean := false;
BEGIN
  INSERT INTO public.person_creation_locks(lock_key, holder, expires_at)
  VALUES (_key, _token, now() + interval '20 seconds')
  ON CONFLICT (lock_key) DO UPDATE SET holder = EXCLUDED.holder, expires_at = EXCLUDED.expires_at
    WHERE public.person_creation_locks.expires_at < now()
  RETURNING true INTO ok;
  RETURN coalesce(ok, false);
END $$;

CREATE OR REPLACE FUNCTION public.release_person_creation_lock(_key text, _token uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.person_creation_locks WHERE lock_key = _key AND holder = _token;
$$;

REVOKE ALL ON FUNCTION public.acquire_person_creation_lock(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_person_creation_lock(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_person_creation_lock(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_person_creation_lock(text, uuid) TO service_role;