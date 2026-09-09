CREATE TABLE public.notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_kind text NOT NULL,
  offering_id uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  application_id uuid REFERENCES public.investor_applications(id) ON DELETE CASCADE,
  investor_user_id uuid,
  field text,
  old_value text,
  new_value text,
  amount_cents bigint,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  claimed_at timestamp with time zone,
  sent_at timestamp with time zone,
  error text
);

GRANT SELECT ON public.notification_events TO authenticated;
GRANT ALL ON public.notification_events TO service_role;
ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and assigned managers can view alert events"
ON public.notification_events FOR SELECT TO authenticated
USING (public.can_manage_diligence(offering_id));

CREATE INDEX idx_notification_events_pending ON public.notification_events (created_at) WHERE sent_at IS NULL;
CREATE INDEX idx_notification_events_offering ON public.notification_events (offering_id, created_at DESC);

CREATE TABLE public.notification_preferences (
  user_id uuid PRIMARY KEY,
  alerts_enabled boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own alert preference"
ON public.notification_preferences FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER notification_preferences_updated
BEFORE UPDATE ON public.notification_preferences
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.queue_application_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notification_events (event_kind, offering_id, application_id, investor_user_id, amount_cents)
    VALUES ('application_created', NEW.offering_id, NEW.id, NEW.user_id, NEW.commitment_cents);
    RETURN NEW;
  END IF;

  IF NEW.kyc_status IS DISTINCT FROM OLD.kyc_status THEN
    INSERT INTO public.notification_events (event_kind, offering_id, application_id, investor_user_id, field, old_value, new_value, amount_cents)
    VALUES ('status_changed', NEW.offering_id, NEW.id, NEW.user_id, 'kyc_status', OLD.kyc_status::text, NEW.kyc_status::text, NEW.commitment_cents);
  END IF;
  IF NEW.aml_status IS DISTINCT FROM OLD.aml_status THEN
    INSERT INTO public.notification_events (event_kind, offering_id, application_id, investor_user_id, field, old_value, new_value, amount_cents)
    VALUES ('status_changed', NEW.offering_id, NEW.id, NEW.user_id, 'aml_status', OLD.aml_status::text, NEW.aml_status::text, NEW.commitment_cents);
  END IF;
  IF NEW.accreditation_status IS DISTINCT FROM OLD.accreditation_status THEN
    INSERT INTO public.notification_events (event_kind, offering_id, application_id, investor_user_id, field, old_value, new_value, amount_cents)
    VALUES ('status_changed', NEW.offering_id, NEW.id, NEW.user_id, 'accreditation_status', OLD.accreditation_status::text, NEW.accreditation_status::text, NEW.commitment_cents);
  END IF;
  IF NEW.documents_status IS DISTINCT FROM OLD.documents_status THEN
    INSERT INTO public.notification_events (event_kind, offering_id, application_id, investor_user_id, field, old_value, new_value, amount_cents)
    VALUES ('status_changed', NEW.offering_id, NEW.id, NEW.user_id, 'documents_status', OLD.documents_status::text, NEW.documents_status::text, NEW.commitment_cents);
  END IF;
  IF NEW.funding_status IS DISTINCT FROM OLD.funding_status THEN
    INSERT INTO public.notification_events (event_kind, offering_id, application_id, investor_user_id, field, old_value, new_value, amount_cents)
    VALUES ('status_changed', NEW.offering_id, NEW.id, NEW.user_id, 'funding_status', OLD.funding_status::text, NEW.funding_status::text, NEW.commitment_cents);
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.notification_events (event_kind, offering_id, application_id, investor_user_id, field, old_value, new_value, amount_cents)
    VALUES ('status_changed', NEW.offering_id, NEW.id, NEW.user_id, 'status', OLD.status, NEW.status, NEW.commitment_cents);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER queue_application_notifications_ins
AFTER INSERT ON public.investor_applications
FOR EACH ROW EXECUTE FUNCTION public.queue_application_notifications();

CREATE TRIGGER queue_application_notifications_upd
AFTER UPDATE ON public.investor_applications
FOR EACH ROW EXECUTE FUNCTION public.queue_application_notifications();

CREATE OR REPLACE FUNCTION public.queue_wire_confirmation_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offering uuid;
  v_user uuid;
BEGIN
  SELECT a.offering_id, a.user_id INTO v_offering, v_user
  FROM public.investor_applications a WHERE a.id = NEW.application_id;

  IF v_offering IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notification_events (event_kind, offering_id, application_id, investor_user_id, amount_cents, metadata)
  VALUES ('wire_confirmation_submitted', v_offering, NEW.application_id, v_user, NEW.amount_cents,
          jsonb_build_object('sending_bank_name', NEW.sending_bank_name, 'sending_account_last4', NEW.sending_account_last4, 'sent_on', NEW.sent_on, 'wire_confirmation_id', NEW.id));
  RETURN NEW;
END;
$$;

CREATE TRIGGER queue_wire_confirmation_notification_ins
AFTER INSERT ON public.wire_confirmations
FOR EACH ROW EXECUTE FUNCTION public.queue_wire_confirmation_notification();