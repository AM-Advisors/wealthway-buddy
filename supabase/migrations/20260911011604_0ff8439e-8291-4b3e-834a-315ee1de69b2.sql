UPDATE public.service_requests
SET proposed_fee_cents = NULL,
    proposed_pricing_model = 'per_request',
    review_note = COALESCE(NULLIF(review_note, ''), '') ||
      CASE WHEN COALESCE(review_note, '') = '' THEN '' ELSE E'\n' END ||
      'Fee basis corrected: billed per statement requested; the amount depends on the services required and is confirmed before each statement.',
    updated_at = now()
WHERE id = '8ee6ec4c-16bc-4d34-a1b5-deb5b162b3dd';

UPDATE public.service_entitlements
SET pricing_model = 'per_request',
    note = 'Billed per statement requested. The fee depends on the services required and is confirmed before each statement is prepared.',
    updated_at = now()
WHERE id = '902d65b5-9f56-40b9-98e9-79a12d35876d';

INSERT INTO public.client_pricing
  (client_id, sow_id, service_key, label, standard_cents, contracted_cents, pricing_model, discount_note, effective_date)
SELECT '655a65e3-188b-4239-bcca-2f1c359f6fa0',
       'a2fe5eb8-358f-4fcd-a40d-6cc5660cc4f1',
       'financial_statements',
       'Financial statements per statement requested',
       NULL,
       NULL,
       'per_request',
       'Quoted per statement; the amount depends on the services required.',
       '2026-10-01'
WHERE NOT EXISTS (
  SELECT 1 FROM public.client_pricing
  WHERE client_id = '655a65e3-188b-4239-bcca-2f1c359f6fa0'
    AND service_key = 'financial_statements'
);

INSERT INTO public.contract_audit_events (client_id, offering_id, area, action, target, previous_value, new_value, source)
VALUES ('655a65e3-188b-4239-bcca-2f1c359f6fa0',
        '4014f341-8d38-4afc-9c18-ee21f8ae9224',
        'pricing',
        'fee_basis_corrected',
        'service_request:8ee6ec4c-16bc-4d34-a1b5-deb5b162b3dd',
        jsonb_build_object('fee_cents', 250000, 'pricing_model', 'transaction'),
        jsonb_build_object('fee_cents', NULL, 'pricing_model', 'per_request'),
        'migration');