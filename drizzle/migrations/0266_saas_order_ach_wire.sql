ALTER TABLE public.saas_orders
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'card' CHECK (payment_method IN ('card','ach','wire')),
  ADD COLUMN IF NOT EXISTS wire_reference text,
  ADD COLUMN IF NOT EXISTS wire_received_by uuid,
  ADD COLUMN IF NOT EXISTS wire_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS wire_received_cents integer,
  ADD COLUMN IF NOT EXISTS wire_note text;
COMMENT ON COLUMN public.saas_orders.wire_received_by IS 'Harmonious staff member who confirmed the incoming wire landed (never the client).';