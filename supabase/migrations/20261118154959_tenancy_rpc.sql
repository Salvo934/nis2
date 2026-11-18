-- =============================================================================
-- M2 · 04 — Tenancy RPCs
-- Operations that must be atomic, rate-limited or that would otherwise need
-- INSERT rights on membership tables. Each function re-checks the caller's
-- identity and role: the organisation id coming from the browser is never
-- trusted as proof of authorisation.
--
-- Error contract: exceptions carry a stable machine-readable message
-- (not_authenticated, forbidden, invalid_input, rate_limited, already_member,
-- invitation_invalid, invitation_expired, invitation_email_mismatch,
-- last_org_admin) that the app maps to user-facing text.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

create or replace function private.require_uid()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

-- -----------------------------------------------------------------------------
-- create_organization: creates the organisation and makes the caller org_admin.
-- -----------------------------------------------------------------------------
create or replace function public.create_organization(
  p_name text,
  p_vat_number text default null,
  p_sector text default 'not_specified',
  p_size_class text default 'not_specified'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_org uuid;
begin
  perform private.check_rate_limit('create_org:' || v_uid, 5, interval '1 hour');

  begin
    insert into public.organizations (name, vat_number, sector, size_class, created_by)
    values (btrim(p_name), nullif(btrim(p_vat_number), ''), coalesce(p_sector, 'not_specified'),
            coalesce(p_size_class, 'not_specified'), v_uid)
    returning id into v_org;
  exception
    when check_violation or not_null_violation then
      raise exception 'invalid_input' using errcode = '22023';
  end;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org, v_uid, 'org_admin');

  return v_org;
end;
$$;

-- -----------------------------------------------------------------------------
-- create_invitation: org_admin only. Returns the plaintext token exactly once;
-- only its SHA-256 is stored. Re-inviting the same email replaces the
-- previous open invitation.
-- -----------------------------------------------------------------------------
create or replace function public.create_invitation(p_org uuid, p_email text, p_role text)
returns table (invitation_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := private.require_uid();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_token text;
begin
  if not private.has_org_role(p_org, array['org_admin']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  perform private.check_rate_limit('invite:' || v_uid, 30, interval '1 hour');

  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254
     or p_role is null or p_role not in ('org_admin', 'security_manager', 'auditor', 'viewer') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.organization_members m
    join public.profiles p on p.id = m.user_id
    where m.organization_id = p_org and p.email = v_email
  ) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;

  update public.organization_invitations i
     set revoked_at = now()
   where i.organization_id = p_org
     and i.email = v_email
     and i.accepted_at is null
     and i.revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  return query
  insert into public.organization_invitations as i (organization_id, email, role, token_hash, invited_by)
  values (p_org, v_email, p_role, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), v_uid)
  returning i.id, v_token, i.expires_at;
end;
$$;

-- -----------------------------------------------------------------------------
-- revoke_invitation: org_admin of the invitation's organisation only.
-- -----------------------------------------------------------------------------
create or replace function public.revoke_invitation(p_invitation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  perform private.require_uid();

  select organization_id into v_org
    from public.organization_invitations
   where id = p_invitation and accepted_at is null and revoked_at is null;

  -- Same error whether the invitation does not exist or belongs to another
  -- tenant: no information leaks across organisations.
  if v_org is null or not private.has_org_role(v_org, array['org_admin']) then
    raise exception 'invitation_invalid' using errcode = 'P0001';
  end if;

  update public.organization_invitations set revoked_at = now() where id = p_invitation;
end;
$$;

-- -----------------------------------------------------------------------------
-- get_invitation_preview: what the invite page shows before accepting.
-- -----------------------------------------------------------------------------
create or replace function public.get_invitation_preview(p_token text)
returns table (status text, organization_name text, role text, invited_email text, email_matches boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_inv public.organization_invitations;
  v_email text;
begin
  perform private.check_rate_limit('invite_lookup:' || v_uid, 60, interval '1 hour');

  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return query select 'invalid'::text, null::text, null::text, null::text, null::boolean;
    return;
  end if;

  select * into v_inv
    from public.organization_invitations
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');

  if not found then
    return query select 'invalid'::text, null::text, null::text, null::text, null::boolean;
    return;
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = v_uid;

  return query
  select
    case
      when v_inv.revoked_at is not null then 'revoked'
      when v_inv.accepted_at is not null then 'accepted'
      when v_inv.expires_at <= now() then 'expired'
      else 'pending'
    end,
    o.name,
    v_inv.role,
    v_inv.email,
    v_inv.email = v_email
  from public.organizations o
  where o.id = v_inv.organization_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- accept_invitation: the signed-in user's email must match the invitation.
-- -----------------------------------------------------------------------------
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := private.require_uid();
  v_inv   public.organization_invitations;
  v_email text;
begin
  perform private.check_rate_limit('invite_accept:' || v_uid, 20, interval '1 hour');

  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'invitation_invalid' using errcode = 'P0001';
  end if;

  select * into v_inv
    from public.organization_invitations
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
   for update;

  if not found or v_inv.revoked_at is not null or v_inv.accepted_at is not null then
    raise exception 'invitation_invalid' using errcode = 'P0001';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'invitation_expired' using errcode = 'P0001';
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = v_uid;
  if v_email is distinct from v_inv.email then
    raise exception 'invitation_email_mismatch' using errcode = '42501';
  end if;

  -- Already a member: keep the current role (role changes are an admin action).
  insert into public.organization_members (organization_id, user_id, role)
  values (v_inv.organization_id, v_uid, v_inv.role)
  on conflict (organization_id, user_id) do nothing;

  update public.organization_invitations
     set accepted_at = now(), accepted_by = v_uid
   where id = v_inv.id;

  return v_inv.organization_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Execute privileges: signed-in users only.
-- -----------------------------------------------------------------------------
revoke execute on function
  public.create_organization(text, text, text, text),
  public.create_invitation(uuid, text, text),
  public.revoke_invitation(uuid),
  public.get_invitation_preview(text),
  public.accept_invitation(text)
from public, anon;

grant execute on function
  public.create_organization(text, text, text, text),
  public.create_invitation(uuid, text, text),
  public.revoke_invitation(uuid),
  public.get_invitation_preview(text),
  public.accept_invitation(text)
to authenticated;

grant execute on function private.require_uid() to authenticated;
