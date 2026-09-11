insert into public.user_roles (user_id, role)
values ('c201d7b1-0d86-4ba5-a60c-032b0d1a22e3', 'super_admin')
on conflict (user_id, role) do nothing;