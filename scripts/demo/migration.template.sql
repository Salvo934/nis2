-- =============================================================================
-- Demo mode ("Prova la demo")
--
-- Every visitor gets an anonymous Supabase session and THEIR OWN copy of a
-- fictitious company (Rossi Logistica S.r.l.): visitors never see or change
-- each other's data, and no shared password exists.
--
-- * create_demo_organization(): anonymous sessions only; idempotent (returns
--   the visitor's existing demo organisation); rate limited.
-- * The dataset is generated from data/demo/rossi-logistica.json by
--   scripts/demo/build-migration.mjs (the same file feeds the sample PDF).
-- * purge_demo_data(): removes demo organisations and anonymous users older
--   than 7 days; scheduled daily with pg_cron when the extension is available.
--
-- GENERATED FILE: edit the JSON or scripts/demo/migration.template.sql.
-- =============================================================================

alter table public.organizations add column is_demo boolean not null default false;
-- No column grant: clients can read organisations (table-level select) but
-- can never set or clear the flag.

create or replace function private.is_anonymous()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;

create or replace function private.demo_dataset()
returns jsonb
language sql
immutable
set search_path = ''
as $fn$
  select __DEMO_DATASET__::jsonb;
$fn$;

create or replace function public.create_demo_organization()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := private.require_uid();
  v_data       jsonb := private.demo_dataset();
  v_today      date := (now() at time zone 'Europe/Rome')::date;
  v_org        uuid;
  v_version    uuid;
  v_assessment uuid;
  v_answer     uuid;
  v_item       jsonb;
begin
  -- Demo data is only for anonymous visitors, never mixed into real accounts.
  if not private.is_anonymous() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select o.id into v_org
    from public.organizations o
    join public.organization_members m on m.organization_id = o.id and m.user_id = v_uid
   where o.is_demo
   limit 1;
  if v_org is not null then
    return v_org;
  end if;

  perform private.check_rate_limit('demo:' || v_uid, 3, interval '1 hour');

  select v.id into v_version
    from public.regulatory_framework_versions v
   where v.version_label = v_data #>> '{assessment,catalogue_version}' and v.status = 'published';
  if v_version is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  update public.profiles set full_name = 'Visitatore demo' where id = v_uid and full_name is null;

  insert into public.organizations (name, sector, size_class, nis2_classification, classification_basis,
                                    created_by, is_demo)
  values (v_data #>> '{organization,name}', v_data #>> '{organization,sector}',
          v_data #>> '{organization,size_class}', v_data #>> '{organization,nis2_classification}',
          v_data #>> '{organization,classification_basis}', v_uid, true)
  returning id into v_org;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org, v_uid, 'org_admin');

  v_assessment := public.create_assessment(v_org, v_version, v_data #>> '{assessment,title}');

  for v_item in select * from jsonb_array_elements(v_data -> 'answers') loop
    update public.assessment_answers aa
       set status = v_item ->> 'status',
           justification = v_item ->> 'justification',
           owner_id = v_uid,
           gap_severity = v_item ->> 'gap_severity'
      from public.requirements r
     where aa.assessment_id = v_assessment
       and r.id = aa.requirement_id
       and r.code = v_item ->> 'code';
    if not found then
      raise exception 'demo dataset: unknown requirement %', v_item ->> 'code';
    end if;
  end loop;

  -- Tasks last: completing one closes its gap through the normal trigger.
  for v_item in select * from jsonb_array_elements(v_data -> 'tasks') loop
    select aa.id into v_answer
      from public.assessment_answers aa
      join public.requirements r on r.id = aa.requirement_id
     where aa.assessment_id = v_assessment and r.code = v_item ->> 'code';

    insert into public.remediation_tasks (organization_id, assessment_answer_id, title, description,
                                          priority, status, assignee_id, due_date)
    values (v_org, v_answer, v_item ->> 'title', v_item ->> 'description', v_item ->> 'priority',
            v_item ->> 'status', v_uid, v_today + (v_item ->> 'due_in_days')::integer);
  end loop;

  return v_org;
end;
$$;

revoke execute on function public.create_demo_organization() from public, anon;
grant execute on function public.create_demo_organization() to authenticated;

-- -----------------------------------------------------------------------------
-- Fix: deleting an organisation whose members own requirements failed, because
-- the member-removal trigger updated answers already removed by the cascade.
-- When the organisation itself is being deleted there is nothing to clear.
-- -----------------------------------------------------------------------------
create or replace function private.clear_assignments_of_removed_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.organizations where id = old.organization_id) then
    return old;
  end if;
  update public.assessment_answers set owner_id = null
   where organization_id = old.organization_id and owner_id = old.user_id;
  update public.remediation_tasks set assignee_id = null
   where organization_id = old.organization_id and assignee_id = old.user_id;
  return old;
end;
$$;

-- -----------------------------------------------------------------------------
-- Clean-up of demo data
-- -----------------------------------------------------------------------------
create or replace function private.purge_demo_data(p_older_than interval default interval '7 days')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orgs integer;
begin
  delete from public.organizations where is_demo and created_at < now() - p_older_than;
  get diagnostics v_orgs = row_count;

  -- Anonymous users that belong to no real organisation.
  delete from auth.users u
   where u.is_anonymous
     and u.created_at < now() - p_older_than
     and not exists (select 1
                       from public.organization_members m
                       join public.organizations o on o.id = m.organization_id
                      where m.user_id = u.id and not o.is_demo);
  return v_orgs;
end;
$$;

revoke execute on function private.purge_demo_data(interval) from public, anon, authenticated;

do $do$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('purge-demo-data', '17 3 * * *', 'select private.purge_demo_data()');
  else
    raise notice 'pg_cron not available: run private.purge_demo_data() periodically';
  end if;
end
$do$;
