-- Report generation is audited; only members of the organisation can log it.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

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

-- Fixture users (the profile row is created by the auth.users trigger).
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'alice@alpha.test',   '{"full_name":"Alice Alpha"}'),
  ('22222222-2222-2222-2222-222222222222', 'bob@beta.test',      '{"full_name":"Bob Beta"}'),
  ('33333333-3333-3333-3333-333333333333', 'carol@alpha.test',   '{"full_name":"Carol Viewer"}'),
  ('44444444-4444-4444-4444-444444444444', 'dave@alpha.test',    '{"full_name":"Dave Auditor"}'),
  ('55555555-5555-5555-5555-555555555555', 'erin@alpha.test',    '{}'),
  ('66666666-6666-6666-6666-666666666666', 'mallory@evil.test',  '{}'),
  ('77777777-7777-7777-7777-777777777777', 'sam@alpha.test',     '{"full_name":"Sam Security"}'),
  ('88888888-8888-8888-8888-888888888888', 'frank@gamma.test',   '{}'),
  ('99999999-9999-9999-9999-999999999999', 'rita@rate.test',     '{}');

-- Organisations are created through the RPC, as the app does.
select tests.login_as('11111111-1111-1111-1111-111111111111');
insert into tests.ids values ('org_a', public.create_organization('Alpha S.r.l.', '01234567897', 'manufacturing', 'medium')::text);
select tests.login_as('22222222-2222-2222-2222-222222222222');
insert into tests.ids values ('org_b', public.create_organization('Beta S.p.A.', null, 'energy', 'large')::text);
select tests.logout();

insert into public.organization_members (organization_id, user_id, role) values
  (tests.id('org_a'), '33333333-3333-3333-3333-333333333333', 'viewer'),
  (tests.id('org_a'), '44444444-4444-4444-4444-444444444444', 'auditor'),
  (tests.id('org_a'), '77777777-7777-7777-7777-777777777777', 'security_manager');
-- ---------------------------------------------------------------------------

select tests.logout();
insert into tests.ids select 'version', id::text from public.regulatory_framework_versions where version_label = '2022/2555-v1';
select tests.login_as('11111111-1111-1111-1111-111111111111');
insert into tests.ids select 'assessment', public.create_assessment(tests.id('org_a'), tests.id('version'), 'Assessment da riportare')::text;

select tests.login_as('33333333-3333-3333-3333-333333333333');
select lives_ok($$ select public.log_report_generated(tests.id('assessment')) $$, 'a viewer can generate a report');

select tests.login_as('22222222-2222-2222-2222-222222222222');
select throws_ok($$ select public.log_report_generated(tests.id('assessment')) $$, '42501', 'forbidden',
  'another organisation cannot log a report on Alpha''s assessment');
select throws_ok($$ select public.log_report_generated(gen_random_uuid()) $$, '42501', 'forbidden',
  'unknown assessments give the same error');

select tests.login_anon();
select throws_ok($$ select public.log_report_generated(tests.id('assessment')) $$, '42501', null,
  'anonymous users cannot call it');

select tests.logout();
select ok(exists (select 1 from public.audit_logs
                  where action = 'report.generated' and actor_id = '33333333-3333-3333-3333-333333333333'
                    and metadata ->> 'catalogue_version' = '2022/2555-v1'),
  'the report generation is audited with actor and catalogue version');

select * from finish();
rollback;
