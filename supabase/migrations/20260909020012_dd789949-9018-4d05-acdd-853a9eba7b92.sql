INSERT INTO public.offering_packet_links (offering_id, token, label, include_wire, created_by)
SELECT 'aea45966-f7da-41c9-8c9d-6e0f08b0cc2e', repeat('a',40), 'TEMP smoke test', true, ur.user_id
FROM public.user_roles ur WHERE ur.role = 'admin' LIMIT 1;