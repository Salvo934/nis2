-- Invitation lifecycle, token handling, RPC input validation, profile sync
-- and rate limiting.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

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

-- Create invitation ----------------------------------------------------------
select tests.login_as('11111111-1111-1111-1111-111111111111');
select lives_ok($$ insert into tests.ids
                   select 'tok_erin', token from public.create_invitation(tests.id('org_a'), '  ERIN@Alpha.test ', 'security_manager') $$,
  'org_admin creates an invitation');
select is((select email from public.organization_invitations where email like 'erin%'), 'erin@alpha.test',
  'invited email is normalised');
select is((select count(*)::int from public.organization_invitations
           where token_hash = encode(sha256(convert_to(tests.val('tok_erin'), 'UTF8')), 'hex')), 1,
  'only the SHA-256 of the token is stored');
select throws_ok($$ select public.create_invitation(tests.id('org_a'), 'not-an-email', 'viewer') $$,
  '22023', 'invalid_input', 'invalid email is rejected');
select throws_ok($$ select public.create_invitation(tests.id('org_a'), 'x@alpha.test', 'platform_admin') $$,
  '22023', 'invalid_input', 'platform admin cannot be granted through an invitation');
select throws_ok($$ select public.create_invitation(tests.id('org_a'), 'carol@alpha.test', 'viewer') $$,
  'P0001', 'already_member', 'existing members cannot be invited again');

select tests.login_as('33333333-3333-3333-3333-333333333333');
select is_empty('select 1 from public.organization_invitations', 'a viewer cannot see invitations');

-- Wrong recipient ------------------------------------------------------------
select tests.login_as('66666666-6666-6666-6666-666666666666');
select is((select email_matches from public.get_invitation_preview(tests.val('tok_erin'))), false,
  'preview tells another user the invitation is not for them');
select throws_ok($$ select public.accept_invitation(tests.val('tok_erin')) $$,
  '42501', 'invitation_email_mismatch', 'an invitation cannot be accepted by another account');

-- Right recipient ------------------------------------------------------------
select tests.login_as('55555555-5555-5555-5555-555555555555');
select is((select status from public.get_invitation_preview(tests.val('tok_erin'))), 'pending', 'preview shows pending');
select is((select organization_name from public.get_invitation_preview(tests.val('tok_erin'))), 'Alpha S.r.l.',
  'preview shows the organisation name');
select lives_ok($$ select public.accept_invitation(tests.val('tok_erin')) $$, 'invitee accepts');
select is((select role from public.organization_members where user_id = '55555555-5555-5555-5555-555555555555'),
  'security_manager', 'invitee joins with the invited role');
select throws_ok($$ select public.accept_invitation(tests.val('tok_erin')) $$,
  'P0001', 'invitation_invalid', 'an invitation can be used only once');
select throws_ok($$ select public.accept_invitation(repeat('0', 64)) $$,
  'P0001', 'invitation_invalid', 'unknown tokens are rejected');
select is((select status from public.get_invitation_preview('garbage')), 'invalid', 'malformed tokens preview as invalid');

-- Re-invite and revoke -------------------------------------------------------
select tests.login_as('11111111-1111-1111-1111-111111111111');
insert into tests.ids select 'tok_frank_1', token from public.create_invitation(tests.id('org_a'), 'frank@gamma.test', 'viewer');
insert into tests.ids select 'inv_frank_2', invitation_id::text from public.create_invitation(tests.id('org_a'), 'frank@gamma.test', 'auditor');

select tests.login_as('22222222-2222-2222-2222-222222222222');
select throws_ok($$ select public.revoke_invitation(tests.id('inv_frank_2')) $$,
  'P0001', 'invitation_invalid', 'another tenant cannot revoke (and learns nothing)');

select tests.login_as('11111111-1111-1111-1111-111111111111');
select lives_ok($$ select public.revoke_invitation(tests.id('inv_frank_2')) $$, 'org_admin revokes an invitation');

select tests.login_as('88888888-8888-8888-8888-888888888888');
select throws_ok($$ select public.accept_invitation(tests.val('tok_frank_1')) $$,
  'P0001', 'invitation_invalid', 're-inviting invalidates the previous token');

-- Expiry ---------------------------------------------------------------------
select tests.login_as('11111111-1111-1111-1111-111111111111');
insert into tests.ids select 'tok_mallory', token from public.create_invitation(tests.id('org_a'), 'mallory@evil.test', 'viewer');
select tests.logout();
update public.organization_invitations
   set created_at = now() - interval '10 days', expires_at = now() - interval '3 days'
 where email = 'mallory@evil.test';
select tests.login_as('66666666-6666-6666-6666-666666666666');
select throws_ok($$ select public.accept_invitation(tests.val('tok_mallory')) $$,
  'P0001', 'invitation_expired', 'expired invitations cannot be accepted');

-- Audit and secrets ----------------------------------------------------------
select tests.logout();
select is((select count(*)::int from public.audit_logs where action = 'invitation.accepted' and organization_id = tests.id('org_a')), 1,
  'acceptance is audited');
select is((select count(*)::int from public.audit_logs where action = 'invitation.revoked'), 2,
  'replacement and explicit revocation are audited');
select is_empty($$ select 1 from public.audit_logs a, tests.ids t
                   where t.key like 'tok_%' and a.metadata::text like '%' || t.value || '%' $$,
  'tokens never appear in the audit log');

-- Profiles -------------------------------------------------------------------
select is((select full_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'), 'Alice Alpha',
  'profile is created from auth metadata');
update auth.users set email = 'Frank.New@Gamma.test' where id = '88888888-8888-8888-8888-888888888888';
select is((select email from public.profiles where id = '88888888-8888-8888-8888-888888888888'), 'frank.new@gamma.test',
  'profile email follows auth email changes');

-- RPC validation and rate limiting ------------------------------------------
select tests.login_as('99999999-9999-9999-9999-999999999999');
select throws_ok($$ select public.create_organization('A') $$, '22023', 'invalid_input', 'too-short name is rejected');
-- The failed attempt above was rolled back together with its rate-limit hit,
-- so only successful calls count towards the limit.
select lives_ok($$ select public.create_organization('Rate ' || g) from generate_series(1, 5) g $$,
  'up to 5 organisations per hour per user');
select throws_ok($$ select public.create_organization('One too many') $$, 'P0001', 'rate_limited',
  'organisation creation is rate limited');

select tests.logout();
select * from finish();
rollback;
