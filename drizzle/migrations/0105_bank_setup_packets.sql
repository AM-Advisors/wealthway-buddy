CREATE TABLE public.bank_setup_packets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank text NOT NULL CHECK (bank IN ('mercury','texas_capital','customers')),
  title text NOT NULL,
  checklist text NOT NULL DEFAULT '',
  file_name text NOT NULL,
  storage_path text NOT NULL,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  retired_by uuid
);
GRANT ALL ON public.bank_setup_packets TO service_role;
ALTER TABLE public.bank_setup_packets ENABLE ROW LEVEL SECURITY;
-- No client policies: reached only through server functions that check staff / client membership.
CREATE INDEX bank_setup_packets_bank_idx ON public.bank_setup_packets (bank) WHERE retired_at IS NULL;