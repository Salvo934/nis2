-- =============================================================================
-- Deleting an assessment (e.g. created by mistake)
--
-- * Only org_admin may delete (RLS). Security managers can still archive.
-- * Answers are deleted with the assessment (existing ON DELETE CASCADE).
-- * Remediation tasks linked to its answers are KEPT and only detached, so no
--   planned work is lost.
-- * The deletion is audited with title and counts.
-- =============================================================================

grant delete on table public.assessments to authenticated;

create policy assessments_delete_admin on public.assessments
  for delete to authenticated
  using ((select private.has_org_role(organization_id, array['org_admin'])));

create or replace function private.before_assessment_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_answers  integer;
  v_detached integer;
begin
  -- When the whole organisation is being deleted (cascade), its tasks are being
  -- deleted too: touching them here would conflict with the cascade.
  if not exists (select 1 from public.organizations where id = old.organization_id) then
    return old;
  end if;

  select count(*) into v_answers from public.assessment_answers where assessment_id = old.id;

  update public.remediation_tasks t
     set assessment_answer_id = null
    from public.assessment_answers a
   where a.assessment_id = old.id
     and t.assessment_answer_id = a.id;
  get diagnostics v_detached = row_count;

  perform private.log_audit_event(old.organization_id, 'assessment.deleted', 'assessment', old.id,
    jsonb_build_object('title', old.title, 'status', old.status,
                       'answers_deleted', v_answers, 'tasks_detached', v_detached));
  return old;
end;
$$;

create trigger assessments_before_delete
  before delete on public.assessments
  for each row execute function private.before_assessment_delete();
