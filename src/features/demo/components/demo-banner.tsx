import { FlaskConical } from "lucide-react";

import { Button } from "@/components/ui/button";
import { leaveDemoForSignupAction } from "@/features/demo/actions";
import { DEMO_COMPANY } from "@/features/demo/constants";

/** Shown on every app page during an anonymous demo session. */
export function DemoBanner() {
  return (
    <div
      role="status"
      className="flex flex-col gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8"
    >
      <p className="flex items-start gap-2">
        <FlaskConical className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
        <span>
          <strong className="font-semibold">Modalità demo.</strong> Stai esplorando {DEMO_COMPANY},
          un&apos;azienda fittizia con dati dimostrativi. Puoi modificare tutto: la tua copia è privata e
          viene eliminata dopo 7 giorni.
        </span>
      </p>
      <form action={leaveDemoForSignupAction} className="shrink-0">
        <Button type="submit" size="sm" variant="outline">
          Esci e crea un account
        </Button>
      </form>
    </div>
  );
}
