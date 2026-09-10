CREATE TABLE public.offering_document_signature_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_document_id uuid NOT NULL REFERENCES public.offering_documents(id) ON DELETE CASCADE,
  page_number integer NOT NULL DEFAULT 1 CHECK (page_number >= 1),
  x numeric NOT NULL DEFAULT 0.1 CHECK (x >= 0 AND x <= 1),
  y numeric NOT NULL DEFAULT 0.1 CHECK (y >= 0 AND y <= 1),
  width numeric NOT NULL DEFAULT 0.25 CHECK (width > 0 AND width <= 1),
  height numeric NOT NULL DEFAULT 0.05 CHECK (height > 0 AND height <= 1),
  block_type text NOT NULL CHECK (block_type IN ('signature','initials','date','full_name','title')),
  signer_role text NOT NULL DEFAULT 'investor',
  required boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX offering_document_signature_blocks_doc_idx
  ON public.offering_document_signature_blocks (offering_document_id, page_number, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.offering_document_signature_blocks TO authenticated;
GRANT SELECT ON public.offering_document_signature_blocks TO anon;
GRANT ALL ON public.offering_document_signature_blocks TO service_role;

ALTER TABLE public.offering_document_signature_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signature blocks readable with the document"
ON public.offering_document_signature_blocks
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.offering_documents d
    WHERE d.id = offering_document_signature_blocks.offering_document_id
  )
);

CREATE POLICY "admins manage signature blocks"
ON public.offering_document_signature_blocks
FOR ALL
TO authenticated
USING (private.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "managers manage signature blocks for their funds"
ON public.offering_document_signature_blocks
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.offering_documents d
    JOIN public.fund_managers fm ON fm.offering_id = d.offering_id
    WHERE d.id = offering_document_signature_blocks.offering_document_id
      AND fm.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.offering_documents d
    JOIN public.fund_managers fm ON fm.offering_id = d.offering_id
    WHERE d.id = offering_document_signature_blocks.offering_document_id
      AND fm.user_id = auth.uid()
  )
);

CREATE TRIGGER set_signature_blocks_updated_at
BEFORE UPDATE ON public.offering_document_signature_blocks
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();