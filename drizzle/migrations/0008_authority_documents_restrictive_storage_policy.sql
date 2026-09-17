-- The previous policy was permissive, so it would have granted authenticated
-- users access to every other bucket. A restrictive policy only subtracts:
-- it blocks the authority-documents bucket without granting anything.
drop policy if exists "authority documents are service-role only" on storage.objects;

create policy "authority documents are service-role only"
on storage.objects
as restrictive
for all
to authenticated, anon
using (bucket_id <> 'authority-documents')
with check (bucket_id <> 'authority-documents');