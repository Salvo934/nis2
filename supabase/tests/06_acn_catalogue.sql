-- ACN basic security measures catalogue (Determinazione 379907/2025):
-- both annexes published, complete, immutable and usable for assessments.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

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
insert into tests.ids select 'all1', id::text from public.regulatory_framework_versions where version_label = 'ACN-379907-2025-all1';
insert into tests.ids select 'all2', id::text from public.regulatory_framework_versions where version_label = 'ACN-379907-2025-all2';

select tests.login_as('11111111-1111-1111-1111-111111111111');
select is((select count(*)::int from public.requirements where framework_version_id = tests.id('all1')), 87,
  'Allegato 1 (soggetti importanti) has 87 requirements');
select is((select count(*)::int from public.requirements where framework_version_id = tests.id('all2')), 116,
  'Allegato 2 (soggetti essenziali) has 116 requirements');
select is((select count(distinct split_part(code, '.', 1) || '.' || split_part(code, '.', 2)) ::int
             from public.requirements where framework_version_id = tests.id('all2')), 43,
  'Allegato 2 covers 43 measures');
select is((select string_agg(distinct category_code, ',' order by category_code) from public.requirements
            where framework_version_id = tests.id('all1')), 'DE,GV,ID,PR,RC,RS',
  'requirements are grouped by the six functions');
select ok((select bool_and(source_reference like 'Det. ACN 379907/2025, All. 1, misura %' and source_reference like '%D.Lgs. 138/2024, art. 24, c. 2, lett. %')
             from public.requirements where framework_version_id = tests.id('all1')),
  'every requirement cites the ACN measure and art. 24 of D.Lgs. 138/2024');

select tests.logout();
select throws_ok($$ update public.requirements set description = 'x' || description where framework_version_id = tests.id('all2') $$,
  'P0001', 'catalogue_version_immutable', 'the ACN catalogue is immutable');

select tests.login_as('11111111-1111-1111-1111-111111111111');
select lives_ok($$ insert into tests.ids select 'assessment', public.create_assessment(tests.id('org_a'), tests.id('all2'), 'Misure di base ACN')::text $$,
  'an assessment can be created on the ACN catalogue');
select is((select count(*)::int from public.assessment_answers where assessment_id = tests.id('assessment')), 116,
  'one answer per ACN requirement');

select * from finish();
rollback;
