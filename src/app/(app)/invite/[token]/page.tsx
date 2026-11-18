import { MailWarning } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { FormAlert } from "@/components/forms/form-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AcceptInvitationButton } from "@/features/organizations/components/accept-invitation";
import { RoleBadge } from "@/features/organizations/components/role-badge";
import { invitationTokenSchema } from "@/features/organizations/schemas";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { OrgRole } from "@/types/database";

export const metadata: Metadata = { title: "Invito", referrer: "no-referrer" };

const STATUS_MESSAGES = {
  invalid: "Il link di invito non è valido.",
  revoked: "Questo invito è stato revocato.",
  accepted: "Questo invito è già stato utilizzato.",
  expired: "Questo invito è scaduto. Chiedi all'amministratore di inviarne uno nuovo.",
} as const;

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const user = await requireUser();
  const { token } = await params;
  const parsed = invitationTokenSchema.safeParse(token);

  let preview: {
    status: keyof typeof STATUS_MESSAGES | "pending";
    organization_name: string | null;
    role: OrgRole | null;
    invited_email: string | null;
    email_matches: boolean | null;
  } = { status: "invalid", organization_name: null, role: null, invited_email: null, email_matches: null };

  if (parsed.success) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .rpc("get_invitation_preview", { p_token: parsed.data })
      .maybeSingle();
    if (!error && data) preview = data;
  }

  return (
    <div className="mx-auto max-w-md py-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Invito a NIS2 Control</CardTitle>
          {preview.status === "pending" && preview.organization_name ? (
            <CardDescription>
              Sei stato invitato a unirti a{" "}
              <strong className="text-foreground">{preview.organization_name}</strong>.
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-5">
          {preview.status !== "pending" ? (
            <>
              <FormAlert>{STATUS_MESSAGES[preview.status]}</FormAlert>
              <Button variant="outline" asChild className="w-full">
                <Link href="/dashboard">Vai alla dashboard</Link>
              </Button>
            </>
          ) : preview.email_matches ? (
            <>
              {preview.role ? (
                <p className="flex items-center gap-2 text-sm">
                  Ruolo assegnato: <RoleBadge role={preview.role} />
                </p>
              ) : null}
              <AcceptInvitationButton
                token={parsed.data!}
                organizationName={preview.organization_name ?? ""}
              />
            </>
          ) : (
            <div className="space-y-4">
              <FormAlert tone="info" title="Account diverso">
                <span className="flex gap-2">
                  <MailWarning className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  L&apos;invito è destinato a {preview.invited_email}, ma hai effettuato l&apos;accesso come{" "}
                  {user.email}. Esci e accedi (o registrati) con l&apos;indirizzo corretto, poi riapri il
                  link.
                </span>
              </FormAlert>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
