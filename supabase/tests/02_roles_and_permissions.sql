-- Role-based permissions inside one organisation, last-admin protection,
-- column-level privileges, platform admin separation and audit immutability.
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

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

insert into public.platform_admins (user_id, note) values ('66666666-6666-6666-6666-666666666666', 'support');

select tests.login_as('11111111-1111-1111-1111-111111111111');
select lives_ok($$ select public.create_invitation(tests.id('org_a'), 'newcomer@alpha.test', 'viewer') $$,
  'org_admin can invite');

-- Viewer ---------------------------------------------------------------------
select tests.login_as('33333333-3333-3333-3333-333333333333');
select is((select count(*)::int from public.organization_members), 4, 'viewer can read the member list');
select is(tests.affected($$ update public.organizations set name = 'Hacked' $$), 0, 'viewer cannot update the organisation');
select is(tests.affected($$ update public.organization_members set role = 'org_admin'
                            where user_id = '33333333-3333-3333-3333-333333333333' $$), 0,
  'viewer cannot promote themselves');
select is(tests.affected($$ delete from public.organization_members
                            where user_id = '44444444-4444-4444-4444-444444444444' $$), 0,
  'viewer cannot remove other members');
select is_empty('select 1 from public.organization_invitations', 'viewer cannot read invitations');
select is_empty('select 1 from public.audit_logs', 'viewer cannot read the audit log');
select throws_ok($$ insert into public.organization_members (organization_id, user_id, role)
                   values (tests.id('org_b'), '33333333-3333-3333-3333-333333333333', 'org_admin') $$,
  '42501', null, 'members cannot be inserted directly (no INSERT privilege)');
select throws_ok($$ insert into public.platform_admins (user_id) values ('33333333-3333-3333-3333-333333333333') $$,
  '42501', null, 'nobody can grant themselves platform admin');

-- Auditor --------------------------------------------------------------------
select tests.login_as('44444444-4444-4444-4444-444444444444');
select ok((select count(*) from public.audit_logs) > 0, 'auditor can read the audit log');
select is(tests.affected($$ update public.organizations set name = 'Audited' $$), 0, 'auditor cannot update the organisation');

-- Security manager -----------------------------------------------------------
select tests.login_as('77777777-7777-7777-7777-777777777777');
select is(tests.affected($$ update public.organizations set name = 'Managed' $$), 0,
  'security_manager cannot change organisation settings');
select is(tests.affected($$ update public.organization_members set role = 'viewer'
                            where user_id = '44444444-4444-4444-4444-444444444444' $$), 0,
  'security_manager cannot change roles');

-- Org admin ------------------------------------------------------------------
select tests.login_as('11111111-1111-1111-1111-111111111111');
select is(tests.affected($$ update public.organizations set name = 'Alpha Industrie S.r.l.' where id = tests.id('org_a') $$), 1,
  'org_admin can update the organisation');
select throws_ok($$ update public.organization_members set organization_id = tests.id('org_b') $$,
  '42501', null, 'organization_id of a membership is not updatable (column privilege)');
select throws_ok($$ update public.organizations set nis2_classification = 'essential' where id = tests.id('org_a') $$,
  '23514', null, 'a declared NIS2 classification requires a justification');
select lives_ok($$ update public.organizations
                   set nis2_classification = 'important',
                       classification_basis = 'Esito registrazione piattaforma ACN (dato fittizio di test)'
                   where id = tests.id('org_a') $$,
  'classification with justification is accepted');
select is((select classification_updated_by from public.organizations where id = tests.id('org_a')),
  '11111111-1111-1111-1111-111111111111'::uuid, 'who changed the classification is recorded');
select is(tests.affected($$ update public.organization_members set role = 'auditor'
                            where user_id = '33333333-3333-3333-3333-333333333333' $$), 1,
  'org_admin can change roles');
select throws_ok($$ update public.organization_members set role = 'viewer'
                   where user_id = '11111111-1111-1111-1111-111111111111' $$,
  'P0001', 'last_org_admin', 'the last org_admin cannot demote themselves');
select throws_ok($$ delete from public.organization_members
                   where user_id = '11111111-1111-1111-1111-111111111111' $$,
  'P0001', 'last_org_admin', 'the last org_admin cannot leave');
select throws_ok('insert into public.audit_logs (action, entity_type) values (''x.y'', ''x'')',
  '42501', null, 'audit log cannot be written by users');
select throws_ok('update public.audit_logs set action = ''x.y''',
  '42501', null, 'audit log cannot be modified by users');

update public.organization_members set role = 'org_admin' where user_id = '77777777-7777-7777-7777-777777777777';
select lives_ok($$ update public.organization_members set role = 'viewer'
                   where user_id = '11111111-1111-1111-1111-111111111111' $$,
  'an admin can step down once another admin exists');

-- Self-removal ---------------------------------------------------------------
select tests.login_as('33333333-3333-3333-3333-333333333333');
select is(tests.affected($$ delete from public.organization_members
                            where user_id = '33333333-3333-3333-3333-333333333333' $$), 1,
  'a member can leave an organisation');

-- Platform admin: can list organisations, cannot read tenant data -----------
select tests.login_as('66666666-6666-6666-6666-666666666666');
select is((select count(*)::int from public.organizations), 2, 'platform admin can list organisations');
select is_empty('select 1 from public.organization_members', 'platform admin has no implicit access to memberships');

-- Audit trail ----------------------------------------------------------------
select tests.logout();
select ok(exists (
  select 1 from public.audit_logs
  where action = 'member.role_changed'
    and metadata ->> 'from' = 'viewer' and metadata ->> 'to' = 'auditor'
    and actor_id = '11111111-1111-1111-1111-111111111111'), 'role changes are audited with actor');
select throws_ok('update public.audit_logs set action = ''x.y''',
  'P0001', 'audit_log_immutable', 'audit log is immutable even for privileged roles');

select * from finish();
rollback;
