ALTER TABLE public.document_signatures REPLICA IDENTITY FULL;
ALTER TABLE public.investor_applications REPLICA IDENTITY FULL;
ALTER TABLE public.wire_confirmations REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.document_signatures;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.investor_applications;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wire_confirmations;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;