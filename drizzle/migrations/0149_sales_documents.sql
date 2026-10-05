CREATE TABLE public.sales_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('proposal','rfp','rfq')),
  direction text NOT NULL CHECK (direction IN ('response','outbound')),
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  owner_user_id uuid NOT NULL,
  deal_id uuid, contact_id uuid, client_id uuid, quote_id uuid,
  recipient_name text, recipient_email text,
  due_date date,
  source_file_name text, source_path text, source_text text,
  current_version integer NOT NULL DEFAULT 0,
  approved_version integer, approved_by uuid, approved_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.sales_documents TO service_role;
ALTER TABLE public.sales_documents ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sales_document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.sales_documents(id),
  version integer NOT NULL,
  sections jsonb NOT NULL,
  source text NOT NULL DEFAULT 'edit',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version)
);
GRANT ALL ON public.sales_document_versions TO service_role;
ALTER TABLE public.sales_document_versions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sales_document_assist_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.sales_documents(id),
  requested_by uuid NOT NULL,
  assignee_user_id uuid,
  note text NOT NULL,
  sections text[] NOT NULL DEFAULT '{}',
  due_date date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','claimed','returned','cancelled')),
  return_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.sales_document_assist_requests TO service_role;
ALTER TABLE public.sales_document_assist_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sales_document_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.sales_documents(id),
  actor_id uuid NOT NULL,
  event text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.sales_document_events TO service_role;
ALTER TABLE public.sales_document_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.block_sales_document_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'sales document history is append-only'; END $$;
CREATE TRIGGER sales_document_versions_append_only BEFORE UPDATE OR DELETE ON public.sales_document_versions FOR EACH ROW EXECUTE FUNCTION public.block_sales_document_history_mutation();
CREATE TRIGGER sales_document_events_append_only BEFORE UPDATE OR DELETE ON public.sales_document_events FOR EACH ROW EXECUTE FUNCTION public.block_sales_document_history_mutation();
CREATE INDEX sales_documents_owner_idx ON public.sales_documents(owner_user_id);
CREATE INDEX sales_document_assist_status_idx ON public.sales_document_assist_requests(status);