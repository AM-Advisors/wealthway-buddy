CREATE UNIQUE INDEX IF NOT EXISTS client_intake_requests_one_open_bookkeeping_per_entity
  ON public.client_intake_requests (entity_id)
  WHERE entity_id IS NOT NULL
    AND status IN ('submitted', 'in_review', 'scoped')
    AND requested_service_keys @> ARRAY['BOOKKEEPING_ACCOUNTING']::text[];

COMMENT ON INDEX public.client_intake_requests_one_open_bookkeeping_per_entity IS
  'At most one open bookkeeping request per legal entity, so simultaneous submissions cannot both be saved.';