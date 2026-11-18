"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Details stay in the server logs; the user only sees a reference code.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center" role="alert">
      <span className="inline-flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <TriangleAlert className="size-6" aria-hidden="true" />
      </span>
      <h1 className="text-xl font-semibold">Qualcosa è andato storto</h1>
      <p className="text-sm text-muted-foreground">
        Non è stato possibile completare l&apos;operazione. Riprova; se il problema persiste contatta il
        supporto
        {error.digest ? (
          <>
            {" "}
            indicando il codice{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{error.digest}</code>
          </>
        ) : null}
        .
      </p>
      <Button onClick={reset}>Riprova</Button>
    </div>
  );
}
