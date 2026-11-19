-- =============================================================================
-- Audit of report generation
-- Reports are built in the browser from data the user can already read (RLS);
-- this RPC records who generated which report. Any member may generate one.
-- =============================================================================

create or replace function public.log_report_generated(p_assessment uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := private.require_uid();
  v_org   uuid;
  v_title text;
  v_label text;
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

  perform private.log_audit_event(v_org, 'report.generated', 'assessment', p_assessment,
    jsonb_build_object('title', v_title, 'catalogue_version', v_label));
end;
$$;

revoke execute on function public.log_report_generated(uuid) from public, anon;
grant execute on function public.log_report_generated(uuid) to authenticated;
