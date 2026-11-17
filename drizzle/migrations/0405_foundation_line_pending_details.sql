CREATE OR REPLACE FUNCTION public.foundation_quote_line_gate() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE q record; prof record;
BEGIN
  IF NEW.service_key NOT LIKE 'FOUNDATION_ADMIN:%' AND NEW.foundation_snapshot IS NULL THEN RETURN NEW; END IF;
  IF NEW.service_key NOT LIKE 'FOUNDATION_ADMIN:%' THEN
    RAISE EXCEPTION 'Foundation Administration lines need their recorded foundation terms';
  END IF;
  SELECT id, client_id, status, needs_exec_approval INTO q FROM public.sales_quotes WHERE id = NEW.quote_id;
  IF q.id IS NULL OR q.status NOT IN ('draft','rejected') THEN
    IF TG_OP = 'INSERT' OR NEW.foundation_snapshot IS DISTINCT FROM OLD.foundation_snapshot OR NEW.unit_cents IS DISTINCT FROM OLD.unit_cents THEN
      RAISE EXCEPTION 'Foundation Administration can only be added to draft quotes';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.unit_cents IS NULL OR NEW.unit_cents <= 0 THEN RAISE EXCEPTION 'Foundation Administration needs an explicit price; it is never $0 by default'; END IF;
  -- Details collected at onboarding: no foundation named yet.
  IF NEW.foundation_snapshot IS NULL THEN RETURN NEW; END IF;
  SELECT id, client_id, client_entity_id, status INTO prof FROM public.foundation_profiles WHERE id = (NEW.foundation_snapshot->>'foundationProfileId')::uuid;
  IF prof.id IS NULL OR prof.status <> 'active' OR prof.client_id IS DISTINCT FROM q.client_id OR prof.client_entity_id::text IS DISTINCT FROM NEW.foundation_snapshot->>'clientEntityId' THEN
    IF NOT (NEW.foundation_snapshot->>'foundationProfileId' IS NULL AND NEW.foundation_snapshot ? 'plannedFoundationName') THEN
      RAISE EXCEPTION 'Foundation Administration must name an active foundation of this quote''s client';
    END IF;
  END IF;
  IF NEW.foundation_snapshot->>'priceSource' IS DISTINCT FROM 'rate_card' AND NOT q.needs_exec_approval THEN
    RAISE EXCEPTION 'Negotiated Foundation Administration pricing needs executive approval';
  END IF;
  RETURN NEW;
END $$;