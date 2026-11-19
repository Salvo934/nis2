-- Demo mode: one private fictitious organisation per anonymous visitor.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- ---------------------------------------------------------------------------
-- Test helpers (created inside the transaction, rolled back at the end)
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to anon, authenticated;

create table tests.ids (key text primary key, value text not null);
grant all on table tests.ids to anon, authenticated;

create function tests.id(p_key text) returns uuid language sql stable as $$
  select value::uuid from tests.ids where key = p_key;
$$;
create function tests.val(p_key text) returns text language sql stable as $$
  select value from tests.ids where key = p_key;
$$;

-- Impersonate a signed-in user, exactly as PostgREST does with a JWT.
create function tests.login_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create function tests.login_anonymous_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create function tests.login_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end $$;

create function tests.logout() returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Number of rows a statement touched (RLS filters silently: 0 = blocked).
create function tests.affected(p_sql text) returns integer language plpgsql as $$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on all functions in schema tests to anon, authenticated;


insert into auth.users (id, email, is_anonymous, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'alice@alpha.test', false, '{"full_name":"Alice Alpha"}'),
  ('aaaaaaaa-0000-0000-0000-000000000001', null, true, '{}'),
  ('aaaaaaaa-0000-0000-0000-000000000002', null, true, '{}');

-- A registered user cannot create demo data.
select tests.login_as('11111111-1111-1111-1111-111111111111');
select throws_ok($$ select public.create_demo_organization() $$, '42501', 'forbidden',
  'registered users cannot create a demo organisation');

select tests.login_anon();
select throws_ok($$ select public.create_demo_organization() $$, '42501', null,
  'unauthenticated visitors cannot call it');

-- Visitor 1
select tests.login_anonymous_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into tests.ids select 'demo1', public.create_demo_organization()::text;
select is(public.create_demo_organization(), tests.id('demo1'), 'calling it again returns the same organisation');

select tests.logout();
select is((select name || '|' || nis2_classification || '|' || is_demo from public.organizations where id = tests.id('demo1')),
  'Rossi Logistica S.r.l.|important|true', 'fictitious company, declared important, flagged as demo');
select is((select role from public.organization_members
            where organization_id = tests.id('demo1') and user_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'org_admin', 'the visitor is the administrator of their demo organisation');
select is((select count(*)::int from public.assessment_answers aa join public.assessments a on a.id = aa.assessment_id
            where a.organization_id = tests.id('demo1')), 87, 'the assessment covers the whole ACN Annex 1 catalogue');
select is((select count(*)::int from public.assessment_answers aa join public.assessments a on a.id = aa.assessment_id
            where a.organization_id = tests.id('demo1') and aa.status <> 'not_assessed'), 46, 'the assessment is about half done');
select is((select count(*)::int from public.assessment_answers aa join public.assessments a on a.id = aa.assessment_id
            where a.organization_id = tests.id('demo1') and aa.status in ('partial', 'not_implemented') and aa.gap_severity is null),
  0, 'every gap is classified');
select is((select status from public.assessments where organization_id = tests.id('demo1')), 'in_progress',
  'the assessment is in progress');
select is((select count(*)::int from public.remediation_tasks where organization_id = tests.id('demo1')), 10,
  'the remediation plan has 10 actions');
select ok(exists (select 1 from public.remediation_tasks
                   where organization_id = tests.id('demo1') and status <> 'done'
                     and due_date < (now() at time zone 'Europe/Rome')::date),
  'some actions are overdue');
select ok((select resolved_by_tasks from public.assessment_answers aa join public.requirements r on r.id = aa.requirement_id
            join public.assessments a on a.id = aa.assessment_id
           where a.organization_id = tests.id('demo1') and r.code = 'GV.RR-04.3'),
  'the completed action closed its gap through the normal trigger');
select is((select full_name from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'Visitatore demo',
  'the visitor gets a display name');

-- Visitor 2 gets a separate copy and cannot see visitor 1.
select tests.login_anonymous_user('aaaaaaaa-0000-0000-0000-000000000002');
insert into tests.ids select 'demo2', public.create_demo_organization()::text;
select isnt(tests.id('demo2'), tests.id('demo1'), 'each visitor gets their own organisation');
select is((select count(*)::int from public.organizations where id = tests.id('demo1')), 0,
  'a visitor cannot see another visitor''s demo');
select is((select count(*)::int from public.remediation_tasks where organization_id = tests.id('demo1')), 0,
  'nor its remediation plan');

-- Clean-up removes old demo organisations and anonymous users only.
select tests.logout();
update public.organizations set created_at = now() - interval '8 days' where id = tests.id('demo1');
update auth.users set created_at = now() - interval '8 days'
 where id in ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111');
select is(private.purge_demo_data(), 1, 'one expired demo organisation is purged');
select is((select array_agg(id::text order by id::text) from auth.users),
  array['11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002'],
  'the expired anonymous user is deleted; registered and recent users are kept');

select * from finish();
rollback;
