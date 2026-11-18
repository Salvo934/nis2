# Database e modello di autorizzazione

> Stato: catalogo normativo, assessment, risposte e attività correttive implementati (M3–M5). Le tabelle di identità, tenancy e audit (§2 «Identità e tenancy», `audit_logs`, rate limiter) sono **implementate in M2** in `supabase/migrations/`. Il resto è progetto per M4–M6.

## 1. Convenzioni

- PK `uuid default gen_random_uuid()`; `created_at`/`updated_at timestamptz not null default now()` con trigger `updated_at`.
- Enum modellati come `text` + `CHECK` (più facili da evolvere con migration rispetto ai tipi `enum`).
- Ogni tabella tenant ha `organization_id uuid not null`, indicizzato, e RLS **abilitata**. Non usiamo `FORCE ROW LEVEL SECURITY`: le funzioni `security definer` (di proprietà di `postgres`) devono poter scrivere le tabelle per conto dell'utente dopo aver fatto i propri controlli.
- Le tabelle figlie referenziano il padre con **FK composita** `(parent_id, organization_id) → parent(id, organization_id)`: il database rifiuta il collegamento di un'evidenza dell'organizzazione A a un requisito valutato dall'organizzazione B anche in presenza di un bug applicativo.
- Funzioni helper in schema `private` (non esposto da PostgREST), `security definer`, `set search_path = ''`, `stable`.

## 2. Schema

### Identità e tenancy

| Tabella                    | Colonne principali                                                                                                                                                                                                                                              | Note                                                                                                                                                                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`                 | `id` (= `auth.users.id`), `full_name`, `locale`                                                                                                                                                                                                                 | Creato da trigger su `auth.users`. L'utente legge/modifica solo il proprio profilo e legge i profili dei membri delle proprie organizzazioni.                                                                                          |
| `platform_admins`          | `user_id` PK, `granted_by`, `granted_at`                                                                                                                                                                                                                        | **Separato dai ruoli aziendali.** Nessuna policy di scrittura per `authenticated`: si gestisce solo via script/SQL.                                                                                                                    |
| `organizations`            | `name` (ragione sociale), `vat_number`, `sector`, `size_class` (`micro`/`small`/`medium`/`large`/`unknown`), `nis2_classification` (`not_determined`/`essential`/`important`/`out_of_scope`), `classification_basis`, `classification_updated_at`, `created_by` | `nis2_classification` è **dichiarata dall'utente** con motivazione; il software non la deduce. Default `not_determined`.                                                                                                               |
| `organization_members`     | `organization_id`, `user_id`, `role` (`org_admin`/`security_manager`/`auditor`/`viewer`)                                                                                                                                                                        | `unique (organization_id, user_id)`. Trigger che impedisce di rimuovere/declassare l'ultimo `org_admin`.                                                                                                                               |
| `organization_invitations` | `organization_id`, `email` (citext), `role`, `token_hash`, `expires_at`, `invited_by`, `accepted_at`, `revoked_at`                                                                                                                                              | Il token in chiaro va solo nell'email; nel DB c'è l'hash SHA-256. Accettazione tramite funzione RPC che verifica hash, scadenza ed email dell'utente autenticato. Indice unico parziale su inviti pendenti `(organization_id, email)`. |

### Catalogo normativo (globale, versionato)

| Tabella                         | Colonne principali                                                                                                                                                | Note                                                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `regulatory_frameworks`         | `code`, `name`, `issuing_authority`                                                                                                                               | Es. NIS2 / D.Lgs. 138/2024.                                                                      |
| `regulatory_framework_versions` | `framework_id`, `version_label`, `source_title`, `source_url`, `source_published_at`, `dataset_checksum`, `status` (`draft`/`published`/`retired`), `imported_at` | Una versione `published` è **immutabile** (trigger). Le modifiche richiedono una nuova versione. |
| `requirements`                  | `framework_version_id`, `code`, `category_code`, `category_name`, `title`, `description`, `guidance`, `source_reference`, `sort_order`                            | `unique (framework_version_id, code)`. Importati solo da dataset verificati (M4).                |

Lettura: tutti gli utenti autenticati, solo versioni `published`. Scrittura: solo script di import con secret key (oppure Platform Admin via RPC dedicata).

### Valutazione e adeguamento

| Tabella               | Colonne principali                                                                                                                                                                                                                                                 | Note                                                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assessments`         | `organization_id`, `framework_version_id`, `title`, `status` (`draft`/`in_progress`/`completed`/`archived`), `started_at`, `completed_at`, `created_by`                                                                                                            | `unique (id, organization_id)` per FK composite.                                                                                                                                                      |
| `assessment_answers`  | `organization_id`, `assessment_id`, `requirement_id`, `status` (`not_assessed`/`implemented`/`partial`/`not_implemented`/`not_applicable`), `justification`, `owner_id`, `gap_severity` (`low`/`medium`/`high`/`critical`, nullable), `assessed_at`, `assessed_by` | `unique (assessment_id, requirement_id)`. `CHECK`: `not_applicable` e `partial` richiedono `justification`. Trigger: il requisito deve appartenere alla stessa versione del catalogo dell'assessment. |
| `remediation_tasks`   | `organization_id`, `assessment_answer_id` (nullable), `title`, `description`, `priority` (`low`/`medium`/`high`/`critical`), `status` (`todo`/`in_progress`/`blocked`/`done`/`cancelled`), `assignee_id`, `due_date`, `completed_at`, `created_by`                 | `CHECK (status = 'done') = (completed_at is not null)`. L'assegnatario deve essere membro dell'organizzazione (trigger).                                                                              |
| `evidence_files`      | `organization_id`, `document_id` (raggruppa le versioni), `version`, `storage_path`, `file_name`, `mime_type`, `size_bytes`, `sha256`, `description`, `uploaded_by`, `deleted_at`                                                                                  | `unique (document_id, version)`. Soft delete. `CHECK` su MIME ammessi e `size_bytes <= 25 MB`.                                                                                                        |
| `evidence_links`      | `organization_id`, `evidence_file_id`, `assessment_answer_id`                                                                                                                                                                                                      | Tabella ponte con FK composite su entrambi i lati.                                                                                                                                                    |
| `audit_logs`          | `organization_id` (nullable per eventi di piattaforma), `actor_id`, `action`, `entity_type`, `entity_id`, `metadata jsonb`, `created_at`                                                                                                                           | **Append-only**: nessuna policy di update/delete; insert solo da trigger/funzioni `security definer`.                                                                                                 |
| `private.rate_limits` | `key`, `window_start`, `hits`                                                                                                                                                                                                                                      | Schema `private`. Usata da `private.check_rate_limit()`.                                                                                                                                              |

## 3. Matrice dei permessi (RLS)

Legenda: R = lettura, C = creazione, U = modifica, D = eliminazione.

| Risorsa                          | org_admin     | security_manager | auditor | viewer |
| -------------------------------- | ------------- | ---------------- | ------- | ------ |
| Organizzazione (dati anagrafici) | R U           | R                | R       | R      |
| Membri                           | R C U D       | R                | R       | R      |
| Inviti                           | R C U(revoca) | —                | —       | —      |
| Assessment                       | R C U D       | R C U            | R       | R      |
| Risposte assessment              | R C U         | R C U            | R       | R      |
| Attività correttive              | R C U D       | R C U D          | R       | R      |
| Evidenze (metadati)              | R C U D       | R C U D          | R       | R      |
| Evidenze (download file)         | ✓             | ✓                | ✓       | —      |
| Audit log                        | R             | —                | R       | —      |
| Report PDF                       | ✓             | ✓                | ✓       | ✓      |

**Platform Admin**: gestisce il catalogo normativo e può elencare le organizzazioni per supporto. **Non** ottiene accesso implicito ai dati tenant (assessment, evidenze): per il supporto deve essere invitato nell'organizzazione, e l'accesso resta tracciato nell'audit log. È una scelta di minimo privilegio.

## 4. Funzioni helper RLS

```sql
create schema if not exists private;

create function private.is_platform_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.platform_admins where user_id = (select auth.uid())) $$;

create function private.has_org_role(org uuid, roles text[])
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org
      and m.user_id = (select auth.uid())
      and m.role = any (roles)
  )
$$;

-- Esempio di policy
create policy "members read assessments" on public.assessments
  for select to authenticated
  using ((select private.has_org_role(organization_id,
          array['org_admin','security_manager','auditor','viewer'])));
```

`(select auth.uid())` e `(select private.…)` sono racchiusi in subquery per permettere a Postgres di valutarli una volta per query (raccomandazione di performance Supabase).

## 5. Storage

- Bucket `evidence` **privato**, limite dimensione e MIME impostati sul bucket.
- Path oggetto: `{organization_id}/{document_id}/v{version}-{uuid}.{ext}`; il nome originale del file resta solo nei metadati.
- Policy su `storage.objects`: `bucket_id = 'evidence' and private.has_org_role(((storage.foldername(name))[1])::uuid, …)`.
- Download: il server verifica il ruolo, registra l'evento nell'audit log e genera un URL firmato valido 60 secondi.

## 6. Note di implementazione (M2)

- **Scritture tramite RPC.** Creazione di organizzazioni e gestione inviti passano da funzioni `security definer` che verificano `auth.uid()` e il ruolo. `authenticated` non ha `INSERT` su `organizations`, `organization_members`, `organization_invitations` e `audit_logs`.
- **Privilegi per colonna.** Ad esempio `organization_members` concede `UPDATE (role)`, quindi non è possibile spostare una membership in un'altra organizzazione.
- **Inviti.** Il token (256 bit) viene restituito una sola volta all'amministratore; nel database si conserva solo lo SHA-256. Validità 7 giorni, uso singolo. Un nuovo invito alla stessa email revoca il precedente. L'email dell'account che accetta deve coincidere con quella invitata.
- **Ultimo amministratore.** Un trigger impedisce di declassare o rimuovere l'ultimo `org_admin`, con lock sulla riga dell'organizzazione contro le modifiche concorrenti. Di conseguenza, per eliminare l'account dell'unico amministratore bisogna prima nominarne un altro.
- **Rate limit** (finestra fissa, in Postgres): 5 organizzazioni/ora, 30 inviti/ora, 20 accettazioni/ora, 60 anteprime/ora per utente. Un tentativo che fallisce per altri motivi non consuma il limite, perché la transazione viene annullata.
- **Errori.** Le funzioni sollevano messaggi stabili (`forbidden`, `last_org_admin`, `invitation_expired`, …) che l'app traduce; gli errori Postgres grezzi non arrivano al browser.
- **Platform Admin.** Si concede solo via SQL: `insert into public.platform_admins (user_id, note) values ('<uuid>', 'motivo');`

## 7. Test di isolamento

Test pgTAP in `supabase/tests/`:

- `npm run db:test`: pgTAP reale tramite Supabase CLI (richiede Docker);
- `npm run db:test:local`: cluster PostgreSQL temporaneo con `scripts/db/supabase-shim.sql` (ruoli, `auth.uid()`, grant di default di Supabase) e `scripts/db/pgtap-lite.sql` (il sottoinsieme di pgTAP usato dai test). Serve a verificare senza Docker; non sostituisce il test sullo stack Supabase.

Copertura attuale:

- un utente di Org A non vede né modifica righe di Org B (per ogni tabella tenant);
- un `viewer` non può scrivere; un `auditor` non può modificare;
- un utente non può auto-promuoversi `org_admin` né inserirsi in un'altra organizzazione;
- FK composite rifiutano collegamenti cross-tenant;
- `audit_logs` non è modificabile né cancellabile da `authenticated`;
- policy Storage: nessun accesso a oggetti con prefisso di un'altra organizzazione.
