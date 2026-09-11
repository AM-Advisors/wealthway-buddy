UPDATE public.invoice_lines l
SET pricing_id = p.id
FROM public.invoices i, public.client_pricing p
WHERE l.invoice_id = i.id
  AND l.pricing_id IS NULL
  AND l.source = 'fund_fee'
  AND l.service_key = 'wire_fee'
  AND p.client_id = i.client_id
  AND p.label ILIKE '%wire%';