-- =============================================================================
-- M2 · 01 — Foundations
-- Private schema for helpers that must never be exposed through the Data API,
-- generic triggers and the rate limiter used by sensitive RPCs.
-- =============================================================================

create schema if not exists private;

-- The private schema is NOT in the API "exposed schemas" list, so these objects
-- cannot be called over HTTP. `authenticated` still needs USAGE so that RLS
-- policies (evaluated as the calling role) can invoke the helper functions.
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- Functions are executable by PUBLIC by default in Postgres: turn that off for
-- everything created from now on, and grant explicitly where needed.
alter default privileges in schema private revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;

-- -----------------------------------------------------------------------------
-- updated_at trigger
-- -----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Rate limiting (fixed window, stored in Postgres so it works across Workers
-- isolates). Raises `rate_limited` when the limit is exceeded.
-- -----------------------------------------------------------------------------
create table private.rate_limits (
  key          text        not null check (char_length(key) <= 200),
  window_start timestamptz not null,
  hits         integer     not null default 1 check (hits > 0),
  primary key (key, window_start)
);

create index rate_limits_window_start_idx on private.rate_limits (window_start);

revoke all on table private.rate_limits from public, authenticated;

create or replace function private.check_rate_limit(p_key text, p_max integer, p_window interval)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seconds double precision := extract(epoch from p_window);
  v_window  timestamptz := to_timestamp(floor(extract(epoch from now()) / v_seconds) * v_seconds);
  v_hits    integer;
begin
  if p_key is null or p_max < 1 or v_seconds <= 0 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  insert into private.rate_limits as r (key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;

  -- Opportunistic cleanup keeps the table small without a cron job.
  if random() < 0.01 then
    delete from private.rate_limits where window_start < now() - interval '2 days';
  end if;

  if v_hits > p_max then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
end;
$$;
