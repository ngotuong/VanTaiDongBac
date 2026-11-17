-- D3: dispatch/claim lifecycle for the read-only foreground shadow worker.
-- Only technical hashes, versions, timestamps, and comparison status are kept.
-- No Google Sheet value or business payload may be stored in this table.

alter table public.sync_generations
  add column if not exists dispatch_requested boolean not null default false,
  add column if not exists dispatch_started_at timestamptz null,
  add column if not exists worker_started_at timestamptz null,
  add column if not exists source_ready_at timestamptz null,
  add column if not exists shadow_checked_at timestamptz null,
  add column if not exists shadow_result text not null default '' check (length(shadow_result) <= 80),
  add column if not exists shadow_match boolean null,
  add column if not exists shadow_month text not null default ''
    check (shadow_month = '' or shadow_month ~ '^(0[1-9]|1[0-2])/20[0-9]{2}$'),
  add column if not exists shadow_source_data_version text not null default ''
    check (length(shadow_source_data_version) <= 180),
  add column if not exists shadow_legacy_source_data_version text not null default ''
    check (length(shadow_legacy_source_data_version) <= 180),
  add column if not exists shadow_source_hash text not null default ''
    check (shadow_source_hash = '' or shadow_source_hash ~ '^[a-f0-9]{64}$'),
  add column if not exists shadow_dashboard_hash text not null default ''
    check (length(shadow_dashboard_hash) <= 128),
  add column if not exists shadow_report_hash text not null default ''
    check (length(shadow_report_hash) <= 128),
  add column if not exists shadow_legacy_dashboard_hash text not null default ''
    check (length(shadow_legacy_dashboard_hash) <= 128),
  add column if not exists shadow_legacy_report_hash text not null default ''
    check (length(shadow_legacy_report_hash) <= 128);

alter table public.sync_generations
  drop constraint if exists sync_generations_status_check;
alter table public.sync_generations
  add constraint sync_generations_status_check check (
    status in (
      'pending', 'dispatched', 'claimed', 'source_wait', 'published',
      'retryable', 'failed', 'shadowed', 'superseded'
    )
  );

create index if not exists sync_generations_dispatch_due_idx
  on public.sync_generations (dispatch_requested, status, next_attempt_at, not_before, last_signal_at)
  where dispatch_requested = true
    and status in ('pending', 'retryable', 'claimed', 'source_wait');

create or replace function public.request_sync_generation_dispatch(
  p_event_key text,
  p_semantic_build_stamp text default 'unversioned'
)
returns public.sync_generations
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.sync_generations;
begin
  select * into target
  from public.sync_generations
  where event_key = p_event_key
  for update;

  if target.event_key is null then
    raise exception 'sync generation not found';
  end if;
  if target.status in ('published', 'failed', 'shadowed', 'superseded') then
    raise exception 'sync generation is terminal';
  end if;

  update public.sync_generations older
  set status = 'superseded',
      lease_token = null,
      lease_owner = null,
      lease_expires_at = null,
      error_class = '',
      updated_at = now()
  where older.workbook_year = target.workbook_year
    and older.module = target.module
    and older.generation_id <> target.generation_id
    and older.dispatch_requested = true
    and older.status in ('pending', 'retryable')
    and older.last_signal_at <= target.last_signal_at;

  update public.sync_generations current_generation
  set dispatch_requested = true,
      dispatch_started_at = coalesce(current_generation.dispatch_started_at, now()),
      semantic_build_stamp = coalesce(
        nullif(btrim(p_semantic_build_stamp), ''),
        current_generation.semantic_build_stamp
      ),
      updated_at = now()
  where current_generation.event_key = p_event_key
  returning * into target;

  return target;
end;
$$;

create or replace function public.claim_sync_generations(
  p_limit integer default 5,
  p_worker_id text default '',
  p_stale_seconds integer default 120,
  p_lease_seconds integer default 60
)
returns setof public.sync_generations
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(btrim(coalesce(p_worker_id, '')), '') is null then
    raise exception 'worker id is required';
  end if;

  return query
  with candidates as (
    select event_key
    from public.sync_generations
    where dispatch_requested = true
      and attempts < max_attempts
      and not_before <= now()
      and next_attempt_at <= now()
      and (
        status in ('pending', 'retryable')
        or (
          status in ('claimed', 'source_wait')
          and coalesce(
            lease_expires_at,
            updated_at + make_interval(secs => greatest(coalesce(p_stale_seconds, 120), 30))
          ) <= now()
        )
      )
    order by last_signal_at asc, created_at asc
    for update skip locked
    limit least(greatest(coalesce(p_limit, 5), 1), 20)
  )
  update public.sync_generations generations
  set status = 'claimed',
      attempts = generations.attempts + 1,
      lease_token = gen_random_uuid()::text,
      lease_owner = btrim(p_worker_id),
      lease_expires_at = now() + make_interval(secs => greatest(coalesce(p_lease_seconds, 60), 30)),
      worker_started_at = now(),
      error_class = ''
  from candidates
  where generations.event_key = candidates.event_key
  returning generations.*;
end;
$$;

create or replace function public.claim_sync_generation(
  p_event_key text,
  p_worker_id text,
  p_stale_seconds integer default 120,
  p_lease_seconds integer default 60
)
returns setof public.sync_generations
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(btrim(coalesce(p_worker_id, '')), '') is null then
    raise exception 'worker id is required';
  end if;

  return query
  with candidate as (
    select event_key
    from public.sync_generations
    where event_key = p_event_key
      and dispatch_requested = true
      and attempts < max_attempts
      and not_before <= now()
      and next_attempt_at <= now()
      and (
        status in ('pending', 'retryable')
        or (
          status in ('claimed', 'source_wait')
          and coalesce(
            lease_expires_at,
            updated_at + make_interval(secs => greatest(coalesce(p_stale_seconds, 120), 30))
          ) <= now()
        )
      )
    for update skip locked
  )
  update public.sync_generations generations
  set status = 'claimed',
      attempts = generations.attempts + 1,
      lease_token = gen_random_uuid()::text,
      lease_owner = btrim(p_worker_id),
      lease_expires_at = now() + make_interval(secs => greatest(coalesce(p_lease_seconds, 60), 30)),
      worker_started_at = now(),
      error_class = ''
  from candidate
  where generations.event_key = candidate.event_key
  returning generations.*;
end;
$$;

create or replace function public.complete_sync_generation_shadow(
  p_event_key text,
  p_lease_token text,
  p_shadow_result text,
  p_shadow_match boolean,
  p_shadow_month text,
  p_source_ready_at timestamptz,
  p_shadow_source_data_version text,
  p_shadow_legacy_source_data_version text,
  p_shadow_source_hash text,
  p_shadow_dashboard_hash text,
  p_shadow_report_hash text,
  p_shadow_legacy_dashboard_hash text,
  p_shadow_legacy_report_hash text
)
returns public.sync_generations
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.sync_generations;
begin
  update public.sync_generations generations
  set status = 'shadowed',
      source_ready_at = coalesce(p_source_ready_at, now()),
      shadow_checked_at = now(),
      shadow_result = left(coalesce(p_shadow_result, ''), 80),
      shadow_match = p_shadow_match,
      shadow_month = coalesce(p_shadow_month, ''),
      shadow_source_data_version = left(coalesce(p_shadow_source_data_version, ''), 180),
      shadow_legacy_source_data_version = left(coalesce(p_shadow_legacy_source_data_version, ''), 180),
      shadow_source_hash = coalesce(p_shadow_source_hash, ''),
      shadow_dashboard_hash = left(coalesce(p_shadow_dashboard_hash, ''), 128),
      shadow_report_hash = left(coalesce(p_shadow_report_hash, ''), 128),
      shadow_legacy_dashboard_hash = left(coalesce(p_shadow_legacy_dashboard_hash, ''), 128),
      shadow_legacy_report_hash = left(coalesce(p_shadow_legacy_report_hash, ''), 128),
      source_data_version = case
        when coalesce(p_shadow_source_data_version, '') <> '' then left(p_shadow_source_data_version, 180)
        else generations.source_data_version
      end,
      lease_token = null,
      lease_owner = null,
      lease_expires_at = null,
      error_class = '',
      updated_at = now()
  where generations.event_key = p_event_key
    and generations.status = 'claimed'
    and generations.lease_token = p_lease_token
  returning * into result;

  if result.event_key is null then
    raise exception 'sync generation lease ownership lost';
  end if;
  return result;
end;
$$;

create or replace function public.retry_sync_generation_shadow(
  p_event_key text,
  p_lease_token text,
  p_error_class text,
  p_next_attempt_at timestamptz,
  p_terminal boolean default false,
  p_shadow_result text default '',
  p_shadow_month text default '',
  p_shadow_source_data_version text default '',
  p_shadow_legacy_source_data_version text default '',
  p_shadow_source_hash text default '',
  p_shadow_dashboard_hash text default '',
  p_shadow_report_hash text default '',
  p_shadow_legacy_dashboard_hash text default '',
  p_shadow_legacy_report_hash text default ''
)
returns public.sync_generations
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.sync_generations;
begin
  update public.sync_generations generations
  set status = case when coalesce(p_terminal, false) then 'failed' else 'retryable' end,
      next_attempt_at = case
        when coalesce(p_terminal, false) then generations.next_attempt_at
        else greatest(coalesce(p_next_attempt_at, now()), now())
      end,
      shadow_checked_at = now(),
      shadow_result = left(coalesce(p_shadow_result, ''), 80),
      shadow_match = case when p_shadow_result = 'mismatch' then false else generations.shadow_match end,
      shadow_month = coalesce(p_shadow_month, ''),
      shadow_source_data_version = left(coalesce(p_shadow_source_data_version, ''), 180),
      shadow_legacy_source_data_version = left(coalesce(p_shadow_legacy_source_data_version, ''), 180),
      shadow_source_hash = coalesce(p_shadow_source_hash, ''),
      shadow_dashboard_hash = left(coalesce(p_shadow_dashboard_hash, ''), 128),
      shadow_report_hash = left(coalesce(p_shadow_report_hash, ''), 128),
      shadow_legacy_dashboard_hash = left(coalesce(p_shadow_legacy_dashboard_hash, ''), 128),
      shadow_legacy_report_hash = left(coalesce(p_shadow_legacy_report_hash, ''), 128),
      error_class = left(coalesce(p_error_class, 'retryable'), 120),
      lease_token = null,
      lease_owner = null,
      lease_expires_at = null,
      updated_at = now()
  where generations.event_key = p_event_key
    and generations.status = 'claimed'
    and generations.lease_token = p_lease_token
  returning * into result;

  if result.event_key is null then
    raise exception 'sync generation lease ownership lost';
  end if;
  return result;
end;
$$;

revoke all on function public.request_sync_generation_dispatch(text, text) from public, anon, authenticated;
grant execute on function public.request_sync_generation_dispatch(text, text) to service_role;

revoke all on function public.claim_sync_generations(integer, text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_sync_generations(integer, text, integer, integer) to service_role;

revoke all on function public.claim_sync_generation(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_sync_generation(text, text, integer, integer) to service_role;

revoke all on function public.complete_sync_generation_shadow(text, text, text, boolean, text, timestamptz, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.complete_sync_generation_shadow(text, text, text, boolean, text, timestamptz, text, text, text, text, text, text, text) to service_role;

revoke all on function public.retry_sync_generation_shadow(text, text, text, timestamptz, boolean, text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.retry_sync_generation_shadow(text, text, text, timestamptz, boolean, text, text, text, text, text, text, text, text, text) to service_role;

comment on function public.request_sync_generation_dispatch is
  'Requests D3 shadow dispatch and supersedes older unclaimed generations without touching business data.';
comment on function public.complete_sync_generation_shadow is
  'Completes one owned D3 shadow comparison using metadata hashes only; never publishes a read model.';
