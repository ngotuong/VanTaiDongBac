-- R8: table grants do not grant bigserial sequence access on a fresh database.
-- Supabase defaults may also leave browser roles able to advance/reset it.
-- Keep log ID allocation explicit and service-only; no business rows change.
revoke all on sequence public.write_job_logs_id_seq from public, anon, authenticated, service_role;
grant usage on sequence public.write_job_logs_id_seq to service_role;
