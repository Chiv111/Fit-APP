-- One private app-state document per authenticated user.
-- The table may already exist from an early manual setup, so every statement
-- is safe to apply without deleting the existing payload.

create table if not exists public.lockin_state_user (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.lockin_state_user enable row level security;

-- Data API access is explicit. Guests cannot reach workout data and signed-in
-- users only need the operations used by the app's select/upsert flow.
revoke all on table public.lockin_state_user from anon;
revoke all on table public.lockin_state_user from authenticated;
grant select, insert, update on table public.lockin_state_user to authenticated;
grant all on table public.lockin_state_user to service_role;

drop policy if exists lockin_user_select on public.lockin_state_user;
drop policy if exists lockin_user_insert on public.lockin_state_user;
drop policy if exists lockin_user_update on public.lockin_state_user;

create policy lockin_user_select
on public.lockin_state_user
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy lockin_user_insert
on public.lockin_state_user
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy lockin_user_update
on public.lockin_state_user
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

comment on table public.lockin_state_user is
  'Private synchronized Fit App state. Exactly one row per authenticated user.';
