/**
 * Maps the stable error messages raised by the SQL functions/triggers
 * (see supabase/migrations/*_tenancy_rpc.sql) to user-facing text.
 * Unknown errors become a generic message: raw Postgres errors never reach
 * the browser.
 */
const MESSAGES: Record<string, string> = {
  not_authenticated: "La sessione è scaduta. Accedi di nuovo.",
  forbidden: "Non hai i permessi per questa operazione.",
  invalid_input: "Alcuni dati non sono validi. Controlla il modulo.",
  rate_limited: "Troppe richieste in poco tempo. Riprova più tardi.",
  already_member: "Questa persona fa già parte dell'organizzazione.",
  invitation_invalid: "L'invito non è valido o è già stato utilizzato.",
  invitation_expired: "L'invito è scaduto. Chiedi all'amministratore di inviarne uno nuovo.",
  invitation_email_mismatch:
    "Questo invito è destinato a un altro indirizzo email. Accedi con l'account corretto.",
  last_org_admin: "L'organizzazione deve avere almeno un amministratore.",
  assignee_not_member: "La persona selezionata non fa parte dell'organizzazione.",
  catalogue_version_immutable: "Il catalogo normativo pubblicato non può essere modificato.",
};

export const GENERIC_ERROR = "Operazione non riuscita. Riprova tra poco.";

type DbErrorLike = { message?: string; code?: string } | null | undefined;

export function dbErrorCode(error: DbErrorLike): string | null {
  const message = error?.message?.trim();
  return message && message in MESSAGES ? message : null;
}

export function mapDbError(error: DbErrorLike): string {
  const code = dbErrorCode(error);
  if (code) return MESSAGES[code]!;
  // 42501 without a known message = privilege error from RLS/GRANTs.
  if (error?.code === "42501") return MESSAGES.forbidden!;
  if (error?.code === "23514") return MESSAGES.invalid_input!;
  return GENERIC_ERROR;
}
