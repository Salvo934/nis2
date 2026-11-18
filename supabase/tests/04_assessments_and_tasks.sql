-- Catalogue, assessments, answers and remediation tasks: isolation,
-- permissions, data integrity and audit.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

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

-- Catalogue ------------------------------------------------------------------
select tests.login_as('11111111-1111-1111-1111-111111111111');
select is((select count(*)::int from public.requirements where framework_version_id = tests.id('version')), 17,
  'the published NIS2 directive catalogue has 17 requirements');
select is((select dataset_checksum from public.regulatory_framework_versions where id = tests.id('version')),
  'f295b3a150cc6abe6c33a975bb613ea5624dd6c7a627592f2ca967da6306cb71', 'the catalogue checksum matches the dataset');
select throws_ok($$ insert into public.requirements (framework_version_id, code, category_code, category_name, title, description, source_reference)
                   values (tests.id('version'), 'X-1', 'X', 'X', 'Invented', 'An invented obligation', 'none') $$,
  '42501', null, 'users cannot add requirements');
select tests.logout();
select throws_ok($$ update public.requirements set title = 'Changed' where framework_version_id = tests.id('version') $$,
  'P0001', 'catalogue_version_immutable', 'a published catalogue is immutable even for privileged roles');

-- Creating assessments -------------------------------------------------------
select tests.login_as('33333333-3333-3333-3333-333333333333');
select throws_ok($$ select public.create_assessment(tests.id('org_a'), tests.id('version'), 'Viewer assessment') $$,
  '42501', 'forbidden', 'a viewer cannot create assessments');

select tests.login_as('22222222-2222-2222-2222-222222222222');
select throws_ok($$ select public.create_assessment(tests.id('org_a'), tests.id('version'), 'Hostile') $$,
  '42501', 'forbidden', 'another tenant cannot create assessments in Alpha');

select tests.login_as('77777777-7777-7777-7777-777777777777');
select lives_ok($$ insert into tests.ids select 'assessment', public.create_assessment(tests.id('org_a'), tests.id('version'), 'Assessment 2026')::text $$,
  'a security manager creates an assessment');
select is((select count(*)::int from public.assessment_answers where assessment_id = tests.id('assessment')), 17,
  'one answer per requirement is created');
insert into tests.ids select 'ans_' || replace(r.code, '.', '_'), a.id::text
  from public.assessment_answers a join public.requirements r on r.id = a.requirement_id
 where a.assessment_id = tests.id('assessment');

-- Isolation ------------------------------------------------------------------
select tests.login_as('22222222-2222-2222-2222-222222222222');
select is_empty($$ select 1 from public.assessments where id = tests.id('assessment') $$, 'bob cannot see Alpha assessments');
select is_empty($$ select 1 from public.assessment_answers where assessment_id = tests.id('assessment') $$, 'bob cannot see Alpha answers');
select is(tests.affected($$ update public.assessment_answers set status = 'implemented' where assessment_id = tests.id('assessment') $$), 0,
  'bob cannot change Alpha answers');

-- Answering ------------------------------------------------------------------
select tests.login_as('77777777-7777-7777-7777-777777777777');
select is(tests.affected($$ update public.assessment_answers set status = 'implemented', justification = 'Policy approvata dal CdA'
                            where id = tests.id('ans_DIR-20_1') $$), 1, 'security manager records an answer');
select is((select status from public.assessments where id = tests.id('assessment')), 'in_progress',
  'the first answer moves the assessment to in_progress');
select is((select assessed_by from public.assessment_answers where id = tests.id('ans_DIR-20_1')),
  '77777777-7777-7777-7777-777777777777'::uuid, 'who assessed is recorded');
select throws_ok($$ update public.assessment_answers set status = 'partial' where id = tests.id('ans_DIR-20_2') $$,
  '23514', null, '"partial" requires a justification');
select lives_ok($$ update public.assessment_answers set status = 'not_applicable', justification = 'Non pertinente nel perimetro'
                   where id = tests.id('ans_DIR-23_2') $$, '"not applicable" with a justification is accepted');
select lives_ok($$ update public.assessment_answers set status = 'not_implemented', gap_severity = 'high'
                   where id = tests.id('ans_DIR-21_2_b') $$, 'a gap can be classified');
select throws_ok($$ update public.assessment_answers set owner_id = '22222222-2222-2222-2222-222222222222'
                   where id = tests.id('ans_DIR-21_2_b') $$, 'P0001', 'assignee_not_member',
  'owners must belong to the organisation');
select throws_ok($$ update public.assessment_answers set organization_id = tests.id('org_b') where id = tests.id('ans_DIR-21_2_b') $$,
  '42501', null, 'an answer cannot be moved to another organisation');

select tests.login_as('33333333-3333-3333-3333-333333333333');
select is((select count(*)::int from public.assessments), 1, 'a viewer can read assessments');
select is(tests.affected($$ update public.assessment_answers set status = 'implemented' where id = tests.id('ans_DIR-21_2_b') $$), 0,
  'a viewer cannot change answers');

-- Remediation tasks ----------------------------------------------------------
select tests.login_as('77777777-7777-7777-7777-777777777777');
select lives_ok($$ with t as (
                     insert into public.remediation_tasks (organization_id, assessment_answer_id, title, priority, assignee_id, due_date)
                     values (tests.id('org_a'), tests.id('ans_DIR-21_2_b'), 'Procedura gestione incidenti', 'high',
                             '77777777-7777-7777-7777-777777777777', current_date + 30)
                     returning id)
                   insert into tests.ids select 'task', id::text from t $$,
  'security manager creates a task linked to a gap');
select is((select created_by from public.remediation_tasks where id = tests.id('task')),
  '77777777-7777-7777-7777-777777777777'::uuid, 'created_by is set by the database');
select throws_ok($$ insert into public.remediation_tasks (organization_id, title, assignee_id)
                   values (tests.id('org_a'), 'Task for outsider', '22222222-2222-2222-2222-222222222222') $$,
  'P0001', 'assignee_not_member', 'tasks cannot be assigned outside the organisation');
select lives_ok($$ update public.remediation_tasks set status = 'done' where id = tests.id('task') $$, 'a task can be completed');
select ok((select completed_at is not null from public.remediation_tasks where id = tests.id('task')), 'completion time is recorded');

select tests.login_as('22222222-2222-2222-2222-222222222222');
select is_empty($$ select 1 from public.remediation_tasks where organization_id = tests.id('org_a') $$, 'bob cannot see Alpha tasks');
select throws_ok($$ insert into public.remediation_tasks (organization_id, title) values (tests.id('org_a'), 'Injected') $$,
  '42501', null, 'bob cannot create tasks in Alpha');
select throws_ok($$ insert into public.remediation_tasks (organization_id, assessment_answer_id, title)
                   values (tests.id('org_b'), tests.id('ans_DIR-21_2_b'), 'Cross-tenant link') $$,
  '23503', null, 'a task cannot link to another tenant''s answer (composite FK)');

select tests.login_as('33333333-3333-3333-3333-333333333333');
select is(tests.affected($$ update public.remediation_tasks set status = 'todo' $$), 0, 'a viewer cannot change tasks');

-- Member removal and audit ---------------------------------------------------
select tests.logout();
update public.assessment_answers set owner_id = '77777777-7777-7777-7777-777777777777' where id = tests.id('ans_DIR-21_2_b');
delete from public.organization_members where user_id = '77777777-7777-7777-7777-777777777777' and organization_id = tests.id('org_a');
select ok((select owner_id is null from public.assessment_answers where id = tests.id('ans_DIR-21_2_b'))
      and (select assignee_id is null from public.remediation_tasks where id = tests.id('task')),
  'removing a member clears their assignments');
select ok(exists (select 1 from public.audit_logs where action = 'answer.updated' and metadata ->> 'requirement' = 'DIR-21.2.b')
      and exists (select 1 from public.audit_logs where action = 'task.status_changed' and metadata ->> 'to' = 'done'),
  'answers and task changes are audited');

select * from finish();
rollback;
