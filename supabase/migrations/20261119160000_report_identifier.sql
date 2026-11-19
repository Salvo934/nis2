-- =============================================================================
-- Report identifier
-- log_report_generated now returns the id of the audit entry it writes, so
-- every PDF carries an identifier that can be traced back to the audit log
-- (who generated it, when, on which assessment and catalogue version).
-- The return type changes, so the function is dropped and recreated.
-- =============================================================================

drop function if exists public.log_report_generated(uuid);

create function public.log_report_generated(p_assessment uuid, p_format text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := private.require_uid();
  v_org   uuid;
  v_title text;
  v_label text;
  v_id    uuid;
begin
  select a.organization_id, a.title, v.version_label
    into v_org, v_title, v_label
    from public.assessments a
    join public.regulatory_framework_versions v on v.id = a.framework_version_id
   where a.id = p_assessment;

  -- Same answer for "does not exist" and "belongs to another tenant".
  if v_org is null or not private.is_org_member(v_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  perform private.check_rate_limit('report:' || v_uid, 60, interval '1 hour');

  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (v_org, v_uid, 'report.generated', 'assessment', p_assessment,
          jsonb_build_object('title', v_title, 'catalogue_version', v_label,
                             'report_format', left(coalesce(p_format, 'unknown'), 20)))
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.log_report_generated(uuid, text) from public, anon;
grant execute on function public.log_report_generated(uuid, text) to authenticated;
