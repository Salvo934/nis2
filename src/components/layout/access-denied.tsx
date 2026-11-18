import { ShieldOff } from "lucide-react";

export function AccessDenied({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-14 text-center">
      <span className="inline-flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <ShieldOff className="size-5" aria-hidden="true" />
      </span>
      <h2 className="font-semibold">Accesso non consentito</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        {message ?? "Il tuo ruolo in questa organizzazione non consente di visualizzare questa sezione."}
      </p>
    </div>
  );
}
