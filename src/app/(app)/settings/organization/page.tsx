import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { OrganizationSettingsForm } from "@/features/organizations/components/organization-settings-form";
import { getOrganization, requireActiveOrganization } from "@/features/organizations/data";
import { can } from "@/features/organizations/permissions";

export const metadata: Metadata = { title: "Dati aziendali" };

export default async function OrganizationSettingsPage() {
  const { active } = await requireActiveOrganization();
  const organization = await getOrganization(active.organization.id);
  if (!organization) notFound();

  return (
    <>
      <PageHeader
        title="Dati aziendali"
        description="Informazioni anagrafiche e classificazione NIS2 dichiarata."
      />
      <Card>
        <CardContent className="pt-2">
          <OrganizationSettingsForm
            key={organization.updated_at}
            organization={organization}
            canEdit={can(active.role, "organization.update")}
          />
        </CardContent>
      </Card>
    </>
  );
}
