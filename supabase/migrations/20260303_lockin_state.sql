-- LOCK IN state backup table (single-profile mode)
-- Replace 'sebastian-main' if you use another VITE_SUPABASE_PROFILE_KEY.

create table if not exists public.lockin_state (
  profile_key text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.lockin_state enable row level security;

drop policy if exists lockin_select_profile on public.lockin_state;
drop policy if exists lockin_insert_profile on public.lockin_state;
drop policy if exists lockin_update_profile on public.lockin_state;

create policy lockin_select_profile
on public.lockin_state
for select
to anon
using (profile_key = 'sebastian-main');

create policy lockin_insert_profile
on public.lockin_state
for insert
to anon
with check (profile_key = 'sebastian-main');

create policy lockin_update_profile
on public.lockin_state
for update
to anon
using (profile_key = 'sebastian-main')
with check (profile_key = 'sebastian-main');
