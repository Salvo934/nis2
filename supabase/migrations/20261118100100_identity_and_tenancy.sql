-- =============================================================================
-- M2 · 02 — Identity and tenancy
-- profiles, platform_admins, organizations, organization_members,
-- organization_invitations + RLS helper functions and policies.
--
-- Authorization model (docs/DATABASE.md §3):
--   * every tenant table has RLS enabled;
--   * membership/role checks go through SECURITY DEFINER helpers in `private`
--     (no recursive RLS, evaluated once per statement thanks to `(select …)`);
--   * writes that must be atomic or audited go through RPCs (next migration);
--   * column-level GRANTs limit which columns `authenticated` may update.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null check (email = lower(email) and char_length(email) <= 254),
  full_name  text check (full_name is null or char_length(btrim(full_name)) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- Create / sync the profile from auth.users.
create or replace function private.handle_auth_user_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 100), '');
begin
  if tg_op = 'INSERT' then
    insert into public.profiles (id, email, full_name)
    values (new.id, lower(coalesce(new.email, '')), v_name)
    on conflict (id) do nothing;
  elsif new.email is distinct from old.email then
    update public.profiles set email = lower(coalesce(new.email, '')) where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_auth_user_change();

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function private.handle_auth_user_change();

-- -----------------------------------------------------------------------------
-- platform_admins — kept apart from organisation roles on purpose.
-- No write policy: grants are managed with SQL / service scripts only.
-- -----------------------------------------------------------------------------
create table public.platform_admins (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  note       text check (note is null or char_length(note) <= 500)
);

-- -----------------------------------------------------------------------------
-- organizations
-- -----------------------------------------------------------------------------
create table public.organizations (
  id                         uuid primary key default gen_random_uuid(),
  name                       text not null check (char_length(btrim(name)) between 2 and 200),
  vat_number                 text check (vat_number is null or vat_number ~ '^[0-9]{11}$'),
  sector                     text not null default 'not_specified'
                               check (sector ~ '^[a-z_]{2,60}$'),
  size_class                 text not null default 'not_specified'
                               check (size_class in ('micro', 'small', 'medium', 'large', 'not_specified')),
  -- Declared by the organisation; the software never infers it.
  nis2_classification        text not null default 'not_determined'
                               check (nis2_classification in ('not_determined', 'essential', 'important', 'not_in_scope')),
  classification_basis       text check (classification_basis is null or char_length(classification_basis) <= 2000),
  classification_updated_at  timestamptz,
  classification_updated_by  uuid references public.profiles (id) on delete set null,
  created_by                 uuid references public.profiles (id) on delete set null,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  -- A declared classification must say why (e.g. ACN registration outcome).
  constraint organizations_classification_basis_required check (
    nis2_classification = 'not_determined'
    or char_length(btrim(coalesce(classification_basis, ''))) >= 10
  )
);

create index organizations_created_by_idx on public.organizations (created_by);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function private.set_updated_at();

create or replace function private.track_classification_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or new.nis2_classification is distinct from old.nis2_classification
     or new.classification_basis is distinct from old.classification_basis then
    new.classification_updated_at := now();
    new.classification_updated_by := (select auth.uid());
  end if;
  return new;
end;
$$;

create trigger organizations_track_classification
  before insert or update on public.organizations
  for each row execute function private.track_classification_change();

-- -----------------------------------------------------------------------------
-- organization_members
-- -----------------------------------------------------------------------------
create table public.organization_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  role            text not null check (role in ('org_admin', 'security_manager', 'auditor', 'viewer')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint organization_members_unique unique (organization_id, user_id)
);

create index organization_members_user_id_idx on public.organization_members (user_id);

create trigger organization_members_set_updated_at
  before update on public.organization_members
  for each row execute function private.set_updated_at();

-- An organisation must always keep at least one org_admin.
-- The row lock on the organisation serialises concurrent demotions/removals.
create or replace function private.ensure_org_keeps_an_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role <> 'org_admin' then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and new.role = 'org_admin' then
    return new;
  end if;

  -- The organisation itself is being deleted (cascade): nothing to protect.
  perform 1 from public.organizations where id = old.organization_id for update;
  if not found then
    return old;
  end if;

  if not exists (
    select 1 from public.organization_members
    where organization_id = old.organization_id
      and role = 'org_admin'
      and id <> old.id
  ) then
    raise exception 'last_org_admin' using errcode = 'P0001';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger organization_members_keep_admin
  before update of role or delete on public.organization_members
  for each row execute function private.ensure_org_keeps_an_admin();

-- -----------------------------------------------------------------------------
-- organization_invitations — only the SHA-256 of the token is stored.
-- -----------------------------------------------------------------------------
create table public.organization_invitations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email           text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  role            text not null check (role in ('org_admin', 'security_manager', 'auditor', 'viewer')),
  token_hash      text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by      uuid references public.profiles (id) on delete set null,
  expires_at      timestamptz not null default (now() + interval '7 days'),
  accepted_at     timestamptz,
  accepted_by     uuid references public.profiles (id) on delete set null,
  revoked_at      timestamptz,
  created_at      timestamptz not null default now(),
  constraint organization_invitations_single_outcome check (accepted_at is null or revoked_at is null),
  constraint organization_invitations_expiry check (expires_at > created_at)
);

-- At most one open invitation per (organisation, email).
create unique index organization_invitations_one_pending_idx
  on public.organization_invitations (organization_id, email)
  where accepted_at is null and revoked_at is null;

create index organization_invitations_org_idx on public.organization_invitations (organization_id, created_at desc);

-- -----------------------------------------------------------------------------
-- RLS helper functions
-- -----------------------------------------------------------------------------
create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()));
$$;

create or replace function private.has_org_role(p_org uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_org
      and m.user_id = (select auth.uid())
      and m.role = any (p_roles)
  );
$$;

create or replace function private.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_org_role(p_org, array['org_admin', 'security_manager', 'auditor', 'viewer']);
$$;

create or replace function private.shares_org_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members mine
    join public.organization_members theirs on theirs.organization_id = mine.organization_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = p_user
  );
$$;

grant execute on function
  private.is_platform_admin(),
  private.has_org_role(uuid, text[]),
  private.is_org_member(uuid),
  private.shares_org_with(uuid)
to authenticated;

-- -----------------------------------------------------------------------------
-- Privileges: start from nothing, then grant the minimum.
-- (Supabase grants ALL on public tables to anon/authenticated by default.)
-- -----------------------------------------------------------------------------
revoke all on table
  public.profiles,
  public.platform_admins,
  public.organizations,
  public.organization_members,
  public.organization_invitations
from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (full_name) on table public.profiles to authenticated;

grant select on table public.platform_admins to authenticated;

grant select on table public.organizations to authenticated;
grant update (name, vat_number, sector, size_class, nis2_classification, classification_basis)
  on table public.organizations to authenticated;

grant select, delete on table public.organization_members to authenticated;
grant update (role) on table public.organization_members to authenticated;

grant select on table public.organization_invitations to authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.platform_admins enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invitations enable row level security;

-- profiles: yourself and people you share an organisation with.
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select private.shares_org_with(id)));

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- platform_admins: a user can only see whether *they* are one.
create policy platform_admins_select_self on public.platform_admins
  for select to authenticated
  using (user_id = (select auth.uid()));

-- organizations: members read; platform admins may list for support;
-- only org_admin updates. Creation goes through create_organization().
create policy organizations_select on public.organizations
  for select to authenticated
  using ((select private.is_org_member(id)) or (select private.is_platform_admin()));

create policy organizations_update_admin on public.organizations
  for update to authenticated
  using ((select private.has_org_role(id, array['org_admin'])))
  with check ((select private.has_org_role(id, array['org_admin'])));

-- organization_members: members see the member list of their organisations.
create policy organization_members_select on public.organization_members
  for select to authenticated
  using ((select private.is_org_member(organization_id)));

create policy organization_members_update_admin on public.organization_members
  for update to authenticated
  using ((select private.has_org_role(organization_id, array['org_admin'])))
  with check ((select private.has_org_role(organization_id, array['org_admin'])));

-- org_admin removes anyone; any member may leave (remove themselves).
create policy organization_members_delete on public.organization_members
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.has_org_role(organization_id, array['org_admin']))
  );

-- organization_invitations: org_admin only; writes via RPC.
create policy organization_invitations_select_admin on public.organization_invitations
  for select to authenticated
  using ((select private.has_org_role(organization_id, array['org_admin'])));
