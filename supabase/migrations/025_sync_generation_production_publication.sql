-- D5: retain the D4 atomic publication contract while allowing the separately
-- configured Production audience. Browser roles remain unable to read or write
-- publication metadata and the service role still writes only through this RPC.

create or replace function public.publish_sync_generation_pair(
  p_event_key text,
  p_lease_token text,
  p_workbook_year text,
  p_spreadsheet_id text,
  p_report_month text,
  p_generation_id text,
  p_source_data_version text,
  p_cache_version text,
  p_published_at timestamptz,
  p_report_source_sheet_names text[],
  p_report_payload jsonb,
  p_report_details_hash text,
  p_dashboard_source_sheet_names text[],
  p_dashboard_payload jsonb,
  p_dashboard_details_hash text,
  p_semantic_build_stamp text,
  p_audience text default 'preview'
)
returns table (
  event_key text,
  status text,
  publication_id bigint,
  generation_id text,
  report_month text,
  source_data_version text,
  cache_version text,
  published_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.sync_generations;
  invalidation public.publication_invalidations;
  effective_published_at timestamptz := coalesce(p_published_at, now());
begin
  if coalesce(p_audience, '') not in ('preview', 'production') then
    raise exception 'publication audience must be preview or production';
  end if;
  if p_report_month !~ '^(0[1-9]|1[0-2])/20[0-9]{2}$' then
    raise exception 'exact report month is required';
  end if;
  if nullif(btrim(coalesce(p_source_data_version, '')), '') is null
      or nullif(btrim(coalesce(p_cache_version, '')), '') is null then
    raise exception 'publication versions are required';
  end if;
  if p_report_payload is null or p_dashboard_payload is null then
    raise exception 'both publication payloads are required';
  end if;
  if coalesce(p_report_details_hash, '') !~ '^[a-f0-9]{64}$'
      or coalesce(p_dashboard_details_hash, '') !~ '^[a-f0-9]{64}$' then
    raise exception 'publication details hashes are invalid';
  end if;

  select generations.* into target
  from public.sync_generations generations
  where generations.event_key = p_event_key
  for update;

  if target.event_key is null then
    raise exception 'sync generation not found';
  end if;
  if target.module <> 'transport'
      or target.workbook_year <> p_workbook_year
      or target.generation_id <> p_generation_id then
    raise exception 'sync generation identity mismatch';
  end if;
  if target.status = 'published' then
    select invalidations.* into invalidation
    from public.publication_invalidations invalidations
    where invalidations.audience = p_audience
      and invalidations.generation_id = target.generation_id
      and invalidations.workbook_year = target.workbook_year
      and invalidations.spreadsheet_id = p_spreadsheet_id
      and invalidations.report_month = p_report_month
    order by invalidations.id desc
    limit 1;
    if invalidation.id is null then
      raise exception 'published generation is missing invalidation metadata';
    end if;
    return query select target.event_key, target.status, invalidation.id,
      target.generation_id, invalidation.report_month,
      invalidation.source_data_version, invalidation.cache_version,
      invalidation.published_at;
    return;
  end if;
  if target.status <> 'claimed' or target.lease_token is distinct from p_lease_token then
    raise exception 'sync generation lease ownership lost';
  end if;

  -- Producer signal and accepted legacy queue metadata can legitimately create
  -- two event keys for the same generation. The first atomic publication owns
  -- the pair; the later phase only ACKs to that immutable publication.
  select invalidations.* into invalidation
  from public.publication_invalidations invalidations
  where invalidations.audience = p_audience
    and invalidations.generation_id = target.generation_id
    and invalidations.workbook_year = target.workbook_year
    and invalidations.spreadsheet_id = p_spreadsheet_id
    and invalidations.report_month = p_report_month
  order by invalidations.id desc
  limit 1;

  if invalidation.id is not null then
    update public.sync_generations generations
    set status = 'published',
        source_ready_at = coalesce(generations.source_ready_at, invalidation.published_at),
        source_data_version = left(invalidation.source_data_version, 180),
        dashboard_cache_key = '__dashboard_latest__',
        dashboard_published_at = invalidation.published_at,
        report_cache_key = invalidation.report_month,
        report_published_at = invalidation.published_at,
        shadow_checked_at = coalesce(generations.shadow_checked_at, invalidation.published_at),
        shadow_result = 'published_' || p_audience,
        shadow_match = null,
        shadow_month = invalidation.report_month,
        shadow_source_data_version = left(invalidation.source_data_version, 180),
        lease_token = null,
        lease_owner = null,
        lease_expires_at = null,
        error_class = '',
        updated_at = now()
    where generations.event_key = p_event_key
      and generations.status = 'claimed'
      and generations.lease_token = p_lease_token;

    if not found then
      raise exception 'sync generation lease ownership lost';
    end if;

    return query select target.event_key, 'published'::text, invalidation.id,
      target.generation_id, invalidation.report_month,
      invalidation.source_data_version, invalidation.cache_version,
      invalidation.published_at;
    return;
  end if;

  insert into public.publication_invalidations (
    audience, workbook_year, spreadsheet_id, report_month, generation_id,
    source_data_version, cache_version, published_at, semantic_build_stamp
  ) values (
    p_audience, p_workbook_year, p_spreadsheet_id, p_report_month,
    p_generation_id, p_source_data_version, p_cache_version,
    effective_published_at,
    coalesce(nullif(btrim(p_semantic_build_stamp), ''), target.semantic_build_stamp)
  )
  on conflict do nothing
  returning * into invalidation;

  -- A second event key can race the first one before either transaction sees
  -- the other's invalidation. The unique index serializes that race; after the
  -- winner commits, the loser ACKs the immutable publication instead of
  -- raising a unique violation or rewriting the pair.
  if invalidation.id is null then
    select invalidations.* into invalidation
    from public.publication_invalidations invalidations
    where invalidations.audience = p_audience
      and invalidations.generation_id = target.generation_id
      and invalidations.workbook_year = target.workbook_year
      and invalidations.spreadsheet_id = p_spreadsheet_id
      and invalidations.report_month = p_report_month
    order by invalidations.id desc
    limit 1;

    if invalidation.id is null then
      raise exception 'publication conflict is missing invalidation metadata';
    end if;

    update public.sync_generations generations
    set status = 'published',
        source_ready_at = coalesce(generations.source_ready_at, invalidation.published_at),
        source_data_version = left(invalidation.source_data_version, 180),
        dashboard_cache_key = '__dashboard_latest__',
        dashboard_published_at = invalidation.published_at,
        report_cache_key = invalidation.report_month,
        report_published_at = invalidation.published_at,
        shadow_checked_at = coalesce(generations.shadow_checked_at, invalidation.published_at),
        shadow_result = 'published_' || p_audience,
        shadow_match = null,
        shadow_month = invalidation.report_month,
        shadow_source_data_version = left(invalidation.source_data_version, 180),
        lease_token = null,
        lease_owner = null,
        lease_expires_at = null,
        error_class = '',
        updated_at = now()
    where generations.event_key = p_event_key
      and generations.status = 'claimed'
      and generations.lease_token = p_lease_token;

    if not found then
      raise exception 'sync generation lease ownership lost';
    end if;

    return query select target.event_key, 'published'::text, invalidation.id,
      target.generation_id, invalidation.report_month,
      invalidation.source_data_version, invalidation.cache_version,
      invalidation.published_at;
    return;
  end if;

  insert into public.report_bundles (
    spreadsheet_id, report_month, source_sheet_names, payload, cache_version,
    source_data_version, details_hash, synced_at, generation_id, published_at,
    publication_id
  ) values
  (
    p_spreadsheet_id, p_report_month,
    coalesce(p_report_source_sheet_names, '{}'::text[]), p_report_payload,
    p_cache_version, p_source_data_version, p_report_details_hash,
    effective_published_at, p_generation_id, effective_published_at,
    invalidation.id
  ),
  (
    p_spreadsheet_id, '__dashboard_latest__',
    coalesce(p_dashboard_source_sheet_names, '{}'::text[]), p_dashboard_payload,
    p_cache_version, p_source_data_version, p_dashboard_details_hash,
    effective_published_at, p_generation_id, effective_published_at,
    invalidation.id
  )
  on conflict on constraint report_bundles_pkey do update
  set source_sheet_names = excluded.source_sheet_names,
      payload = excluded.payload,
      cache_version = excluded.cache_version,
      source_data_version = excluded.source_data_version,
      details_hash = excluded.details_hash,
      synced_at = excluded.synced_at,
      generation_id = excluded.generation_id,
      published_at = excluded.published_at,
      publication_id = excluded.publication_id;

  update public.sync_generations generations
  set status = 'published',
      source_ready_at = coalesce(generations.source_ready_at, effective_published_at),
      source_data_version = left(p_source_data_version, 180),
      dashboard_cache_key = '__dashboard_latest__',
      dashboard_published_at = effective_published_at,
      report_cache_key = p_report_month,
      report_published_at = effective_published_at,
      shadow_checked_at = coalesce(generations.shadow_checked_at, effective_published_at),
      shadow_result = 'published_' || p_audience,
      shadow_match = null,
      shadow_month = p_report_month,
      shadow_source_data_version = left(p_source_data_version, 180),
      lease_token = null,
      lease_owner = null,
      lease_expires_at = null,
      error_class = '',
      semantic_build_stamp = coalesce(
        nullif(btrim(p_semantic_build_stamp), ''), generations.semantic_build_stamp
      ),
      updated_at = now()
  where generations.event_key = p_event_key
    and generations.status = 'claimed'
    and generations.lease_token = p_lease_token;

  if not found then
    raise exception 'sync generation lease ownership lost';
  end if;

  return query select target.event_key, 'published'::text, invalidation.id,
    p_generation_id, p_report_month, p_source_data_version, p_cache_version,
    effective_published_at;
end;
$$;

revoke all on function public.publish_sync_generation_pair(
  text, text, text, text, text, text, text, text, timestamptz,
  text[], jsonb, text, text[], jsonb, text, text, text
) from public, anon, authenticated;
grant execute on function public.publish_sync_generation_pair(
  text, text, text, text, text, text, text, text, timestamptz,
  text[], jsonb, text, text[], jsonb, text, text, text
) to service_role;

comment on function public.publish_sync_generation_pair is
  'D5 transaction: writes one Dashboard/report pair, generation ACK, and audience-scoped metadata invalidation atomically.';
