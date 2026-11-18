-- =============================================================================
-- Automatic gap resolution from remediation tasks
--
-- When every task linked to a gap (answer "partial" / "not_implemented") is
-- closed — at least one "done", the rest "done" or "cancelled" — the answer
-- becomes "implemented". The previous assessment (status, justification,
-- severity) is saved and restored if a linked task is reopened or a new open
-- task is linked. A later manual edit of the answer always wins.
-- Archived assessments are never changed. Every automatic change is audited.
-- =============================================================================

alter table public.assessment_answers
  add column resolved_by_tasks boolean not null default false,
  add column pre_resolution jsonb check (pre_resolution is null or jsonb_typeof(pre_resolution) = 'object');

-- Users cannot write these columns directly (only status, justification,
-- owner_id and gap_severity are granted), so the flag can be trusted.

-- -----------------------------------------------------------------------------
-- A manual change of status/justification clears the automatic resolution.
-- The sync function marks its own updates with a transaction-local setting.
-- -----------------------------------------------------------------------------
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
    if coalesce(current_setting('nis2.auto_resolution', true), '') <> 'on' then
      new.resolved_by_tasks := false;
      new.pre_resolution := null;
    end if;
  end if;
  -- First answer moves a draft assessment to "in progress".
  update public.assessments
     set status = 'in_progress'
   where id = new.assessment_id and status = 'draft' and new.status <> 'not_assessed';
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Recompute one answer from its linked tasks.
-- -----------------------------------------------------------------------------
create or replace function private.sync_answer_from_tasks(p_answer uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_answer  public.assessment_answers;
  v_archived boolean;
  v_open    integer;
  v_done    integer;
  v_titles  text;
  v_code    text;
begin
  if p_answer is null then
    return;
  end if;

  select a.* into v_answer from public.assessment_answers a where a.id = p_answer for update;
  if not found then
    return; -- answer deleted (e.g. organisation cascade)
  end if;

  select s.status = 'archived' into v_archived from public.assessments s where s.id = v_answer.assessment_id;
  if v_archived then
    return;
  end if;

  select count(*) filter (where t.status in ('todo', 'in_progress', 'blocked')),
         count(*) filter (where t.status = 'done'),
         string_agg(t.title, '; ' order by t.completed_at nulls last, t.title) filter (where t.status = 'done')
    into v_open, v_done, v_titles
    from public.remediation_tasks t
   where t.assessment_answer_id = p_answer;

  select code into v_code from public.requirements where id = v_answer.requirement_id;

  perform set_config('nis2.auto_resolution', 'on', true);

  if v_open = 0 and v_done > 0 and v_answer.status in ('partial', 'not_implemented') then
    update public.assessment_answers
       set pre_resolution = jsonb_build_object(
             'status', status, 'justification', justification, 'gap_severity', gap_severity),
           resolved_by_tasks = true,
           status = 'implemented',
           justification = left(
             coalesce(nullif(btrim(justification), '') || E'\n\n', '')
             || 'Aggiornato automaticamente il ' || to_char(now() at time zone 'Europe/Rome', 'DD/MM/YYYY')
             || ': attività correttive completate (' || v_titles || ').',
             4000)
     where id = p_answer;

    perform private.log_audit_event(v_answer.organization_id, 'answer.auto_resolved', 'assessment_answer', p_answer,
      jsonb_build_object('requirement', v_code, 'from', v_answer.status, 'to', 'implemented',
                         'assessment_id', v_answer.assessment_id));

  elsif v_open > 0 and v_answer.resolved_by_tasks and v_answer.pre_resolution is not null then
    update public.assessment_answers
       set status = v_answer.pre_resolution ->> 'status',
           justification = v_answer.pre_resolution ->> 'justification',
           gap_severity = v_answer.pre_resolution ->> 'gap_severity',
           resolved_by_tasks = false,
           pre_resolution = null
     where id = p_answer;

    perform private.log_audit_event(v_answer.organization_id, 'answer.auto_reopened', 'assessment_answer', p_answer,
      jsonb_build_object('requirement', v_code, 'from', 'implemented', 'to', v_answer.pre_resolution ->> 'status',
                         'assessment_id', v_answer.assessment_id));
  end if;

  perform set_config('nis2.auto_resolution', 'off', true);
end;
$$;

create or replace function private.remediation_tasks_sync_answers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform private.sync_answer_from_tasks(new.assessment_answer_id);
  end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.assessment_answer_id is distinct from new.assessment_answer_id) then
    perform private.sync_answer_from_tasks(old.assessment_answer_id);
  end if;
  return null;
end;
$$;

create trigger remediation_tasks_sync_answers
  after insert or update of status, assessment_answer_id or delete on public.remediation_tasks
  for each row execute function private.remediation_tasks_sync_answers();

-- -----------------------------------------------------------------------------
-- Manual answer changes stay audited as before; automatic ones have their own
-- events (answer.auto_resolved / answer.auto_reopened), so skip duplicates here.
-- -----------------------------------------------------------------------------
create or replace function private.audit_assessment_answers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if coalesce(current_setting('nis2.auto_resolution', true), '') = 'on' then
    return null;
  end if;
  if new.status is distinct from old.status or new.gap_severity is distinct from old.gap_severity then
    select code into v_code from public.requirements where id = new.requirement_id;
    perform private.log_audit_event(new.organization_id, 'answer.updated', 'assessment_answer', new.id,
      jsonb_build_object('requirement', v_code, 'from', old.status, 'to', new.status,
                         'gap_severity', new.gap_severity, 'assessment_id', new.assessment_id));
  end if;
  return null;
end;
$$;
