-- Phase 3C.1 — signing evidence hardening.
create or replace function public.block_signature_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Completed signature evidence is immutable';
end;
$$;

drop trigger if exists delegated_signatures_immutable on public.delegated_signatures;
create trigger delegated_signatures_immutable
before update or delete on public.delegated_signatures
for each row execute function public.block_signature_mutation();

create unique index if not exists delegated_signatures_stepup_unique
on public.delegated_signatures (stepup_id);

create or replace function public.protect_authority_document_evidence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Authority documents cannot be deleted; supersede or revoke instead';
  end if;
  if new.storage_path is distinct from old.storage_path
     or new.document_hash is distinct from old.document_hash
     or new.version is distinct from old.version
     or new.principal_user_id is distinct from old.principal_user_id
     or new.delegate_user_id is distinct from old.delegate_user_id
     or new.delegation_id is distinct from old.delegation_id
     or new.document_type is distinct from old.document_type
     or new.scope_type is distinct from old.scope_type
     or new.scope_id is distinct from old.scope_id
     or new.covered_document_types is distinct from old.covered_document_types
     or new.covered_actions is distinct from old.covered_actions
     or new.created_at is distinct from old.created_at then
    raise exception 'Authority document evidence is immutable; submit a new version instead';
  end if;
  return new;
end;
$$;

drop trigger if exists authority_documents_evidence_guard on public.authority_documents;
create trigger authority_documents_evidence_guard
before update or delete on public.authority_documents
for each row execute function public.protect_authority_document_evidence();

create or replace function public.protect_stepup_records()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Step-up authentication records cannot be deleted';
  end if;
  if old.consumed_at is not null and (new.consumed_at is null or new.status <> 'consumed') then
    raise exception 'A consumed step-up cannot be reopened';
  end if;
  if old.status in ('expired', 'failed') and new.status in ('pending', 'verified') then
    raise exception 'A closed step-up cannot be reopened';
  end if;
  return new;
end;
$$;

drop trigger if exists stepup_authentications_guard on public.stepup_authentications;
create trigger stepup_authentications_guard
before update or delete on public.stepup_authentications
for each row execute function public.protect_stepup_records();

create or replace function public.consume_signing_stepup(
  p_id uuid,
  p_user_id uuid,
  p_delegation_id uuid,
  p_action text,
  p_resource_type text,
  p_resource_id uuid
)
returns setof public.stepup_authentications
language sql
security definer
set search_path = public
as $$
  update public.stepup_authentications
  set status = 'consumed', consumed_at = now()
  where id = p_id
    and user_id = p_user_id
    and delegation_id = p_delegation_id
    and action = p_action
    and resource_type = p_resource_type
    and resource_id = p_resource_id
    and status = 'verified'
    and consumed_at is null
    and expires_at > now()
  returning *;
$$;

create or replace function public.register_stepup_attempt(p_id uuid, p_user_id uuid, p_max integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempts integer;
begin
  update public.stepup_authentications
  set attempts = coalesce(attempts, 0) + 1
  where id = p_id and user_id = p_user_id and status = 'pending'
  returning attempts into v_attempts;

  if v_attempts is null then
    return -1;
  end if;

  if v_attempts >= p_max then
    update public.stepup_authentications set status = 'failed' where id = p_id;
  end if;

  return v_attempts;
end;
$$;

revoke all on function public.consume_signing_stepup(uuid, uuid, uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.register_stepup_attempt(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_signing_stepup(uuid, uuid, uuid, text, text, uuid) to service_role;
grant execute on function public.register_stepup_attempt(uuid, uuid, integer) to service_role;

drop policy if exists "authority documents are service-role only" on storage.objects;
create policy "authority documents are service-role only"
on storage.objects for all to authenticated
using (bucket_id <> 'authority-documents')
with check (bucket_id <> 'authority-documents');