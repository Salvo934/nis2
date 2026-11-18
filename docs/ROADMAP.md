# Roadmap e criteri di completamento

Ogni milestone è "completata" solo quando **tutti** i criteri sono verificati e i comandi indicati passano. Lo stato riportato qui va aggiornato a mano, non presunto.

| #   | Milestone                | Stato                                                                                                                           |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Fondamenta               | Codice scritto; build/lint/unit test verificati localmente. **Flussi auth da verificare con un progetto Supabase reale.**       |
| 2   | Multi-tenancy            | Migration e RLS verificate su PostgreSQL 14 locale (73 asserzioni). **Da verificare su Supabase reale e con login end-to-end.** |
| 3   | Dashboard                | Da iniziare                                                                                                                     |
| 4   | Assessment               | Da iniziare                                                                                                                     |
| 5   | Gap Analysis             | Da iniziare                                                                                                                     |
| 6   | Evidenze e report        | Da iniziare                                                                                                                     |
| 7   | Preparazione commerciale | Da iniziare                                                                                                                     |

## M1 — Fondamenta

- [x] Next.js 16 + TypeScript strict + Tailwind v4 + shadcn/ui inizializzati
- [x] Design token navy/grigio/verde/arancione/rosso, light e dark mode
- [x] Client Supabase browser/server/proxy con `@supabase/ssr`; variabili d'ambiente validate con Zod
- [x] Pagine: landing, login, registrazione, recupero password, nuova password, area protetta placeholder
- [x] `/auth/confirm` (verifica email e recovery via `token_hash`), logout tramite Server Action (`signOutAction`)
- [x] Protezione route in `proxy.ts` + `requireUser()` nel layout protetto
- [x] Sanificazione del parametro `next` (anti open-redirect) con test
- [x] ESLint, Prettier, Vitest, Playwright configurati (41 test unitari, 14 E2E su pagine pubbliche e redirect)
- [ ] Verifica manuale: registrazione → email di conferma → login → logout → recupero password (richiede Supabase)
- [ ] E2E con Supabase reale (gli E2E inclusi coprono solo pagine pubbliche e redirect)

## M2 — Multi-tenancy

- [x] Migration: `profiles`, `platform_admins`, `organizations`, `organization_members`, `organization_invitations`, `audit_logs`, rate limiter, helper `private.*`, trigger `updated_at`, ultimo amministratore, audit
- [x] RPC: `create_organization`, `create_invitation`, `revoke_invitation`, `get_invitation_preview`, `accept_invitation`
- [x] RLS + privilegi a livello di colonna su tutte le tabelle; funzioni eseguibili solo da `authenticated`
- [x] Test pgTAP in `supabase/tests/` (isolamento tra tenant, ruoli, inviti): 73 asserzioni verdi con `npm run db:test:local` (PostgreSQL 14 + shim Supabase + sottoinsieme pgTAP); controprova: disattivando la RLS i test falliscono
- [x] UI: creazione organizzazione, selettore organizzazione attiva, dati aziendali e classificazione dichiarata, membri e ruoli, inviti con link, audit log, pagina di accettazione invito
- [x] Unit test (schemi, P.IVA, permessi, organizzazione attiva, mappatura errori) ed E2E sulle nuove route protette
- [ ] `npm run db:test` (pgTAP reale) su stack Supabase locale o di staging
- [ ] Verifica manuale con due account reali: creazione org → invito → accettazione → cambio ruolo → isolamento
- [ ] E2E autenticati (richiedono un progetto Supabase di test)
- [ ] Tipi generati con `npm run db:types` al posto di quelli scritti a mano
- [ ] Invio email degli inviti (oggi l'amministratore copia il link)

## M3 — Dashboard

- Shell protetta: sidebar, header con utente e organizzazione attiva, responsive, navigazione da tastiera
- Metriche calcolate da query SQL (vista o RPC), ognuna con numeratore, denominatore e criterio mostrati in UI
- Skeleton, empty state, grafici Recharts
- Criterio: con DB vuoto la dashboard mostra empty state; con seed mostra valori uguali a query SQL di controllo

## M4 — Assessment

- Tabelle catalogo + `assessments` + `assessment_answers`
- Script di import catalogo da dataset JSON con fonte, versione e checksum; **nessun requisito inventato** (il dataset va fornito/verificato prima dell'import)
- UI di valutazione con filtri, stato, motivazione, responsabile, data
- Criterio: import idempotente; versione pubblicata immutabile (test); risposte salvate con validazione server

## M5 — Gap Analysis e piano di adeguamento

- Vista gap = risposte `partial`/`not_implemented` con severità
- `remediation_tasks` con creazione da gap, tabella con ricerca/filtri, stati e scadenze
- Criterio: chiudere un task aggiorna metriche e audit log; test RLS sui task

## M6 — Evidenze e report

- Bucket privato, upload validato (MIME, dimensione, hash), versioni, collegamento ai requisiti, download con URL firmato
- Audit log su upload/download/eliminazione
- Report PDF con data, versione catalogo e criteri di calcolo
- Criterio: test di accesso cross-tenant su Storage; PDF generato contiene i metadati richiesti

## M7 — Preparazione commerciale

- Modalità demo con organizzazione fittizia e dati sintetici
- CSP, header di sicurezza, rate limiting, revisione dipendenze, threat model
- Deploy Cloudflare verificato (incluso il proxy Node sperimentale o fallback)
- Documentazione tecnica e di onboarding
- Criterio: checklist di sicurezza completata e test E2E dei 6 passi della demo verdi in CI
