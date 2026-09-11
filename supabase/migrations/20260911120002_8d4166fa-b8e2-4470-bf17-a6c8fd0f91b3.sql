ALTER TABLE public.client_invitations
  ADD COLUMN IF NOT EXISTS invite_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS invite_status text,
  ADD COLUMN IF NOT EXISTS invite_note text;