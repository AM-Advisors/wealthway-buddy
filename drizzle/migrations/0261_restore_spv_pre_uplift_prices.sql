update public.spv_transaction_pricing set is_current = (created_at < '2026-10-10');
update public.service_pricing_versions set is_current=false where id in ('c5e4d6ad-2c44-4e5e-9709-0f8bd6deb80d','3319c16f-35e2-42bd-baf6-42a0f6641bc8');
update public.service_pricing_versions set is_current=true where id in ('3ac40557-a644-4540-9e8f-fc0e9f3dda59','fde51492-ab08-40f8-8c3c-9e20ccb923c5');