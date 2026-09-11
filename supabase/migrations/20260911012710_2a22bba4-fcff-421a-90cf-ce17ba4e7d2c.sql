UPDATE public.invoices
SET payment_reference = 'FEDWIRE-TEST-20260911'
WHERE number = 'HRM-2026-0001' AND payment_reference IS NULL;

UPDATE public.contract_audit_events e
SET offering_id = '4014f341-8d38-4afc-9c18-ee21f8ae9224'
WHERE e.target = 'HRM-2026-0001' AND e.offering_id IS NULL;

INSERT INTO public.contract_audit_events (actor_role, client_id, offering_id, area, action, target, previous_value, new_value, source)
VALUES ('admin', '655a65e3-188b-4239-bcca-2f1c359f6fa0', '4014f341-8d38-4afc-9c18-ee21f8ae9224', 'invoice', 'payment reference recorded', 'HRM-2026-0001',
  '{"reference": null}'::jsonb, '{"reference": "FEDWIRE-TEST-20260911"}'::jsonb, 'web');