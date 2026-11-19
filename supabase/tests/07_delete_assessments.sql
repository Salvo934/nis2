-- Deleting assessments: only org_admin, answers removed, linked tasks kept
-- (detached), audited, isolated between tenants.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

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

select tests.login_as('77777777-7777-7777-7777-777777777777');
insert into tests.ids select 'assessment', public.create_assessment(tests.id('org_a'), tests.id('version'), 'Assessment NIS2 novembre')::text;
insert into tests.ids select 'answer', a.id::text from public.assessment_answers a
  join public.requirements r on r.id = a.requirement_id
 where a.assessment_id = tests.id('assessment') and r.code = 'DIR-21.2.b';
update public.assessment_answers set status = 'not_implemented', justification = 'Assente' where id = tests.id('answer');
with t as (
  insert into public.remediation_tasks (organization_id, assessment_answer_id, title)
  values (tests.id('org_a'), tests.id('answer'), 'Procedura incidenti') returning id)
insert into tests.ids select 'task', id::text from t;

-- Who cannot delete ----------------------------------------------------------
select is(tests.affected($$ delete from public.assessments where id = tests.id('assessment') $$), 0,
  'a security manager cannot delete assessments');
select tests.login_as('33333333-3333-3333-3333-333333333333');
select is(tests.affected($$ delete from public.assessments where id = tests.id('assessment') $$), 0,
  'a viewer cannot delete assessments');
select tests.login_as('22222222-2222-2222-2222-222222222222');
select is(tests.affected($$ delete from public.assessments where id = tests.id('assessment') $$), 0,
  'an admin of another organisation cannot delete it');
select tests.login_anon();
select throws_ok($$ delete from public.assessments $$, '42501', null, 'anonymous users cannot delete');

-- Org admin deletes ------------------------------------------------------------
select tests.login_as('11111111-1111-1111-1111-111111111111');
select is(tests.affected($$ delete from public.assessments where id = tests.id('assessment') $$), 1,
  'org_admin deletes the assessment');
select is_empty($$ select 1 from public.assessment_answers where assessment_id = tests.id('assessment') $$,
  'its answers are deleted');
select is((select count(*)::int from public.remediation_tasks where id = tests.id('task')), 1,
  'linked remediation tasks are kept');
select is((select assessment_answer_id from public.remediation_tasks where id = tests.id('task')), null::uuid,
  'kept tasks are detached from the deleted requirement');
select is((select status from public.remediation_tasks where id = tests.id('task')), 'todo',
  'detaching does not change the task status');

select tests.logout();
select ok(exists (select 1 from public.audit_logs
                  where action = 'assessment.deleted'
                    and metadata ->> 'title' = 'Assessment NIS2 novembre'
                    and (metadata ->> 'answers_deleted')::int = 17
                    and (metadata ->> 'tasks_detached')::int = 1
                    and actor_id = '11111111-1111-1111-1111-111111111111'),
  'the deletion is audited with counts and actor');

-- Deleting the whole organisation still works (cascade) ---------------------
select tests.login_as('22222222-2222-2222-2222-222222222222');
insert into tests.ids select 'assessment_b', public.create_assessment(tests.id('org_b'), tests.id('version'), 'Beta 2026')::text;
insert into public.remediation_tasks (organization_id, assessment_answer_id, title)
select tests.id('org_b'), a.id, 'Task Beta' from public.assessment_answers a
 where a.assessment_id = tests.id('assessment_b') limit 1;
select tests.logout();
select lives_ok($$ delete from public.organizations where id = tests.id('org_b') $$,
  'deleting an organisation with assessments and linked tasks still cascades cleanly');

select * from finish();
rollback;
