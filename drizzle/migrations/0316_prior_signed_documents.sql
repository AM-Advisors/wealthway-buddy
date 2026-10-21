create table public.prior_signed_documents (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references public.offerings(id),
  onboarding_id uuid not null references public.investor_onboardings(id),
  document_kind text not null check (document_kind in ('subscription_agreement','operating_agreement','ppm_acknowledgment','tax_form','side_letter','accreditation','other')),
  title text not null check (length(title) between 1 and 200),
  signed_on date not null,
  storage_path text not null,
  file_name text not null,
  note text check (note is null or length(note) <= 500),
  uploaded_by uuid not null,
  uploaded_by_role text not null check (uploaded_by_role in ('harmonious','fund_manager')),
  replaces_id uuid references public.prior_signed_documents(id),
  created_at timestamptz not null default now()
);
grant all on public.prior_signed_documents to service_role;
alter table public.prior_signed_documents enable row level security;
create index on public.prior_signed_documents (onboarding_id);
create or replace function public.block_prior_signed_document_mutation() returns trigger language plpgsql set search_path = public as $$
begin raise exception 'Previously signed document records are permanent; upload a replacement instead.'; end $$;
create trigger prior_signed_documents_immutable before update or delete on public.prior_signed_documents
for each row execute function public.block_prior_signed_document_mutation();