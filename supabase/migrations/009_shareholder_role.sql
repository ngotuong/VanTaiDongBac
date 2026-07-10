alter table public.app_users
  drop constraint if exists app_users_role_check;

alter table public.app_users
  add constraint app_users_role_check
  check (role in ('admin', 'operator', 'shareholder'));

alter table public.app_users
  add column if not exists updated_at timestamptz not null default now();
