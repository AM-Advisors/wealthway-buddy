CREATE OR REPLACE FUNCTION public.bank_balance_snapshot_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'This accounting record is permanent and cannot be changed or deleted (bank_balance_snapshots).';
  END IF;
  -- Pilot M8: the only permitted change is a one-time second-person review stamp.
  IF OLD.reviewed_by IS NULL AND NEW.reviewed_by IS NOT NULL AND NEW.reviewed_by <> OLD.recorded_by
     AND (to_jsonb(NEW) - 'reviewed_by' - 'reviewed_at') = (to_jsonb(OLD) - 'reviewed_by' - 'reviewed_at') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'This accounting record is permanent and cannot be changed or deleted (bank_balance_snapshots).';
END $$;
DROP TRIGGER IF EXISTS bank_balance_snapshots_immutable ON public.bank_balance_snapshots;
CREATE TRIGGER bank_balance_snapshots_immutable BEFORE UPDATE OR DELETE ON public.bank_balance_snapshots
FOR EACH ROW EXECUTE FUNCTION public.bank_balance_snapshot_guard();