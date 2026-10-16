update public.pricing_items n set amount_cents = coalesce(
  (select o.amount_cents from public.pricing_items o join public.pricing_versions ov on ov.id=o.version_id
    where ov.status='archived' and o.service_key is not distinct from n.service_key and o.label=n.label and o.amount_cents is not null order by ov.created_at desc limit 1),
  round(n.amount_cents/1.25/100.0)*100)
where n.version_id in (select id from public.pricing_versions where status='published')
  and n.amount_cents is not null and n.amount_cents > 0 and not n.pass_through and n.service_key is distinct from 'form_d';

update public.service_pricing_versions set is_current = false
where service_product='FUND_ADMINISTRATION' and service_level in ('CORE','FUND_ADMINISTRATION','WHITE_GLOVE','INSTITUTIONAL') and created_at >= '2026-10-10';
update public.service_pricing_versions set is_current = true
where service_product='FUND_ADMINISTRATION' and service_level in ('CORE','FUND_ADMINISTRATION','WHITE_GLOVE','INSTITUTIONAL') and created_at < '2026-10-10';

update public.service_catalog set standard_price_cents = case key
  when 'cap_table_starter' then 12900 when 'cap_table_growth' then 29900 when 'cap_table_scale' then 59900
  else round(standard_price_cents/1.25/100.0)*100 end
where standard_price_cents > 0;