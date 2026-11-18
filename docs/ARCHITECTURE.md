# Architettura di NIS2 Control

> Stato: documento di progetto. Le sezioni marcate **[M1]** sono implementate; le altre descrivono il disegno per le milestone successive e non vanno considerate funzionalità esistenti.

## 1. Principi

1. **Il database è il confine di sicurezza.** Ogni tabella con dati aziendali ha RLS attiva. Il codice applicativo controlla i permessi _in aggiunta_ alle policy, mai _al posto_ di esse.
2. **Nessuna fiducia nel browser.** `organization_id`, ruoli e ID di risorse ricevuti dal client sono solo _richieste_: il server li verifica contro la sessione e le membership.
3. **Server-first.** Lettura dati in Server Components, scritture in Server Actions / Route Handlers. Il browser usa il client Supabase solo per i flussi di autenticazione (vedi §5).
4. **Nessuna chiave privilegiata nel runtime web.** La secret key Supabase (ex `service_role`) è usata solo da script CLI (seed, import catalogo). L'app web usa la publishable key + JWT dell'utente, quindi è sempre soggetta a RLS.
5. **Nessun contenuto normativo inventato.** Il catalogo requisiti viene importato da dataset versionati con fonte e checksum (M4).
6. **Le metriche non sono certificazioni.** Ogni indicatore espone numeratore, denominatore e criterio.

## 2. Stack

| Livello        | Tecnologia                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------- |
| Framework      | Next.js 16 (App Router, Turbopack), React 19, TypeScript strict                                     |
| UI             | Tailwind CSS v4, shadcn/ui (Radix), Lucide, Recharts, Sonner, next-themes                           |
| Form           | React Hook Form + Zod (stesso schema lato client e lato server)                                     |
| Dati/Auth/File | Supabase Postgres + Auth + Storage, `@supabase/ssr`                                                 |
| Deploy         | Cloudflare Workers tramite `@opennextjs/cloudflare`                                                 |
| Test           | Vitest + Testing Library (unit/component), pgTAP via `supabase test db` (RLS, M2), Playwright (E2E) |

**Scelte motivate**

- **`cacheComponents` disattivato.** Quasi ogni pagina dipende dalla sessione e dal tenant attivo; la cache server-side di dati multi-tenant aumenta il rischio di fughe tra organizzazioni e complica il ragionamento sulla sicurezza. Si potrà riattivare in modo mirato (es. catalogo normativo pubblico) quando misurato.
- **`proxy.ts` (ex middleware).** Serve solo a rinnovare i cookie di sessione e a fare redirect ottimistici. Non è un controllo di autorizzazione: le pagine riverificano l'utente nel Data Access Layer. Nota: su Cloudflare, OpenNext supporta il proxy in runtime Node.js in modalità _sperimentale_ — da verificare in M7 (fallback: `middleware.ts` in runtime edge).

## 3. Struttura delle cartelle

```
nis2/
├─ docs/                         # Architettura, database, roadmap, decisioni
├─ e2e/                          # Test Playwright
├─ scripts/                      # Script CLI (seed demo, import catalogo) — usano la secret key
├─ supabase/
│  ├─ config.toml                # Config Supabase locale (auth, email, storage)
│  ├─ migrations/                # Migration SQL versionate (M2+)
│  ├─ seed.sql                   # Dati demo fittizi (M2+)
│  ├─ templates/                 # Template email auth (flusso token_hash)
│  └─ tests/                     # Test pgTAP per RLS e isolamento tenant (M2+)
├─ src/
│  ├─ app/
│  │  ├─ (marketing)/            # Landing pubblica
│  │  ├─ (auth)/                 # login, signup, forgot-password, update-password
│  │  ├─ (app)/                  # Area protetta: dashboard, assessment, gap, tasks, evidence, reports, settings
│  │  ├─ auth/                   # Route handler: confirm (token_hash / code)
│  │  ├─ layout.tsx              # Root layout: tema, toaster, font
│  │  └─ globals.css             # Design token (light/dark)
│  ├─ components/
│  │  ├─ ui/                     # Primitive shadcn/ui (generate, modificabili)
│  │  ├─ brand/                  # Logo e identità
│  │  ├─ layout/                 # Sidebar, header, shell
│  │  └─ theme/                  # ThemeProvider, toggle
│  ├─ features/                  # Moduli verticali (UI + logica di dominio)
│  │  ├─ auth/                   # schemi Zod, form, azioni
│  │  ├─ organizations/          # (M2)
│  │  ├─ dashboard/              # (M3)
│  │  ├─ assessment/             # (M4)
│  │  ├─ gap-analysis/           # (M5)
│  │  ├─ remediation/            # (M5)
│  │  ├─ evidence/               # (M6)
│  │  └─ reports/                # (M6)
│  ├─ lib/
│  │  ├─ supabase/               # client browser, server, proxy (session refresh)
│  │  ├─ auth/                   # Data Access Layer: requireUser(), redirect sicuri
│  │  ├─ env.ts                  # Validazione Zod delle variabili d'ambiente
│  │  └─ utils.ts
│  ├─ types/                     # Tipi generati dal DB (supabase gen types, M2)
│  └─ proxy.ts                   # Refresh sessione + redirect ottimistici
├─ tests/                        # Setup Vitest
├─ open-next.config.ts / wrangler.jsonc   # Deploy Cloudflare
└─ .env.example
```

Regola di dipendenza: `app/` → `features/` → `lib/`. `features/*` non importa da altri `features/*` se non tramite i loro export pubblici; `lib/` non importa da `features/`.

## 4. Livelli applicativi

```
Browser ──► proxy.ts (refresh cookie, redirect ottimistico)
        ──► Server Component / Server Action
                 │  1. requireUser()           ← verifica JWT con Supabase Auth
                 │  2. requireOrgRole(org, …)  ← membership letta dal DB (M2)
                 │  3. Zod.parse(input)
                 ▼
            Data access (features/*/data.ts, 'server-only')
                 │  client Supabase con JWT utente
                 ▼
            Postgres + RLS  ← controllo finale e non aggirabile dal codice app
```

- **Data Access Layer (DAL)**: `src/lib/auth/session.ts` espone `getUser()` / `requireUser()` (usa `supabase.auth.getUser()`, che valida la sessione con il server Auth). Da M2 si aggiunge `requireOrgContext()` che risolve l'organizzazione attiva verificando la membership.
- **Organizzazione attiva (M2)**: salvata in un cookie `httpOnly` come _preferenza_. A ogni richiesta il server verifica che l'utente sia membro; se non lo è, il cookie viene ignorato. RLS rende comunque impossibile leggere dati di un'altra organizzazione.
- **Errori**: le azioni restituiscono `{ ok: false, error: { code, message } }` con messaggi generici per l'utente; il dettaglio va nei log server. Nessuno stack trace o messaggio Postgres raw al client.

## 5. Autenticazione [M1]

| Flusso                                  | Dove avviene                                                           | Perché                                                                                                                                                                                                                |
| --------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login, registrazione, recupero password | Browser → Supabase Auth (publishable key)                              | Supabase Auth applica rate limit **per IP**: chiamandolo dal server tutti gli utenti condividerebbero l'IP del Worker. La password policy è applicata da Supabase Auth (min 10 caratteri, maiuscole/minuscole/cifre). |
| Conferma email e link di recovery       | Route handler `/auth/confirm` (`verifyOtp` con `token_hash`)           | Funziona anche se il link è aperto su un altro browser/dispositivo; i cookie sono impostati server-side.                                                                                                              |
| Logout                                  | Server Action `signOutAction`                                          | Revoca la sessione e pulisce i cookie lato server. Le Server Action verificano l'header Origin (protezione CSRF) e non sono invocabili con un link GET.                                                               |
| Protezione route                        | `proxy.ts` (ottimistico) + `requireUser()` nel layout e in ogni azione | Doppio controllo; il proxy da solo non basta.                                                                                                                                                                         |
| Redirect post-login                     | Parametro `next` sanificato (`safeRedirectPath`)                       | Previene open redirect.                                                                                                                                                                                               |

I cookie di sessione sono gestiti da `@supabase/ssr`. Non sono `httpOnly`, perché anche il client browser deve leggerli: il rischio XSS è mitigato evitando `dangerouslySetInnerHTML`, con header di sicurezza (M1) e con una CSP completa (M7).

## 6. Sicurezza — piano per milestone

| Misura                                                                                                                                           | Milestone |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| Validazione Zod client+server, sanificazione redirect, header di sicurezza base                                                                  | M1        |
| RLS su tutte le tabelle tenant, funzioni helper `security definer` in schema `private`, test pgTAP di isolamento                                 | M2        |
| FK composite `(id, organization_id)` per impedire collegamenti cross-tenant (anti-IDOR a livello DB)                                             | M2        |
| Rate limiting applicativo (inviti, upload, export) con tabella contatori in Postgres; valutazione del binding Rate Limiting di Cloudflare        | M2 / M7   |
| Audit log append-only scritto da trigger                                                                                                         | M2 / M6   |
| Storage privato, path `{org_id}/…`, policy su `storage.objects`, URL firmati a breve scadenza, whitelist MIME + limite dimensione + hash SHA-256 | M6        |
| CSP con nonce, revisione dipendenze, test di sicurezza, threat model                                                                             | M7        |

## 7. Ambienti

| Ambiente   | Supabase                                                                 | App                                   |
| ---------- | ------------------------------------------------------------------------ | ------------------------------------- |
| Locale     | `supabase start` (richiede Docker) **oppure** progetto cloud di sviluppo | `npm run dev`                         |
| Preview    | Progetto Supabase di staging                                             | `npm run preview` (workerd locale)    |
| Produzione | Progetto Supabase dedicato (regione UE)                                  | `npm run deploy` (Cloudflare Workers) |
