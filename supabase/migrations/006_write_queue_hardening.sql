-- Harden asynchronous writes with atomic claims and request idempotency.

alter table public.write_jobs
  add column if not exists idempotency_key text,
  add column if not exists worker_id text,
  add column if not exists claimed_at timestamptz;

create unique index if not exists write_jobs_module_idempotency_idx
  on public.write_jobs (module, idempotency_key)
  where idempotency_key is not null and idempotency_key <> '';

create index if not exists write_jobs_stale_processing_idx
  on public.write_jobs (status, claimed_at)
  where status = 'processing';

create or replace function public.claim_write_jobs(
  p_limit integer default 5,
  p_worker_id text default '',
  p_stale_seconds integer default 300
)
returns setof public.write_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select id
    from public.write_jobs
    where attempts < max_attempts
      and next_run_at <= now()
      and (
        status = 'pending'
        or (
          status = 'processing'
          and coalesce(claimed_at, locked_at, updated_at) <= now() - make_interval(secs => greatest(p_stale_seconds, 60))
        )
      )
    order by created_at asc
    for update skip locked
    limit least(greatest(coalesce(p_limit, 5), 1), 20)
  )
  update public.write_jobs jobs
  set status = 'processing',
      attempts = jobs.attempts + 1,
      worker_id = nullif(trim(coalesce(p_worker_id, '')), ''),
      claimed_at = now(),
      locked_at = now(),
      last_error = ''
  from candidates
  where jobs.id = candidates.id
  returning jobs.*;
end;
$$;

revoke all on function public.claim_write_jobs(integer, text, integer) from public, anon, authenticated;
grant execute on function public.claim_write_jobs(integer, text, integer) to service_role;

