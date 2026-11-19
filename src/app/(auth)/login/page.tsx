import type { Metadata } from "next";
import Link from "next/link";

import { FileDown } from "lucide-react";

import { FormAlert } from "@/components/forms/form-alert";
import { AuthCard } from "@/features/auth/components/auth-card";
import { DemoButton } from "@/features/demo/components/demo-button";
import { DEMO_COMPANY, SAMPLE_REPORT_FILENAME, SAMPLE_REPORT_PATH } from "@/features/demo/constants";
import { LoginForm } from "@/features/auth/components/login-form";
import { safeRedirectPath } from "@/lib/auth/routes";
import { firstParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "Accedi" };

const NOTICES = {
  link_invalid: { tone: "error", text: "Il link non è valido o è scaduto. Richiedine uno nuovo." },
  signed_out: { tone: "info", text: "Sei uscito dal tuo account." },
} as const;

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeRedirectPath(firstParam(params.next));
  const notice =
    firstParam(params.error) === "link_invalid"
      ? NOTICES.link_invalid
      : firstParam(params.signed_out)
        ? NOTICES.signed_out
        : null;

  return (
    <AuthCard
      title="Accedi"
      description="Inserisci le tue credenziali per accedere a NIS2 Control."
      footer={
        <>
          Non hai un account?{" "}
          <Link href="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
            Registrati
          </Link>
        </>
      }
    >
      {notice ? (
        <FormAlert tone={notice.tone} className="mb-2">
          {notice.text}
        </FormAlert>
      ) : null}
      <section
        aria-labelledby="demo-title"
        className="mb-2 rounded-lg border border-primary/25 bg-primary/5 p-4"
      >
        <h2 id="demo-title" className="text-sm font-semibold">
          Vuoi solo dare un&apos;occhiata?
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Entra senza registrarti in {DEMO_COMPANY}, un&apos;azienda fittizia con assessment a metà, lacune
          classificate e piano d&apos;azione.
        </p>
        <DemoButton className="mt-3 w-full" />
        <a
          href={SAMPLE_REPORT_PATH}
          download={SAMPLE_REPORT_FILENAME}
          className="mt-2 inline-flex w-full items-center justify-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          <FileDown className="size-4" aria-hidden="true" />
          Scarica un report PDF di esempio
        </a>
      </section>
      <div className="my-2 flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        oppure accedi
        <span className="h-px flex-1 bg-border" />
      </div>
      <LoginForm next={next} />
    </AuthCard>
  );
}
