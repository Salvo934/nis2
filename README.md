# NIS2 Control

Piattaforma SaaS B2B multi-tenant per gestire il percorso di adeguamento alla **Direttiva (UE) 2022/2555 (NIS2)** e al **D.Lgs. 138/2024**: assessment dei requisiti, gap analysis, piano di adeguamento, evidenze e report.

> **Stato del progetto:** Milestone 2 (Multi-tenancy). Sono implementati autenticazione, design system, organizzazioni, ruoli, inviti, RLS e audit log; i moduli di conformità non ancora. Vedi [docs/ROADMAP.md](docs/ROADMAP.md).
>
> NIS2 Control è uno strumento di supporto. Non rilascia certificazioni né sostituisce la consulenza legale. Non è ancora pronto per la produzione: mancano i test di sicurezza previsti in M7.

## Stack

Next.js 16 (App Router) · TypeScript strict · Supabase (Postgres, Auth, Storage, RLS) · `@supabase/ssr` · Tailwind CSS v4 · shadcn/ui · Lucide · Recharts · React Hook Form + Zod · Vitest · Playwright · Cloudflare Workers (OpenNext)

## Documentazione

| Documento                                    | Contenuto                                                                                          |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Principi, struttura delle cartelle, livelli applicativi, flussi di autenticazione, scelte motivate |
| [docs/DATABASE.md](docs/DATABASE.md)         | Schema PostgreSQL, matrice dei permessi, RLS, Storage, test di isolamento                          |
| [docs/ROADMAP.md](docs/ROADMAP.md)           | Milestone con criteri di completamento verificabili                                                |

## Requisiti

- Node.js ≥ 22 e npm
- Un progetto Supabase: **cloud** (gratuito, consigliato se non hai Docker) oppure **locale** con `supabase start` (richiede Docker)

## Avvio rapido

```bash
npm install
npm run setup        # crea .env.local da .env.example e controlla le variabili
npm run dev          # http://localhost:3000
```

## Configurazione di Supabase

### Opzione A: progetto cloud

1. Crea un progetto su supabase.com (regione UE consigliata).
2. **Project Settings → API Keys**: copia URL e _publishable key_ in `.env.local`.
3. **Authentication → URL Configuration**:
   - Site URL: `http://localhost:3000`
   - Redirect URLs: `http://localhost:3000/**`
4. **Authentication → Sign In / Providers → Email**: attiva _Confirm email_.
5. **Authentication → Policies → Password**: lunghezza minima 10, con maiuscole, minuscole e cifre (deve combaciare con `src/features/auth/schemas.ts`).
6. **Authentication → Emails → Templates**: copia il contenuto di `supabase/templates/confirmation.html` in _Confirm signup_ e `supabase/templates/recovery.html` in _Reset password_. Questi template usano il flusso `token_hash` verso `/auth/confirm`, che funziona anche se il link viene aperto su un altro dispositivo.
7. Il servizio email integrato di Supabase ha limiti molto bassi: per un uso reale configura un SMTP (Authentication → Emails → SMTP).

### Applicare lo schema (M2)

Progetto cloud: con la Supabase CLI collegata al progetto (`npx supabase link`) esegui `npx supabase db push`. Stack locale: `npm run db:reset` applica tutte le migration in `supabase/migrations/`.

### Opzione B: stack locale (Docker)

```bash
npm run db:start     # avvia Postgres, Auth, Storage, Studio e Mailpit
```

`supabase/config.toml` include già le impostazioni di auth (conferma email, password policy, template). Copia in `.env.local` URL e publishable key stampati dal comando. Le email di test si leggono in Mailpit su http://127.0.0.1:54324.

## Script

| Comando                                     | Descrizione                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `npm run dev`                               | Server di sviluppo                                                                               |
| `npm run build`                             | Build di produzione Next.js                                                                      |
| `npm run check`                             | Typecheck + lint + test unitari                                                                  |
| `npm run test`                              | Test unitari e di componente (Vitest)                                                            |
| `npm run test:e2e`                          | Test end-to-end (Playwright; la prima volta: `npx playwright install chromium`)                  |
| `npm run format`                            | Prettier                                                                                         |
| `npm run preview`                           | Build OpenNext e anteprima in runtime Cloudflare (workerd) locale                                |
| `npm run deploy`                            | Build e deploy su Cloudflare Workers (richiede `wrangler login`)                                 |
| `npm run db:start` / `db:stop` / `db:reset` | Stack Supabase locale                                                                            |
| `npm run db:types`                          | Genera i tipi TypeScript dallo schema (sostituisce `src/types/database.ts`, oggi scritto a mano) |
| `npm run db:test`                           | Test pgTAP di RLS e isolamento con la Supabase CLI (richiede Docker)                             |
| `npm run db:test:local`                     | Stessi test su un PostgreSQL locale temporaneo, senza Docker (vedi docs/DATABASE.md §7)          |

## Variabili d'ambiente

| Variabile                              | Dove             | Note                                                                                  |
| -------------------------------------- | ---------------- | ------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | browser + server | Inserita nel bundle in fase di build                                                  |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser + server | Pubblica per design: ogni richiesta resta soggetta a RLS                              |
| `SUPABASE_SECRET_KEY`                  | solo script CLI  | Aggira RLS. Mai con prefisso `NEXT_PUBLIC_`, mai importata in `src/`. Non usata in M1 |

## Sicurezza: cosa è implementato

- Sessione verificata lato server (`auth.getUser()`) nel layout protetto e in ogni pagina protetta; il `proxy.ts` fa solo redirect ottimistici e il refresh dei cookie.
- Login, registrazione e recupero password vengono chiamati dal browser, così Supabase applica il rate limit sull'IP reale dell'utente.
- Conferma email e recovery tramite `token_hash` verificato lato server.
- Logout con Server Action, quindi protetto dal controllo dell'Origin.
- Parametro `next` sanificato contro open redirect, coperto da test.
- Messaggi d'errore generici: niente enumerazione degli account, niente errori raw dal server.
- Header di sicurezza (`X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS) e `x-powered-by` rimosso.

In M2 si aggiungono: RLS e privilegi per colonna su tutte le tabelle tenant, test di isolamento tra organizzazioni, inviti con token conservato solo come hash, audit log append-only scritto da trigger, rate limiting in Postgres sulle RPC sensibili, organizzazione attiva verificata lato server (il cookie è solo una preferenza).

Pianificato: Storage privato (M6), CSP con nonce, rate limiting all'edge e test di sicurezza (M7). Dettagli in [docs/ARCHITECTURE.md §6](docs/ARCHITECTURE.md).

## Deploy su Cloudflare

```bash
npx wrangler login
npm run deploy
```

Le variabili `NEXT_PUBLIC_*` devono essere presenti in `.env.local` (o nell'ambiente CI) **al momento della build**. Nota: OpenNext supporta il `proxy.ts` di Next 16 su Workers solo in modalità sperimentale. La verifica del deploy è prevista in M7; il piano di riserva è descritto in [docs/ARCHITECTURE.md §2](docs/ARCHITECTURE.md).

## Struttura

```
src/
  app/            (marketing), (auth), (app) route group · auth/confirm
  components/     ui (shadcn), layout, forms, brand, theme
  features/auth/  schemi Zod, form, azioni, mappatura errori
  lib/            supabase (client/server/proxy), auth (DAL, route), env
  proxy.ts
supabase/         config.toml, templates email, migrations (M2+)
e2e/              test Playwright
docs/             architettura, database, roadmap
```
