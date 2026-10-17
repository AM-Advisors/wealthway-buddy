CREATE OR REPLACE FUNCTION public.guard_mfa_reset()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'mfa_reset_requests cannot be deleted'; END IF;
  IF OLD.status <> 'pending' THEN RAISE EXCEPTION 'decided requests are immutable'; END IF;
  IF NEW.decided_by IS NOT NULL AND NEW.decided_by = OLD.target_user_id THEN
    RAISE EXCEPTION 'cannot decide a reset of your own account';
  END IF;
  -- Super Admins may request and approve alone (user decision Oct 2026); others need a second person.
  IF NEW.decided_by IS NOT NULL AND NEW.decided_by = OLD.requested_by
     AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.decided_by AND role::text = 'super_admin') THEN
    RAISE EXCEPTION 'requester cannot decide';
  END IF;
  IF NEW.status = 'declined' AND coalesce(trim(NEW.decision_reason),'') = '' THEN RAISE EXCEPTION 'decline reason required'; END IF;
  RETURN NEW;
END $$;