-- D5F: terminalize one exact investigated retryable generation before rollout.
-- This is deliberately separate from the D5B orphan quarantine RPC: it only
-- accepts a fully identified retryable row whose attempts/error still match,
-- has no active lease or source-ready/publication evidence, and never deletes
-- or retries the generation. The original error_class remains audit evidence.

create or replace function public.quarantine_retryable_sync_generation(
  p_event_key text,
  p_generation_id text,
  p_expected_attempts integer,
  p_expected_error_class text,
  p_reason text,
  p_batch_key text
)
returns public.sync_generations
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.sync_generations;
  result public.sync_generations;
begin
  if length(btrim(coalesce(p_event_key, ''))) < 16
      or length(btrim(p_event_key)) > 180 then
    raise exception 'exact retryable quarantine event key is invalid';
  end if;
  if length(btrim(coalesce(p_generation_id, ''))) < 1
      or length(btrim(p_generation_id)) > 180 then
    raise exception 'exact retryable quarantine generation id is invalid';
  end if;
  if coalesce(p_expected_attempts, 0) < 1 then
    raise exception 'exact retryable quarantine attempts must be positive';
  end if;
  if length(btrim(coalesce(p_expected_error_class, ''))) < 1
      or length(btrim(p_expected_error_class)) > 120 then
    raise exception 'exact retryable quarantine error class is invalid';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 8
      or length(btrim(p_reason)) > 240 then
    raise exception 'quarantine reason must contain 8..240 characters';
  end if;
  if length(btrim(coalesce(p_batch_key, ''))) < 8
      or length(btrim(p_batch_key)) > 180 then
    raise exception 'quarantine batch key must contain 8..180 characters';
  end if;

  select generations.* into target
  from public.sync_generations generations
  where generations.event_key = btrim(p_event_key)
  for update;

  if target.event_key is null then
    raise exception 'exact retryable quarantine target not found';
  end if;
  if target.generation_id <> btrim(p_generation_id)
      or target.status <> 'retryable'
      or target.dispatch_requested <> true
      or target.attempts <> p_expected_attempts
      or target.error_class <> btrim(p_expected_error_class)
      or target.lease_token is not null
      or target.lease_owner is not null
      or target.lease_expires_at is not null
      or target.source_ready_at is not null
      or target.dashboard_published_at is not null
      or target.report_published_at is not null
      or target.dashboard_cache_key <> ''
      or target.report_cache_key <> '' then
    raise exception 'exact retryable quarantine target state mismatch';
  end if;
  if exists (
    select 1 from public.report_bundles bundles
    where bundles.generation_id = target.generation_id
  ) or exists (
    select 1 from public.publication_invalidations invalidations
    where invalidations.generation_id = target.generation_id
  ) then
    raise exception 'exact retryable quarantine refuses published evidence';
  end if;

  update public.sync_generations generations
  set status = 'quarantined',
      quarantined_at = now(),
      quarantine_reason = btrim(p_reason),
      quarantine_batch_key = btrim(p_batch_key),
      updated_at = now()
  where generations.event_key = target.event_key
    and generations.status = 'retryable'
    and generations.generation_id = target.generation_id
    and generations.attempts = target.attempts
    and generations.error_class = target.error_class
  returning generations.* into result;

  if result.event_key is null then
    raise exception 'exact retryable quarantine target changed concurrently';
  end if;
  return result;
end;
$$;

revoke all on function public.quarantine_retryable_sync_generation(
  text, text, integer, text, text, text
) from public, anon, authenticated;
grant execute on function public.quarantine_retryable_sync_generation(
  text, text, integer, text, text, text
) to service_role;

comment on function public.quarantine_retryable_sync_generation is
  'Terminalizes one fully identified investigated retryable generation with exact state and no publication evidence; preserves the original error class and never deletes or retries rows.';
