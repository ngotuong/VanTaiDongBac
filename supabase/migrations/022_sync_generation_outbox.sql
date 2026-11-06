-- D2: durable, server-only generation outbox for the future foreground lane.
-- This table stores routing/version metadata only. It must never contain Sheet
-- values, financial payloads, user identifiers, or credentials.

create table if not exists public.sync_generations (
  event_key text primary key check (length(event_key) between 16 and 180),
  generation_id text not null check (length(btrim(generation_id)) between 1 and 180),
  workbook_year text not null check (workbook_year ~ '^20[0-9]{2}$'),
  module text not null check (module in ('transport', 'fund')),
  queue_name text not null check (length(btrim(queue_name)) between 1 and 80),
  source_type text not null check (length(btrim(source_type)) between 1 and 180),
  scope_sheet_names text[] not null default '{}'::text[],
  scope_grid_ids bigint[] not null default '{}'::bigint[],
  scope_row_ranges text[] not null default '{}'::text[],
  scope_months text[] not null default '{}'::text[],
  scope_start_row integer null check (scope_start_row is null or scope_start_row > 0),
  scope_num_rows integer null check (scope_num_rows is null or scope_num_rows > 0),
  structural boolean not null default false,
  full_refresh boolean not null default false,
  source_committed_at timestamptz null,
  last_signal_at timestamptz not null,
  not_before timestamptz not null default now(),
  source_data_version text not null default '' check (length(source_data_version) <= 180),
  legacy_queue_generation_id text not null default '' check (length(legacy_queue_generation_id) <= 180),
  status text not null default 'pending'
    check (status in ('pending', 'dispatched', 'claimed', 'source_wait', 'published', 'retryable', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 8 check (max_attempts between 1 and 100),
  lease_token text null,
  lease_owner text null,
  lease_expires_at timestamptz null,
  next_attempt_at timestamptz not null default now(),
  error_class text not null default '' check (length(error_class) <= 120),
  semantic_build_stamp text not null check (length(btrim(semantic_build_stamp)) between 1 and 120),
  dashboard_cache_key text not null default '' check (length(dashboard_cache_key) <= 180),
  dashboard_published_at timestamptz null,
  report_cache_key text not null default '' check (length(report_cache_key) <= 180),
  report_published_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scope_start_row is not null or scope_num_rows is null),
  check (scope_num_rows is not null or scope_start_row is null),
  check (
    (status in ('claimed', 'source_wait') and lease_token is not null and lease_owner is not null and lease_expires_at is not null)
    or status not in ('claimed', 'source_wait')
  )
);

create index if not exists sync_generations_due_idx
  on public.sync_generations (status, next_attempt_at, not_before, created_at)
  where status in ('pending', 'retryable', 'claimed', 'source_wait');

create index if not exists sync_generations_generation_idx
  on public.sync_generations (workbook_year, module, generation_id, created_at);

drop trigger if exists set_sync_generations_updated_at on public.sync_generations;
create trigger set_sync_generations_updated_at
before update on public.sync_generations
for each row execute function public.set_cache_updated_at();

alter table public.sync_generations enable row level security;
revoke all on table public.sync_generations from public, anon, authenticated;
revoke insert, update, delete on table public.sync_generations from service_role;
grant select on table public.sync_generations to service_role;

create or replace function public.enqueue_sync_generation(
  p_event_key text,
  p_generation_id text,
  p_workbook_year text,
  p_module text,
  p_queue_name text,
  p_source_type text,
  p_scope_sheet_names text[] default '{}'::text[],
  p_scope_grid_ids bigint[] default '{}'::bigint[],
  p_scope_row_ranges text[] default '{}'::text[],
  p_scope_months text[] default '{}'::text[],
  p_scope_start_row integer default null,
  p_scope_num_rows integer default null,
  p_structural boolean default false,
  p_full_refresh boolean default false,
  p_source_committed_at timestamptz default null,
  p_last_signal_at timestamptz default now(),
  p_not_before timestamptz default now(),
  p_source_data_version text default '',
  p_legacy_queue_generation_id text default '',
  p_semantic_build_stamp text default 'unversioned'
)
returns public.sync_generations
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.sync_generations;
begin
  insert into public.sync_generations (
    event_key, generation_id, workbook_year, module, queue_name, source_type,
    scope_sheet_names, scope_grid_ids, scope_row_ranges, scope_months, scope_start_row, scope_num_rows,
    structural, full_refresh, source_committed_at, last_signal_at, not_before,
    source_data_version, legacy_queue_generation_id, semantic_build_stamp
  ) values (
    p_event_key, p_generation_id, p_workbook_year, p_module, p_queue_name, p_source_type,
    coalesce(p_scope_sheet_names, '{}'::text[]), coalesce(p_scope_grid_ids, '{}'::bigint[]),
    coalesce(p_scope_row_ranges, '{}'::text[]), coalesce(p_scope_months, '{}'::text[]), p_scope_start_row, p_scope_num_rows,
    coalesce(p_structural, false), coalesce(p_full_refresh, false), p_source_committed_at,
    coalesce(p_last_signal_at, now()), coalesce(p_not_before, now()),
    coalesce(p_source_data_version, ''), coalesce(p_legacy_queue_generation_id, ''),
    coalesce(nullif(btrim(p_semantic_build_stamp), ''), 'unversioned')
  )
  on conflict (event_key) do update
  set last_signal_at = greatest(sync_generations.last_signal_at, excluded.last_signal_at),
      not_before = greatest(sync_generations.not_before, excluded.not_before),
      source_committed_at = case
        when sync_generations.source_committed_at is null then excluded.source_committed_at
        when excluded.source_committed_at is null then sync_generations.source_committed_at
        else greatest(sync_generations.source_committed_at, excluded.source_committed_at)
      end,
      source_data_version = case when excluded.source_data_version <> ''
        then excluded.source_data_version else sync_generations.source_data_version end
  where sync_generations.generation_id = excluded.generation_id
    and sync_generations.workbook_year = excluded.workbook_year
    and sync_generations.module = excluded.module
    and sync_generations.queue_name = excluded.queue_name
    and sync_generations.source_type = excluded.source_type
    and sync_generations.scope_sheet_names = excluded.scope_sheet_names
    and sync_generations.scope_grid_ids = excluded.scope_grid_ids
    and sync_generations.scope_row_ranges = excluded.scope_row_ranges
    and sync_generations.scope_months = excluded.scope_months
    and sync_generations.scope_start_row is not distinct from excluded.scope_start_row
    and sync_generations.scope_num_rows is not distinct from excluded.scope_num_rows
    and sync_generations.structural = excluded.structural
    and sync_generations.full_refresh = excluded.full_refresh
  returning * into result;

  if result.event_key is null then
    raise exception 'sync generation key collision';
  end if;
  return result;
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
    where attempts < max_attempts
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
      error_class = ''
  from candidates
  where generations.event_key = candidates.event_key
  returning generations.*;
end;
$$;

revoke all on function public.enqueue_sync_generation(text, text, text, text, text, text, text[], bigint[], text[], text[], integer, integer, boolean, boolean, timestamptz, timestamptz, timestamptz, text, text, text) from public, anon, authenticated;
grant execute on function public.enqueue_sync_generation(text, text, text, text, text, text, text[], bigint[], text[], text[], integer, integer, boolean, boolean, timestamptz, timestamptz, timestamptz, text, text, text) to service_role;

revoke all on function public.claim_sync_generations(integer, text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_sync_generations(integer, text, integer, integer) to service_role;

comment on table public.sync_generations is
  'Server-only durable generation outbox metadata for the future foreground sync lane; never stores business payloads or Sheet values.';
comment on function public.enqueue_sync_generation is
  'Idempotently records one normalized generation scope after the legacy queue accepts it.';
comment on function public.claim_sync_generations is
  'Atomically claims due generation metadata with SKIP LOCKED and stale-lease recovery.';
