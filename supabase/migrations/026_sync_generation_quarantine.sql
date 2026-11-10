-- D5B: forward-only quarantine for exact, never-dispatched generation orphans.
-- The RPC keeps every metadata row as audit evidence. It cannot quarantine a
-- claimed/dispatched/retried/terminal generation and never deletes rows.

alter table public.sync_generations
  add column if not exists quarantined_at timestamptz null,
  add column if not exists quarantine_reason text not null default ''
    check (length(quarantine_reason) <= 240),
  add column if not exists quarantine_batch_key text not null default ''
    check (length(quarantine_batch_key) <= 180);

alter table public.sync_generations
  drop constraint if exists sync_generations_status_check;
alter table public.sync_generations
  add constraint sync_generations_status_check check (
    status in (
      'pending', 'dispatched', 'claimed', 'source_wait', 'published',
      'retryable', 'failed', 'shadowed', 'superseded', 'quarantined'
    )
  );

create index if not exists sync_generations_quarantine_batch_idx
  on public.sync_generations (quarantine_batch_key, quarantined_at)
  where status = 'quarantined';

create or replace function public.quarantine_sync_generations(
  p_event_keys text[],
  p_reason text,
  p_batch_key text
)
returns setof public.sync_generations
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_count integer;
  distinct_count integer;
  eligible_count integer;
  updated_count integer;
begin
  requested_count := coalesce(cardinality(p_event_keys), 0);
  if requested_count < 1 or requested_count > 200 then
    raise exception 'quarantine requires 1..200 exact event keys';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 8 or length(btrim(p_reason)) > 240 then
    raise exception 'quarantine reason must contain 8..240 characters';
  end if;
  if length(btrim(coalesce(p_batch_key, ''))) < 8 or length(btrim(p_batch_key)) > 180 then
    raise exception 'quarantine batch key must contain 8..180 characters';
  end if;

  select count(distinct event_key) into distinct_count
  from unnest(p_event_keys) as requested(event_key)
  where nullif(btrim(event_key), '') is not null;
  if distinct_count <> requested_count then
    raise exception 'quarantine event keys must be non-empty and unique';
  end if;

  select count(*) into eligible_count
  from public.sync_generations generations
  where generations.event_key = any(p_event_keys)
    and generations.status = 'pending'
    and generations.dispatch_requested = false
    and generations.attempts = 0
    and generations.lease_token is null
    and generations.lease_owner is null
    and generations.lease_expires_at is null;
  if eligible_count <> requested_count then
    raise exception 'quarantine target mismatch or generation is no longer an undispatched pending orphan';
  end if;

  return query
  update public.sync_generations generations
  set status = 'quarantined',
      quarantined_at = now(),
      quarantine_reason = btrim(p_reason),
      quarantine_batch_key = btrim(p_batch_key),
      error_class = 'quarantined_orphan',
      updated_at = now()
  where generations.event_key = any(p_event_keys)
    and generations.status = 'pending'
    and generations.dispatch_requested = false
    and generations.attempts = 0
    and generations.lease_token is null
    and generations.lease_owner is null
    and generations.lease_expires_at is null
  returning generations.*;
  get diagnostics updated_count = row_count;
  if updated_count <> requested_count then
    raise exception 'quarantine target changed concurrently';
  end if;
end;
$$;

revoke all on function public.quarantine_sync_generations(text[], text, text)
  from public, anon, authenticated;
grant execute on function public.quarantine_sync_generations(text[], text, text)
  to service_role;

comment on function public.quarantine_sync_generations is
  'Terminalizes exact never-dispatched pending generation orphans while preserving metadata and an operator audit reason; never deletes or retries rows.';
