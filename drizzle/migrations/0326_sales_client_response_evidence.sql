CREATE TABLE public.sales_client_response_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_document_id uuid REFERENCES public.sales_documents(id),
  sales_quote_id uuid REFERENCES public.sales_quotes(id),
  event text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_client_response_one_record CHECK ((sales_document_id IS NOT NULL)::integer + (sales_quote_id IS NOT NULL)::integer = 1),
  CONSTRAINT sales_client_response_event_kind CHECK (event IN ('client_reviewed', 'client_changes_requested'))
);
GRANT ALL ON public.sales_client_response_events TO service_role;
ALTER TABLE public.sales_client_response_events ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER sales_client_response_append_only BEFORE UPDATE OR DELETE ON public.sales_client_response_events FOR EACH ROW EXECUTE FUNCTION public.block_sales_document_history_mutation();
CREATE INDEX sales_client_response_document_idx ON public.sales_client_response_events(sales_document_id, created_at);
CREATE INDEX sales_client_response_quote_idx ON public.sales_client_response_events(sales_quote_id, created_at);
CREATE UNIQUE INDEX sales_response_document_send_once ON public.sales_document_events(document_id, (detail->>'requestId')) WHERE event = 'response_pending';
CREATE UNIQUE INDEX sales_response_quote_send_once ON public.sales_quote_events(quote_id, ((note::jsonb)->>'requestId')) WHERE event = 'response_pending';