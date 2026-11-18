-- Completing remediation tasks resolves the linked gap automatically, and
-- reopening restores the previous assessment.
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
insert into tests.ids select 'assessment', public.create_assessment(tests.id('org_a'), tests.id('version'), 'Assessment 2026')::text;
insert into tests.ids select 'ans_' || replace(r.code, '.', '_'), a.id::text
  from public.assessment_answers a join public.requirements r on r.id = a.requirement_id
 where a.assessment_id = tests.id('assessment');

update public.assessment_answers set status = 'not_implemented', justification = 'Nessuna procedura', gap_severity = 'high'
 where id = tests.id('ans_DIR-21_2_b');
with t as (
  insert into public.remediation_tasks (organization_id, assessment_answer_id, title)
  values (tests.id('org_a'), tests.id('ans_DIR-21_2_b'), 'Scrivere procedura incidenti'),
         (tests.id('org_a'), tests.id('ans_DIR-21_2_b'), 'Formare il team')
  returning id, title)
insert into tests.ids select case when title like 'Scrivere%' then 'task1' else 'task2' end, id::text from t;

-- Partial completion --------------------------------------------------------
update public.remediation_tasks set status = 'done' where id = tests.id('task1');
select is((select status from public.assessment_answers where id = tests.id('ans_DIR-21_2_b')), 'not_implemented',
  'the gap stays open while another linked task is open');

-- All tasks closed -----------------------------------------------------------
update public.remediation_tasks set status = 'done' where id = tests.id('task2');
select is((select status from public.assessment_answers where id = tests.id('ans_DIR-21_2_b')), 'implemented',
  'completing the last open task marks the requirement as implemented');
select ok((select resolved_by_tasks from public.assessment_answers where id = tests.id('ans_DIR-21_2_b')),
  'the answer is flagged as resolved by tasks');
-- Within one test transaction both tasks share the same completion time, so
-- only check that both titles are listed, not their order.
select ok((select justification like 'Nessuna procedura' || E'\n\n' || 'Aggiornato automaticamente il %: attività correttive completate (%).'
              and justification like '%Scrivere procedura incidenti%'
              and justification like '%Formare il team%'
             from public.assessment_answers where id = tests.id('ans_DIR-21_2_b')),
  'the justification keeps the original text and lists the completed tasks');
select is((select gap_severity from public.assessment_answers where id = tests.id('ans_DIR-21_2_b')), null,
  'an implemented requirement has no gap severity');
select is((select assessed_by from public.assessment_answers where id = tests.id('ans_DIR-21_2_b')),
  '77777777-7777-7777-7777-777777777777'::uuid, 'the user who completed the task is recorded as assessor');

-- Reopening restores the previous assessment --------------------------------
update public.remediation_tasks set status = 'in_progress' where id = tests.id('task2');
select is((select status || '|' || justification || '|' || gap_severity from public.assessment_answers where id = tests.id('ans_DIR-21_2_b')),
  'not_implemented|Nessuna procedura|high', 'reopening a task restores status, justification and severity');
select ok(not (select resolved_by_tasks from public.assessment_answers where id = tests.id('ans_DIR-21_2_b')),
  'the automatic flag is cleared after reopening');

-- A manual edit wins ---------------------------------------------------------
update public.remediation_tasks set status = 'done' where id = tests.id('task2');
update public.assessment_answers set status = 'partial', justification = 'Verifica dell''auditor: copertura parziale'
 where id = tests.id('ans_DIR-21_2_b');
select ok(not (select resolved_by_tasks from public.assessment_answers where id = tests.id('ans_DIR-21_2_b')),
  'a manual change clears the automatic resolution');
update public.remediation_tasks set status = 'todo' where id = tests.id('task2');
select is((select status from public.assessment_answers where id = tests.id('ans_DIR-21_2_b')), 'partial',
  'reopening a task does not override a manual assessment');

-- Cancelled-only tasks do not resolve anything ------------------------------
update public.assessment_answers set status = 'partial', justification = 'Solo backup locale' where id = tests.id('ans_DIR-21_2_c');
insert into public.remediation_tasks (organization_id, assessment_answer_id, title, status)
values (tests.id('org_a'), tests.id('ans_DIR-21_2_c'), 'Attività annullata', 'cancelled');
select is((select status from public.assessment_answers where id = tests.id('ans_DIR-21_2_c')), 'partial',
  'cancelled tasks alone do not close a gap');

-- Already implemented answers are untouched ---------------------------------
update public.assessment_answers set status = 'implemented', justification = 'Policy approvata' where id = tests.id('ans_DIR-20_1');
insert into public.remediation_tasks (organization_id, assessment_answer_id, title, status)
values (tests.id('org_a'), tests.id('ans_DIR-20_1'), 'Revisione annuale', 'done');
select ok(not (select resolved_by_tasks from public.assessment_answers where id = tests.id('ans_DIR-20_1')),
  'a requirement that was already implemented is not marked as auto-resolved');

-- Deleting the last open task resolves the gap ------------------------------
update public.assessment_answers set status = 'not_implemented', justification = 'Assente' where id = tests.id('ans_DIR-21_2_d');
insert into public.remediation_tasks (organization_id, assessment_answer_id, title, status)
values (tests.id('org_a'), tests.id('ans_DIR-21_2_d'), 'Questionario fornitori', 'done');
with t as (
  insert into public.remediation_tasks (organization_id, assessment_answer_id, title)
  values (tests.id('org_a'), tests.id('ans_DIR-21_2_d'), 'Duplicato') returning id)
insert into tests.ids select 'dup', id::text from t;
select is((select status from public.assessment_answers where id = tests.id('ans_DIR-21_2_d')), 'not_implemented',
  'an open task keeps the gap open');
delete from public.remediation_tasks where id = tests.id('dup');
select is((select status from public.assessment_answers where id = tests.id('ans_DIR-21_2_d')), 'implemented',
  'deleting the last open task lets the completed ones close the gap');

-- Archived assessments are frozen -------------------------------------------
update public.assessment_answers set status = 'not_implemented', justification = 'Nessuna crittografia' where id = tests.id('ans_DIR-21_2_h');
with t as (
  insert into public.remediation_tasks (organization_id, assessment_answer_id, title)
  values (tests.id('org_a'), tests.id('ans_DIR-21_2_h'), 'Cifratura dischi') returning id)
insert into tests.ids select 'task_h', id::text from t;
update public.assessments set status = 'archived' where id = tests.id('assessment');
update public.remediation_tasks set status = 'done' where id = tests.id('task_h');
select is((select status from public.assessment_answers where id = tests.id('ans_DIR-21_2_h')), 'not_implemented',
  'archived assessments are never changed automatically');

-- Users cannot forge the flag ------------------------------------------------
select throws_ok($$ update public.assessment_answers set resolved_by_tasks = true where id = tests.id('ans_DIR-21_2_h') $$,
  '42501', null, 'the automatic flag cannot be written by users');

-- Audit ----------------------------------------------------------------------
select tests.logout();
select is((select count(*)::int from public.audit_logs where action = 'answer.auto_resolved' and metadata ->> 'requirement' = 'DIR-21.2.b'), 2,
  'each automatic resolution is audited');
-- DIR-21.2.b reopened once; DIR-21.2.d was closed by its done task, reopened by
-- the open duplicate, then closed again when the duplicate was deleted.
select is((select count(*)::int from public.audit_logs where action = 'answer.auto_reopened'), 2,
  'automatic reopening is audited');

select * from finish();
rollback;
