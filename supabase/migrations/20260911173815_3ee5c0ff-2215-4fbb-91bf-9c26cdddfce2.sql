insert into public.clients (name, legal_name, status, primary_contact_name, primary_contact_email, notes)
select 'Harmonious', 'Harmonious', 'active', 'Alyssa Pettit', 'info@harmonious.co', 'Harmonious'' own portal, used to sign documents and test the client experience end to end.'
where not exists (select 1 from public.clients where lower(name) = 'harmonious');