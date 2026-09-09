UPDATE public.document_signatures
SET provider_sent_at = COALESCE(provider_sent_at, signed_at, provider_last_event_at)
WHERE provider = 'box_sign' AND provider_sent_at IS NULL;

UPDATE public.document_signatures
SET provider_viewed_at = COALESCE(provider_viewed_at, provider_completed_at)
WHERE provider = 'box_sign'
  AND provider_viewed_at IS NULL
  AND provider_status = 'completed';