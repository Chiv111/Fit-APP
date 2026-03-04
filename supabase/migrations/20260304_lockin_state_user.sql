-- LOCK IN state table for authenticated users (Supabase Auth mode)
-- Enable when VITE_REQUIRE_SUPABASE_AUTH=true.

create table if not exists public.lockin_state_user (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.lockin_state_user enable row level security;

drop policy if exists lockin_user_select on public.lockin_state_user;
drop policy if exists lockin_user_insert on public.lockin_state_user;
drop policy if exists lockin_user_update on public.lockin_state_user;

create policy lockin_user_select
on public.lockin_state_user
for select
to authenticated
using (user_id = auth.uid());

create policy lockin_user_insert
on public.lockin_state_user
for insert
to authenticated
with check (user_id = auth.uid());

create policy lockin_user_update
on public.lockin_state_user
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
