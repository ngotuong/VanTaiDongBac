-- R8: terminate exhausted leases instead of leaving them processing forever.
-- Apply only after the reviewed rollout; never replay an uncertain Sheet write.
create or replace function public.claim_write_jobs(
  p_limit integer default 5,
  p_worker_id text default '',
  p_stale_seconds integer default 900
)
returns setof public.write_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  with expired as (
    select id from public.write_jobs
    where attempts >= max_attempts and (status = 'pending' or (status = 'processing'
      and coalesce(claimed_at, locked_at, updated_at) <= now() - make_interval(secs => greatest(coalesce(p_stale_seconds, 900), 900))))
    for update skip locked
  ), terminated as (
    update public.write_jobs jobs
    set status = 'failed', worker_id = null, claimed_at = null, locked_at = null,
        last_error = 'REQUIRES_RECONCILIATION: Lease expired at final attempt; verify exact Sheet intent before retry.'
    from expired where jobs.id = expired.id
    returning jobs.id, jobs.last_error
  )
  insert into public.write_job_logs(job_id, status, message)
  select id, 'failed', last_error from terminated;

  return query
  with candidates as (
    select id from public.write_jobs
    where attempts < max_attempts and next_run_at <= now()
      and (status = 'pending' or (status = 'processing'
        and coalesce(claimed_at, locked_at, updated_at) <= now() - make_interval(secs => greatest(coalesce(p_stale_seconds, 900), 900))))
    order by created_at asc
    for update skip locked
    limit least(greatest(coalesce(p_limit, 5), 1), 20)
  )
  update public.write_jobs jobs
  set status = 'processing', attempts = jobs.attempts + 1,
      worker_id = nullif(trim(coalesce(p_worker_id, '')), ''),
      claimed_at = now(), locked_at = now(), last_error = ''
  from candidates where jobs.id = candidates.id
  returning jobs.*;
end;
$$;
revoke all on function public.claim_write_jobs(integer, text, integer) from public, anon, authenticated;
grant execute on function public.claim_write_jobs(integer, text, integer) to service_role;
