UPDATE public.offerings o SET is_open = true
FROM public.fund_setups fs
WHERE fs.offering_id = o.id AND fs.launch_state = 'launched' AND o.is_open = false AND o.lifecycle_status = 'open';