-- =============================================================================
-- Demo mode ("Prova la demo")
--
-- Every visitor gets an anonymous Supabase session and THEIR OWN copy of a
-- fictitious company (Rossi Logistica S.r.l.): visitors never see or change
-- each other's data, and no shared password exists.
--
-- * create_demo_organization(): anonymous sessions only; idempotent (returns
--   the visitor's existing demo organisation); rate limited.
-- * The dataset is generated from data/demo/rossi-logistica.json by
--   scripts/demo/build-migration.mjs (the same file feeds the sample PDF).
-- * purge_demo_data(): removes demo organisations and anonymous users older
--   than 7 days; scheduled daily with pg_cron when the extension is available.
--
-- GENERATED FILE: edit the JSON or scripts/demo/migration.template.sql.
-- =============================================================================

alter table public.organizations add column is_demo boolean not null default false;
-- No column grant: clients can read organisations (table-level select) but
-- can never set or clear the flag.

create or replace function private.is_anonymous()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;

create or replace function private.demo_dataset()
returns jsonb
language sql
immutable
set search_path = ''
as $fn$
  select $demo${"organization":{"name":"Rossi Logistica S.r.l.","sector":"transport","size_class":"medium","nis2_classification":"important","classification_basis":"Dato dimostrativo: classificazione fittizia inserita per la demo."},"assessment":{"title":"Assessment misure di base ACN – demo","catalogue_version":"ACN-379907-2025-all1","status":"in_progress"},"answers":[{"code":"GV.OC-04.1","status":"implemented","justification":"Elenco dei sistemi rilevanti (TMS, WMS, ERP, posta, rete di magazzino) mantenuto nel registro IT e aggiornato a ogni modifica."},{"code":"GV.RM-03.1","status":"partial","gap_severity":"medium","justification":"I rischi informatici sono discussi nel comitato operativo, ma non sono ancora integrati nel processo aziendale di gestione dei rischi."},{"code":"GV.RR-02.1","status":"implemented","justification":"Organigramma della sicurezza approvato dal CdA a marzo e pubblicato sulla intranet."},{"code":"GV.RR-02.2","status":"implemented","justification":"Elenco del personale con ruoli di sicurezza mantenuto dall'ufficio del personale."},{"code":"GV.RR-02.3","status":"partial","gap_severity":"high","justification":"Il referente CSIRT è stato nominato, il sostituto non ancora."},{"code":"GV.RR-02.4","status":"not_implemented","gap_severity":"medium","justification":"Non è previsto un riesame periodico di ruoli e responsabilità."},{"code":"GV.RR-04.1","status":"partial","gap_severity":"medium","justification":"Verifiche preliminari svolte solo per il personale IT interno, non per i consulenti esterni."},{"code":"GV.RR-04.2","status":"implemented","justification":"Amministratori di sistema nominati per iscritto con valutazione dei requisiti."},{"code":"GV.RR-04.3","status":"not_implemented","gap_severity":"medium","justification":"La procedura per la gestione degli amministratori di sistema non è documentata."},{"code":"GV.PO-01.1","status":"partial","gap_severity":"high","justification":"Esistono politiche per accessi e backup; mancano quelle per fornitori e gestione degli incidenti."},{"code":"GV.PO-01.2","status":"partial","gap_severity":"medium","justification":"Le politiche esistenti non coprono ancora tutti gli ambiti richiesti."},{"code":"GV.PO-01.3","status":"not_implemented","gap_severity":"high","justification":"Le politiche sono state redatte dall'IT ma non ancora approvate dal CdA."},{"code":"GV.PO-02.1","status":"not_implemented","gap_severity":"low","justification":"Nessun riesame periodico delle politiche pianificato."},{"code":"GV.PO-02.2","status":"not_implemented","gap_severity":"low","justification":"Il riesame non è ancora previsto, quindi non è prevista nemmeno la verifica di conformità."},{"code":"GV.SC-01.1","status":"partial","gap_severity":"high","justification":"Requisiti di sicurezza valutati solo per il fornitore del TMS in cloud."},{"code":"GV.SC-02.1","status":"implemented","justification":"Referente per i fornitori ICT individuato nell'ufficio acquisti."},{"code":"GV.SC-02.2","status":"implemented","justification":"Il referente è incluso nell'elenco del personale con ruoli di sicurezza."},{"code":"GV.SC-04.1","status":"partial","gap_severity":"medium","justification":"Inventario dei fornitori presente in contabilità, senza indicazione dell'impatto sulla sicurezza."},{"code":"GV.SC-05.1","status":"not_implemented","gap_severity":"high","justification":"I contratti in essere non contengono requisiti di sicurezza."},{"code":"GV.SC-07.1","status":"not_implemented","gap_severity":"critical","justification":"Il rischio legato ai fornitori (TMS in cloud, telematica dei mezzi, corrieri partner) non è mai stato valutato."},{"code":"GV.SC-07.2","status":"not_implemented","gap_severity":"high","justification":"Nessuna verifica periodica delle forniture."},{"code":"ID.AM-01.1","status":"implemented","justification":"Inventario hardware gestito con lo strumento di asset management e verificato ogni trimestre."},{"code":"ID.AM-02.1","status":"implemented","justification":"Inventario di software e servizi mantenuto nello stesso strumento."},{"code":"ID.AM-04.1","status":"partial","gap_severity":"medium","justification":"I servizi cloud sono censiti; mancano i servizi gestiti dai corrieri partner."},{"code":"ID.RA-01.1","status":"partial","gap_severity":"medium","justification":"Le vulnerabilità sono identificate solo con le scansioni annuali del fornitore."},{"code":"ID.RA-05.1","status":"partial","gap_severity":"high","justification":"Valutazione del rischio svolta nel 2024 limitata all'ERP."},{"code":"ID.RA-05.2","status":"not_implemented","gap_severity":"critical","justification":"La valutazione del rischio non viene ripetuta a intervalli pianificati."},{"code":"ID.RA-05.3","status":"not_implemented","gap_severity":"high","justification":"La valutazione esistente non è stata approvata dal CdA."},{"code":"ID.RA-06.1","status":"not_implemented","gap_severity":"critical","justification":"Non esiste un piano di trattamento dei rischi."},{"code":"ID.RA-06.2","status":"implemented","justification":"Le eccezioni ai requisiti sono registrate dall'IT con motivazione e misure compensative."},{"code":"ID.RA-06.3","status":"not_implemented","gap_severity":"high","justification":"In assenza del piano non c'è un'approvazione dei rischi residui."},{"code":"ID.RA-08.1","status":"implemented","justification":"L'IT è iscritto ai canali di comunicazione del CSIRT Italia e li consulta ogni giorno."},{"code":"ID.RA-08.2","status":"partial","gap_severity":"medium","justification":"Le vulnerabilità critiche sono gestite; per le altre non c'è una priorità definita."},{"code":"ID.RA-08.3","status":"partial","gap_severity":"medium","justification":"Piano di gestione delle vulnerabilità in bozza."},{"code":"ID.RA-08.4","status":"not_implemented","gap_severity":"low","justification":"Il piano non è ancora stato sottoposto al CdA."},{"code":"ID.IM-01.1","status":"not_implemented","gap_severity":"medium","justification":"Non esiste ancora un piano di miglioramento collegato al riesame."},{"code":"ID.IM-01.2","status":"partial","gap_severity":"low","justification":"Il CdA riceve aggiornamenti verbali, senza una relazione periodica scritta."},{"code":"ID.IM-04.1","status":"partial","gap_severity":"high","justification":"Piano di continuità operativa presente solo per il magazzino principale."},{"code":"ID.IM-04.2","status":"partial","gap_severity":"high","justification":"Procedure di backup documentate, senza test di ripristino periodici."},{"code":"ID.IM-04.3","status":"not_implemented","gap_severity":"high","justification":"Non esiste un piano di ripristino in caso di disastro."},{"code":"ID.IM-04.4","status":"not_implemented","gap_severity":"medium","justification":"I piani esistenti non sono approvati dal CdA."},{"code":"ID.IM-04.5","status":"not_implemented","gap_severity":"low","justification":"Nessun riesame periodico dei piani."},{"code":"PR.AA-01.1","status":"implemented","justification":"Utenze nominative gestite in Active Directory, comprese quelle di servizio."},{"code":"PR.AA-01.2","status":"implemented","justification":"Politica delle password applicata tramite i criteri di dominio."},{"code":"PR.AA-01.3","status":"partial","gap_severity":"medium","justification":"La verifica delle utenze avviene solo quando un dipendente lascia l'azienda."},{"code":"PR.AA-01.4","status":"implemented","justification":"Procedura di gestione delle utenze documentata e approvata."}],"tasks":[{"code":"GV.SC-07.1","title":"Valutare il rischio dei fornitori critici (TMS, telematica, corrieri)","description":"Questionario di sicurezza ai fornitori critici e valutazione dei risultati.","priority":"critical","status":"in_progress","due_in_days":-8},{"code":"ID.RA-05.2","title":"Pianificare ed eseguire la valutazione del rischio annuale","description":"Estendere la valutazione del 2024 a TMS, WMS e rete di magazzino.","priority":"critical","status":"in_progress","due_in_days":-3},{"code":"ID.RA-06.1","title":"Redigere il piano di trattamento dei rischi","description":null,"priority":"critical","status":"todo","due_in_days":30},{"code":"GV.PO-01.3","title":"Far approvare le politiche di sicurezza dal CdA","description":"Portare le politiche in bozza al prossimo consiglio di amministrazione.","priority":"high","status":"in_progress","due_in_days":20},{"code":"GV.SC-05.1","title":"Inserire clausole di sicurezza nei contratti di fornitura","description":"Partire dai rinnovi in scadenza nei prossimi sei mesi.","priority":"high","status":"todo","due_in_days":60},{"code":"ID.IM-04.3","title":"Definire il piano di ripristino in caso di disastro","description":null,"priority":"high","status":"todo","due_in_days":45},{"code":"ID.RA-08.4","title":"Sottoporre il piano di gestione delle vulnerabilità al CdA","description":"In attesa della versione definitiva del piano.","priority":"medium","status":"blocked","due_in_days":15},{"code":"GV.RR-02.4","title":"Pianificare il riesame periodico di ruoli e responsabilità","description":null,"priority":"medium","status":"todo","due_in_days":50},{"code":"PR.AA-01.3","title":"Avviare la revisione trimestrale delle utenze","description":null,"priority":"low","status":"todo","due_in_days":25},{"code":"GV.RR-04.3","title":"Documentare la procedura di gestione degli amministratori di sistema","description":"Procedura redatta e pubblicata sulla intranet.","priority":"medium","status":"done","due_in_days":-5}]}$demo$::jsonb;
$fn$;

create or replace function public.create_demo_organization()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := private.require_uid();
  v_data       jsonb := private.demo_dataset();
  v_today      date := (now() at time zone 'Europe/Rome')::date;
  v_org        uuid;
  v_version    uuid;
  v_assessment uuid;
  v_answer     uuid;
  v_item       jsonb;
begin
  -- Demo data is only for anonymous visitors, never mixed into real accounts.
  if not private.is_anonymous() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select o.id into v_org
    from public.organizations o
    join public.organization_members m on m.organization_id = o.id and m.user_id = v_uid
   where o.is_demo
   limit 1;
  if v_org is not null then
    return v_org;
  end if;

  perform private.check_rate_limit('demo:' || v_uid, 3, interval '1 hour');

  select v.id into v_version
    from public.regulatory_framework_versions v
   where v.version_label = v_data #>> '{assessment,catalogue_version}' and v.status = 'published';
  if v_version is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  update public.profiles set full_name = 'Visitatore demo' where id = v_uid and full_name is null;

  insert into public.organizations (name, sector, size_class, nis2_classification, classification_basis,
                                    created_by, is_demo)
  values (v_data #>> '{organization,name}', v_data #>> '{organization,sector}',
          v_data #>> '{organization,size_class}', v_data #>> '{organization,nis2_classification}',
          v_data #>> '{organization,classification_basis}', v_uid, true)
  returning id into v_org;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org, v_uid, 'org_admin');

  v_assessment := public.create_assessment(v_org, v_version, v_data #>> '{assessment,title}');

  for v_item in select * from jsonb_array_elements(v_data -> 'answers') loop
    update public.assessment_answers aa
       set status = v_item ->> 'status',
           justification = v_item ->> 'justification',
           owner_id = v_uid,
           gap_severity = v_item ->> 'gap_severity'
      from public.requirements r
     where aa.assessment_id = v_assessment
       and r.id = aa.requirement_id
       and r.code = v_item ->> 'code';
    if not found then
      raise exception 'demo dataset: unknown requirement %', v_item ->> 'code';
    end if;
  end loop;

  -- Tasks last: completing one closes its gap through the normal trigger.
  for v_item in select * from jsonb_array_elements(v_data -> 'tasks') loop
    select aa.id into v_answer
      from public.assessment_answers aa
      join public.requirements r on r.id = aa.requirement_id
     where aa.assessment_id = v_assessment and r.code = v_item ->> 'code';

    insert into public.remediation_tasks (organization_id, assessment_answer_id, title, description,
                                          priority, status, assignee_id, due_date)
    values (v_org, v_answer, v_item ->> 'title', v_item ->> 'description', v_item ->> 'priority',
            v_item ->> 'status', v_uid, v_today + (v_item ->> 'due_in_days')::integer);
  end loop;

  return v_org;
end;
$$;

revoke execute on function public.create_demo_organization() from public, anon;
grant execute on function public.create_demo_organization() to authenticated;

-- -----------------------------------------------------------------------------
-- Fix: deleting an organisation whose members own requirements failed, because
-- the member-removal trigger updated answers already removed by the cascade.
-- When the organisation itself is being deleted there is nothing to clear.
-- -----------------------------------------------------------------------------
create or replace function private.clear_assignments_of_removed_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.organizations where id = old.organization_id) then
    return old;
  end if;
  update public.assessment_answers set owner_id = null
   where organization_id = old.organization_id and owner_id = old.user_id;
  update public.remediation_tasks set assignee_id = null
   where organization_id = old.organization_id and assignee_id = old.user_id;
  return old;
end;
$$;

-- -----------------------------------------------------------------------------
-- Clean-up of demo data
-- -----------------------------------------------------------------------------
create or replace function private.purge_demo_data(p_older_than interval default interval '7 days')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orgs integer;
begin
  delete from public.organizations where is_demo and created_at < now() - p_older_than;
  get diagnostics v_orgs = row_count;

  -- Anonymous users that belong to no real organisation.
  delete from auth.users u
   where u.is_anonymous
     and u.created_at < now() - p_older_than
     and not exists (select 1
                       from public.organization_members m
                       join public.organizations o on o.id = m.organization_id
                      where m.user_id = u.id and not o.is_demo);
  return v_orgs;
end;
$$;

revoke execute on function private.purge_demo_data(interval) from public, anon, authenticated;

do $do$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('purge-demo-data', '17 3 * * *', 'select private.purge_demo_data()');
  else
    raise notice 'pg_cron not available: run private.purge_demo_data() periodically';
  end if;
end
$do$;
