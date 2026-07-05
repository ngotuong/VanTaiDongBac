-- Phase 5 asynchronous write queue.
-- Google Sheets remain the source of truth; Supabase stores write intent/status.

create table if not exists public.write_jobs (
  id text primary key,
  module text not null,
  action text not null,
  status text not null default 'pending',
  payload jsonb not null,
  result jsonb,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  last_error text not null default '',
  next_run_at timestamptz not null default now(),
  locked_at timestamptz,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint write_jobs_status_check check (status in ('pending', 'processing', 'synced', 'failed'))
);

create table if not exists public.write_job_logs (
  id bigserial primary key,
  job_id text not null references public.write_jobs(id) on delete cascade,
  status text not null,
  message text not null default '',
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists write_jobs_status_next_run_idx
  on public.write_jobs (status, next_run_at, created_at);

create index if not exists write_job_logs_job_id_idx
  on public.write_job_logs (job_id, created_at desc);

create or replace function public.set_cache_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_write_jobs_updated_at on public.write_jobs;
create trigger set_write_jobs_updated_at
before update on public.write_jobs
for each row
execute function public.set_cache_updated_at();

alter table public.write_jobs enable row level security;
alter table public.write_job_logs enable row level security;

drop policy if exists "Allow public read write jobs" on public.write_jobs;
create policy "Allow public read write jobs"
on public.write_jobs
for select
to anon, authenticated
using (true);

drop policy if exists "Allow public read write job logs" on public.write_job_logs;
create policy "Allow public read write job logs"
on public.write_job_logs
for select
to anon, authenticated
using (true);

grant select on public.write_jobs to anon, authenticated;
grant select on public.write_job_logs to anon, authenticated;
