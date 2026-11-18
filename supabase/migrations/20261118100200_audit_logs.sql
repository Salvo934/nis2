-- =============================================================================
-- M2 · 03 — Audit log (append-only)
-- Rows are written only by SECURITY DEFINER triggers/functions; the
-- `authenticated` role can read (org_admin, auditor) but never write.
-- =============================================================================

create table public.audit_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  actor_id        uuid,           -- no FK: the trail must survive user deletion
  action          text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  entity_type     text not null check (entity_type ~ '^[a-z_]+$'),
  entity_id       uuid,
  metadata        jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at      timestamptz not null default now()
);

create index audit_logs_org_created_idx on public.audit_logs (organization_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id);

revoke all on table public.audit_logs from anon, authenticated;
grant select on table public.audit_logs to authenticated;

alter table public.audit_logs enable row level security;

create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using ((select private.has_org_role(organization_id, array['org_admin', 'auditor'])));

-- Immutability, even for privileged roles (deletes only via org cascade).
create or replace function private.prevent_audit_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log_immutable' using errcode = 'P0001';
end;
$$;

create trigger audit_logs_immutable
  before update on public.audit_logs
  for each row execute function private.prevent_audit_update();

create or replace function private.log_audit_event(
  p_org uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_org, (select auth.uid()), p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
$$;

-- -----------------------------------------------------------------------------
-- Audit triggers
-- -----------------------------------------------------------------------------
create or replace function private.audit_organizations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed text[];
begin
  if tg_op = 'INSERT' then
    perform private.log_audit_event(new.id, 'organization.created', 'organization', new.id,
      jsonb_build_object('name', new.name));
  else
    select coalesce(array_agg(n.key order by n.key), '{}')
      into v_changed
      from jsonb_each(to_jsonb(new)) n
      join jsonb_each(to_jsonb(old)) o using (key)
     where n.value is distinct from o.value
       and n.key not in ('updated_at', 'classification_updated_at', 'classification_updated_by');

    if cardinality(v_changed) > 0 then
      perform private.log_audit_event(new.id, 'organization.updated', 'organization', new.id,
        jsonb_build_object('changed_fields', to_jsonb(v_changed)));
    end if;
  end if;
  return null;
end;
$$;

create trigger organizations_audit
  after insert or update on public.organizations
  for each row execute function private.audit_organizations();

create or replace function private.audit_organization_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.log_audit_event(new.organization_id, 'member.added', 'organization_member', new.id,
      jsonb_build_object('user_id', new.user_id, 'role', new.role));
  elsif tg_op = 'UPDATE' then
    if new.role is distinct from old.role then
      perform private.log_audit_event(new.organization_id, 'member.role_changed', 'organization_member', new.id,
        jsonb_build_object('user_id', new.user_id, 'from', old.role, 'to', new.role));
    end if;
  else
    -- Skip when the whole organisation is being deleted.
    if exists (select 1 from public.organizations where id = old.organization_id) then
      perform private.log_audit_event(old.organization_id, 'member.removed', 'organization_member', old.id,
        jsonb_build_object('user_id', old.user_id, 'role', old.role,
                           'self_removal', old.user_id = (select auth.uid())));
    end if;
  end if;
  return null;
end;
$$;

create trigger organization_members_audit
  after insert or update or delete on public.organization_members
  for each row execute function private.audit_organization_members();

create or replace function private.audit_organization_invitations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- token_hash is never written to the audit trail.
  if tg_op = 'INSERT' then
    perform private.log_audit_event(new.organization_id, 'invitation.created', 'organization_invitation', new.id,
      jsonb_build_object('email', new.email, 'role', new.role, 'expires_at', new.expires_at));
  elsif new.revoked_at is not null and old.revoked_at is null then
    perform private.log_audit_event(new.organization_id, 'invitation.revoked', 'organization_invitation', new.id,
      jsonb_build_object('email', new.email));
  elsif new.accepted_at is not null and old.accepted_at is null then
    perform private.log_audit_event(new.organization_id, 'invitation.accepted', 'organization_invitation', new.id,
      jsonb_build_object('email', new.email, 'role', new.role));
  end if;
  return null;
end;
$$;

create trigger organization_invitations_audit
  after insert or update on public.organization_invitations
  for each row execute function private.audit_organization_invitations();
