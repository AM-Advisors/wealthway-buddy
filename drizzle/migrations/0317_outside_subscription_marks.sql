create table public.outside_subscription_marks (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references public.offerings(id),
  onboarding_id uuid not null references public.investor_onboardings(id),
  action text not null check (action in ('marked','withdrawn')),
  signed_on date,
  note text check (note is null or length(note) <= 500),
  actor_user_id uuid not null,
  actor_role text not null check (actor_role in ('harmonious','fund_manager')),
  created_at timestamptz not null default now(),
  check (action = 'withdrawn' or signed_on is not null)
);
grant all on public.outside_subscription_marks to service_role;
alter table public.outside_subscription_marks enable row level security;
create index on public.outside_subscription_marks (onboarding_id, created_at desc);
create trigger outside_subscription_marks_immutable before update or delete on public.outside_subscription_marks
for each row execute function public.block_prior_signed_document_mutation();