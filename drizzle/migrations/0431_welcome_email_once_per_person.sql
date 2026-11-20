-- Remove duplicate welcome-email audit rows, keeping the earliest per client+person
delete from public.contract_audit_events a
using public.contract_audit_events b
where a.area = 'welcome email'
  and b.area = 'welcome email'
  and a.client_id = b.client_id
  and a.new_value->>'user_id' = b.new_value->>'user_id'
  and a.created_at > b.created_at;

-- One welcome email per person per client, enforced by the database
create unique index contract_audit_events_welcome_email_once
  on public.contract_audit_events (client_id, (new_value->>'user_id'))
  where area = 'welcome email';

-- Claim the one welcome email for this person+client. Returns the new row id,
-- or null when it was already claimed. Only the signed-in person can claim
-- for themselves; runs as definer because clients cannot read the audit table.
create or replace function public.claim_client_welcome(_client_id uuid, _email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _id uuid;
begin
  if auth.uid() is null then
    return null;
  end if;
  insert into public.contract_audit_events
    (actor_id, actor_role, client_id, area, action, target, new_value, source)
  values
    (auth.uid(), 'client', _client_id, 'welcome email', 'sent', _email,
     jsonb_build_object('user_id', auth.uid(), 'email', _email), 'portal')
  on conflict on constraint contract_audit_events_welcome_email_once do nothing
  returning id into _id;
  return _id;
end;
$$;

-- Release a claim when the email failed to send, so a later visit can retry.
-- Only the person who made the claim can release it.
create or replace function public.release_client_welcome_claim(_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  delete from public.contract_audit_events
  where id = _id
    and area = 'welcome email'
    and new_value->>'user_id' = auth.uid()::text;
end;
$$;

revoke all on function public.claim_client_welcome(uuid, text) from public;
revoke all on function public.release_client_welcome_claim(uuid) from public;
grant execute on function public.claim_client_welcome(uuid, text) to authenticated;
grant execute on function public.release_client_welcome_claim(uuid) to authenticated;