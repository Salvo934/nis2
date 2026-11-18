-- =============================================================================
-- M3–M5 · Regulatory catalogue, assessments, gap analysis, remediation tasks
--
-- * The catalogue is global, versioned and read-only for users; a published
--   version is immutable (new content = new version).
-- * Tenant tables carry organization_id and use COMPOSITE foreign keys, so the
--   database itself refuses cross-tenant links (anti-IDOR):
--     answer  -> (assessment, organization, catalogue version)
--     answer  -> (requirement, catalogue version)
--     task    -> (answer, organization)
-- * Owners / assignees must be members of the same organisation (trigger).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Catalogue
-- -----------------------------------------------------------------------------
create table public.regulatory_frameworks (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique check (code ~ '^[A-Z0-9_-]{2,30}$'),
  name              text not null check (char_length(name) between 2 and 200),
  issuing_authority text check (issuing_authority is null or char_length(issuing_authority) <= 300),
  created_at        timestamptz not null default now()
);

create table public.regulatory_framework_versions (
  id                  uuid primary key default gen_random_uuid(),
  framework_id        uuid not null references public.regulatory_frameworks (id) on delete restrict,
  version_label       text not null check (char_length(version_label) between 1 and 60),
  source_title        text not null check (char_length(source_title) <= 500),
  source_url          text check (source_url is null or source_url ~ '^https?://'),
  source_published_at date,
  scope_note          text check (scope_note is null or char_length(scope_note) <= 2000),
  dataset_checksum    text not null check (dataset_checksum ~ '^[0-9a-f]{64}$'),
  status              text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  imported_at         timestamptz not null default now(),
  constraint regulatory_framework_versions_unique unique (framework_id, version_label)
);

create table public.requirements (
  id                   uuid primary key default gen_random_uuid(),
  framework_version_id uuid not null references public.regulatory_framework_versions (id) on delete restrict,
  code                 text not null check (code ~ '^[A-Za-z0-9][A-Za-z0-9.\-]{1,40}$'),
  category_code        text not null check (category_code ~ '^[A-Z0-9_-]{1,20}$'),
  category_name        text not null check (char_length(category_name) <= 200),
  title                text not null check (char_length(title) between 3 and 300),
  description          text not null check (char_length(description) between 10 and 10000),
  source_reference     text not null check (char_length(source_reference) <= 300),
  sort_order           integer not null default 0,
  constraint requirements_code_unique unique (framework_version_id, code),
  constraint requirements_id_version_unique unique (id, framework_version_id)
);

create index requirements_version_sort_idx on public.requirements (framework_version_id, sort_order);

-- Published content is immutable; the only allowed change is published -> retired.
create or replace function private.protect_published_catalogue()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  if tg_table_name = 'regulatory_framework_versions' then
    if old.status = 'draft' then
      return coalesce(new, old);
    end if;
    if tg_op = 'UPDATE'
       and old.status = 'published' and new.status = 'retired'
       and (to_jsonb(new) - 'status') = (to_jsonb(old) - 'status') then
      return new;
    end if;
    raise exception 'catalogue_version_immutable' using errcode = 'P0001';
  end if;

  select status into v_status
    from public.regulatory_framework_versions
   where id = coalesce(old.framework_version_id, new.framework_version_id);
  if v_status is distinct from 'draft' then
    raise exception 'catalogue_version_immutable' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and new.framework_version_id is distinct from old.framework_version_id then
    select status into v_status from public.regulatory_framework_versions where id = new.framework_version_id;
    if v_status is distinct from 'draft' then
      raise exception 'catalogue_version_immutable' using errcode = 'P0001';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger regulatory_framework_versions_protect
  before update or delete on public.regulatory_framework_versions
  for each row execute function private.protect_published_catalogue();

create trigger requirements_protect_update_delete
  before update or delete on public.requirements
  for each row execute function private.protect_published_catalogue();

create or replace function private.protect_requirement_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select status from public.regulatory_framework_versions where id = new.framework_version_id) <> 'draft' then
    raise exception 'catalogue_version_immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger requirements_protect_insert
  before insert on public.requirements
  for each row execute function private.protect_requirement_insert();

revoke all on table public.regulatory_frameworks, public.regulatory_framework_versions, public.requirements
  from anon, authenticated;
grant select on table public.regulatory_frameworks, public.regulatory_framework_versions, public.requirements
  to authenticated;

alter table public.regulatory_frameworks enable row level security;
alter table public.regulatory_framework_versions enable row level security;
alter table public.requirements enable row level security;

create policy regulatory_frameworks_select on public.regulatory_frameworks
  for select to authenticated using (true);

create policy regulatory_framework_versions_select on public.regulatory_framework_versions
  for select to authenticated using (status in ('published', 'retired'));

create policy requirements_select on public.requirements
  for select to authenticated
  using (exists (
    select 1 from public.regulatory_framework_versions v
    where v.id = framework_version_id and v.status in ('published', 'retired')
  ));

-- -----------------------------------------------------------------------------
-- Assessments
-- -----------------------------------------------------------------------------
create table public.assessments (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations (id) on delete cascade,
  framework_version_id uuid not null references public.regulatory_framework_versions (id) on delete restrict,
  title                text not null check (char_length(btrim(title)) between 3 and 200),
  status               text not null default 'draft' check (status in ('draft', 'in_progress', 'completed', 'archived')),
  created_by           uuid references public.profiles (id) on delete set null,
  completed_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint assessments_tenant_unique unique (id, organization_id),
  constraint assessments_tenant_version_unique unique (id, organization_id, framework_version_id),
  constraint assessments_completed_at check ((status = 'completed') = (completed_at is not null))
);

create index assessments_org_idx on public.assessments (organization_id, created_at desc);

create trigger assessments_set_updated_at
  before update on public.assessments
  for each row execute function private.set_updated_at();

create or replace function private.assessment_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    new.completed_at := now();
  elsif new.status <> 'completed' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger assessments_completion
  before update of status on public.assessments
  for each row execute function private.assessment_completion();

-- -----------------------------------------------------------------------------
-- Assessment answers (one row per requirement, created with the assessment)
-- -----------------------------------------------------------------------------
create table public.assessment_answers (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null,
  assessment_id        uuid not null,
  framework_version_id uuid not null,
  requirement_id       uuid not null,
  status               text not null default 'not_assessed'
                         check (status in ('not_assessed', 'implemented', 'partial', 'not_implemented', 'not_applicable')),
  justification        text check (justification is null or char_length(justification) <= 4000),
  owner_id             uuid references public.profiles (id) on delete set null,
  gap_severity         text check (gap_severity in ('low', 'medium', 'high', 'critical')),
  assessed_at          timestamptz,
  assessed_by          uuid references public.profiles (id) on delete set null,
  updated_at           timestamptz not null default now(),
  constraint assessment_answers_assessment_fk foreign key (assessment_id, organization_id, framework_version_id)
    references public.assessments (id, organization_id, framework_version_id) on delete cascade,
  constraint assessment_answers_requirement_fk foreign key (requirement_id, framework_version_id)
    references public.requirements (id, framework_version_id) on delete restrict,
  constraint assessment_answers_unique unique (assessment_id, requirement_id),
  constraint assessment_answers_tenant_unique unique (id, organization_id),
  -- "Partial" and "not applicable" must be explained.
  constraint assessment_answers_justification_required check (
    status not in ('partial', 'not_applicable') or char_length(btrim(coalesce(justification, ''))) >= 5
  ),
  -- Severity only makes sense for gaps.
  constraint assessment_answers_severity_only_for_gaps check (
    gap_severity is null or status in ('partial', 'not_implemented')
  )
);

create index assessment_answers_assessment_idx on public.assessment_answers (assessment_id);
create index assessment_answers_org_status_idx on public.assessment_answers (organization_id, status);
create index assessment_answers_owner_idx on public.assessment_answers (owner_id);

create or replace function private.assessment_answer_tracking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.status not in ('partial', 'not_implemented') then
    new.gap_severity := null;
  end if;
  if new.status is distinct from old.status or new.justification is distinct from old.justification then
    new.assessed_at := now();
    new.assessed_by := (select auth.uid());
  end if;
  -- First answer moves a draft assessment to "in progress".
  update public.assessments
     set status = 'in_progress'
   where id = new.assessment_id and status = 'draft' and new.status <> 'not_assessed';
  return new;
end;
$$;

create trigger assessment_answers_tracking
  before update on public.assessment_answers
  for each row execute function private.assessment_answer_tracking();

-- -----------------------------------------------------------------------------
-- Remediation tasks
-- -----------------------------------------------------------------------------
create table public.remediation_tasks (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations (id) on delete cascade,
  assessment_answer_id uuid,
  title                text not null check (char_length(btrim(title)) between 3 and 200),
  description          text check (description is null or char_length(description) <= 4000),
  priority             text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  status               text not null default 'todo' check (status in ('todo', 'in_progress', 'blocked', 'done', 'cancelled')),
  assignee_id          uuid references public.profiles (id) on delete set null,
  due_date             date,
  completed_at         timestamptz,
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint remediation_tasks_answer_fk foreign key (assessment_answer_id, organization_id)
    references public.assessment_answers (id, organization_id) on delete cascade,
  constraint remediation_tasks_completed_at check ((status = 'done') = (completed_at is not null))
);

create index remediation_tasks_org_status_idx on public.remediation_tasks (organization_id, status);
create index remediation_tasks_answer_idx on public.remediation_tasks (assessment_answer_id);
create index remediation_tasks_due_idx on public.remediation_tasks (organization_id, due_date) where status not in ('done', 'cancelled');

create or replace function private.remediation_task_tracking()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
  else
    new.updated_at := now();
    new.created_by := old.created_by;
  end if;
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger remediation_tasks_tracking
  before insert or update on public.remediation_tasks
  for each row execute function private.remediation_task_tracking();

-- -----------------------------------------------------------------------------
-- People referenced by answers/tasks must belong to the organisation;
-- removing a member clears their assignments in that organisation.
-- -----------------------------------------------------------------------------
create or replace function private.ensure_people_are_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Read the column generically: the same trigger serves two tables.
  v_person uuid := (to_jsonb(new) ->> case tg_table_name when 'assessment_answers' then 'owner_id' else 'assignee_id' end)::uuid;
begin
  if v_person is not null and not exists (
    select 1 from public.organization_members
    where organization_id = new.organization_id and user_id = v_person
  ) then
    raise exception 'assignee_not_member' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger assessment_answers_owner_member
  before insert or update of owner_id on public.assessment_answers
  for each row execute function private.ensure_people_are_members();

create trigger remediation_tasks_assignee_member
  before insert or update of assignee_id on public.remediation_tasks
  for each row execute function private.ensure_people_are_members();

create or replace function private.clear_assignments_of_removed_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.assessment_answers set owner_id = null
   where organization_id = old.organization_id and owner_id = old.user_id;
  update public.remediation_tasks set assignee_id = null
   where organization_id = old.organization_id and assignee_id = old.user_id;
  return old;
end;
$$;

create trigger organization_members_clear_assignments
  after delete on public.organization_members
  for each row execute function private.clear_assignments_of_removed_member();

-- -----------------------------------------------------------------------------
-- Privileges + RLS
-- -----------------------------------------------------------------------------
revoke all on table public.assessments, public.assessment_answers, public.remediation_tasks from anon, authenticated;

grant select on table public.assessments to authenticated;
grant update (title, status) on table public.assessments to authenticated;

grant select on table public.assessment_answers to authenticated;
grant update (status, justification, owner_id, gap_severity) on table public.assessment_answers to authenticated;

grant select, delete on table public.remediation_tasks to authenticated;
grant insert (organization_id, assessment_answer_id, title, description, priority, status, assignee_id, due_date)
  on table public.remediation_tasks to authenticated;
grant update (title, description, priority, status, assignee_id, due_date)
  on table public.remediation_tasks to authenticated;

alter table public.assessments enable row level security;
alter table public.assessment_answers enable row level security;
alter table public.remediation_tasks enable row level security;

create policy assessments_select on public.assessments
  for select to authenticated using ((select private.is_org_member(organization_id)));
create policy assessments_update on public.assessments
  for update to authenticated
  using ((select private.has_org_role(organization_id, array['org_admin', 'security_manager'])))
  with check ((select private.has_org_role(organization_id, array['org_admin', 'security_manager'])));

create policy assessment_answers_select on public.assessment_answers
  for select to authenticated using ((select private.is_org_member(organization_id)));
create policy assessment_answers_update on public.assessment_answers
  for update to authenticated
  using ((select private.has_org_role(organization_id, array['org_admin', 'security_manager'])))
  with check ((select private.has_org_role(organization_id, array['org_admin', 'security_manager'])));

create policy remediation_tasks_select on public.remediation_tasks
  for select to authenticated using ((select private.is_org_member(organization_id)));
create policy remediation_tasks_insert on public.remediation_tasks
  for insert to authenticated
  with check ((select private.has_org_role(organization_id, array['org_admin', 'security_manager'])));
create policy remediation_tasks_update on public.remediation_tasks
  for update to authenticated
  using ((select private.has_org_role(organization_id, array['org_admin', 'security_manager'])))
  with check ((select private.has_org_role(organization_id, array['org_admin', 'security_manager'])));
create policy remediation_tasks_delete on public.remediation_tasks
  for delete to authenticated
  using ((select private.has_org_role(organization_id, array['org_admin', 'security_manager'])));

-- -----------------------------------------------------------------------------
-- create_assessment: creates the assessment and one answer per requirement.
-- -----------------------------------------------------------------------------
create or replace function public.create_assessment(p_org uuid, p_framework_version uuid, p_title text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_id  uuid;
begin
  if not private.has_org_role(p_org, array['org_admin', 'security_manager']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform private.check_rate_limit('create_assessment:' || v_uid, 20, interval '1 hour');

  if not exists (select 1 from public.regulatory_framework_versions where id = p_framework_version and status = 'published') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  begin
    insert into public.assessments (organization_id, framework_version_id, title, created_by)
    values (p_org, p_framework_version, btrim(p_title), v_uid)
    returning id into v_id;
  exception
    when check_violation or not_null_violation then
      raise exception 'invalid_input' using errcode = '22023';
  end;

  insert into public.assessment_answers (organization_id, assessment_id, framework_version_id, requirement_id)
  select p_org, v_id, p_framework_version, r.id
    from public.requirements r
   where r.framework_version_id = p_framework_version;

  return v_id;
end;
$$;

revoke execute on function public.create_assessment(uuid, uuid, text) from public, anon;
grant execute on function public.create_assessment(uuid, uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Audit
-- -----------------------------------------------------------------------------
create or replace function private.audit_assessments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.log_audit_event(new.organization_id, 'assessment.created', 'assessment', new.id,
      jsonb_build_object('title', new.title));
  elsif new.status is distinct from old.status then
    perform private.log_audit_event(new.organization_id, 'assessment.status_changed', 'assessment', new.id,
      jsonb_build_object('title', new.title, 'from', old.status, 'to', new.status));
  end if;
  return null;
end;
$$;

create trigger assessments_audit
  after insert or update on public.assessments
  for each row execute function private.audit_assessments();

create or replace function private.audit_assessment_answers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if new.status is distinct from old.status or new.gap_severity is distinct from old.gap_severity then
    select code into v_code from public.requirements where id = new.requirement_id;
    perform private.log_audit_event(new.organization_id, 'answer.updated', 'assessment_answer', new.id,
      jsonb_build_object('requirement', v_code, 'from', old.status, 'to', new.status,
                         'gap_severity', new.gap_severity, 'assessment_id', new.assessment_id));
  end if;
  return null;
end;
$$;

create trigger assessment_answers_audit
  after update on public.assessment_answers
  for each row execute function private.audit_assessment_answers();

create or replace function private.audit_remediation_tasks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.log_audit_event(new.organization_id, 'task.created', 'remediation_task', new.id,
      jsonb_build_object('title', new.title, 'priority', new.priority));
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      perform private.log_audit_event(new.organization_id, 'task.status_changed', 'remediation_task', new.id,
        jsonb_build_object('title', new.title, 'from', old.status, 'to', new.status));
    end if;
  elsif exists (select 1 from public.organizations where id = old.organization_id) then
    perform private.log_audit_event(old.organization_id, 'task.deleted', 'remediation_task', old.id,
      jsonb_build_object('title', old.title));
  end if;
  return null;
end;
$$;

create trigger remediation_tasks_audit
  after insert or update or delete on public.remediation_tasks
  for each row execute function private.audit_remediation_tasks();
