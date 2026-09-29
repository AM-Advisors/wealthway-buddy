ALTER TABLE public.offerings
  ADD COLUMN IF NOT EXISTS legal_name_changed_by uuid,
  ADD COLUMN IF NOT EXISTS legal_name_change_reason text,
  ADD COLUMN IF NOT EXISTS legal_name_effective_date date;

CREATE OR REPLACE FUNCTION public.record_offering_legal_name_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.legal_entity_name IS DISTINCT FROM OLD.legal_entity_name THEN
    INSERT INTO public.offering_legal_name_history(offering_id, previous_value, new_value, changed_by, reason, effective_date)
    VALUES (NEW.id, OLD.legal_entity_name, NEW.legal_entity_name,
            COALESCE(auth.uid(), NEW.legal_name_changed_by), NEW.legal_name_change_reason,
            COALESCE(NEW.legal_name_effective_date, current_date));
  END IF;
  RETURN NEW;
END $$;