-- Internal-user allowlist. Apply before the RLS cutover in migration 008.

create table if not exists public.app_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  email text not null unique,
  role text not null default 'operator',
  active boolean not null default true,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  constraint app_users_username_format_check check (username ~ '^[a-z0-9._-]{3,40}$'),
  constraint app_users_role_check check (role in ('admin', 'operator'))
);

create unique index if not exists app_users_username_lower_idx
  on public.app_users (lower(username));

alter table public.app_users enable row level security;

create or replace function public.is_active_app_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users
    where user_id = auth.uid()
      and active = true
  );
$$;

revoke all on function public.is_active_app_user() from public, anon;
grant execute on function public.is_active_app_user() to authenticated, service_role;

drop policy if exists "Read own app user" on public.app_users;
create policy "Read own app user"
on public.app_users
for select
to authenticated
using (user_id = auth.uid() and active = true);

grant select on public.app_users to authenticated;
revoke all on public.app_users from anon;
