import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { CreateOrganizationForm } from "@/features/organizations/components/create-organization-form";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Nuova organizzazione" };

export default async function NewOrganizationPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Nuova organizzazione"
        description="Diventerai amministratore dell'organizzazione e potrai invitare i tuoi collaboratori."
      />
      <Card>
        <CardContent className="pt-2">
          <CreateOrganizationForm />
        </CardContent>
      </Card>
    </div>
  );
}
