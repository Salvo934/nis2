import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo />
      <div className="space-y-2">
        <p className="text-sm font-semibold text-primary">404</p>
        <h1 className="text-2xl font-semibold tracking-tight">Pagina non trovata</h1>
        <p className="text-sm text-muted-foreground">
          La pagina richiesta non esiste o non è più disponibile.
        </p>
      </div>
      <Button asChild>
        <Link href="/">Torna alla home</Link>
      </Button>
    </main>
  );
}
