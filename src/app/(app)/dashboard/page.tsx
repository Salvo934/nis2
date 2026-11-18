import { ArrowRight, Building2, ClipboardList, Database, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RoleBadge } from "@/features/organizations/components/role-badge";
import { NIS2_CLASSIFICATIONS, SECTORS, SIZE_CLASSES, labelOf } from "@/features/organizations/constants";
import { getOrgContext, getOrganization, listMembers } from "@/features/organizations/data";

export const metadata: Metadata = { title: "Dashboard" };

const upcoming = [
  {
    icon: ClipboardList,
    title: "Assessment NIS2",
    text: "Valutazione dei requisiti del catalogo normativo verificato e versionato.",
    milestone: "M4",
  },
  {
    icon: Database,
    title: "Metriche di avanzamento",
    text: "Indicatori calcolati dai dati reali, con criteri e denominatori espliciti.",
    milestone: "M3",
  },
];

export default async function DashboardPage() {
  const { user, active } = await getOrgContext();
  const firstName = user.fullName?.split(" ")[0];

  if (!active) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 py-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {firstName ? `Benvenuto, ${firstName}` : "Benvenuto"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Per iniziare crea la tua organizzazione oppure apri il link di invito ricevuto da un collega.
          </p>
        </div>
        <Card>
          <CardHeader>
            <span className="inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Building2 className="size-5" aria-hidden="true" />
            </span>
            <CardTitle className="pt-2">Crea la tua organizzazione</CardTitle>
            <CardDescription>
              Ragione sociale, settore e dimensione. Potrai invitare i collaboratori e assegnare i ruoli.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/organizations/new">
                Crea organizzazione <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const [organization, members] = await Promise.all([
    getOrganization(active.organization.id),
    listMembers(active.organization.id),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{active.organization.name}</h1>
        <p className="text-sm text-muted-foreground">
          {firstName ? `Ciao ${firstName}. ` : null}Panoramica dell&apos;organizzazione attiva.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Profilo dell&apos;organizzazione</CardTitle>
            <CardDescription>Dati dichiarati dall&apos;organizzazione.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Settore</dt>
                <dd className="font-medium">{organization ? labelOf(SECTORS, organization.sector) : "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Dimensione</dt>
                <dd className="font-medium">
                  {organization ? labelOf(SIZE_CLASSES, organization.size_class) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Classificazione NIS2 dichiarata</dt>
                <dd className="font-medium">
                  {organization ? labelOf(NIS2_CLASSIFICATIONS, organization.nis2_classification) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Il tuo ruolo</dt>
                <dd>
                  <RoleBadge role={active.role} />
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" aria-hidden="true" />
              Membri
            </CardTitle>
            <CardDescription>Persone con accesso a questa organizzazione.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-3xl font-semibold tabular-nums">{members.length}</p>
            <Button variant="outline" size="sm" asChild>
              <Link href="/settings/members">Gestisci membri</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="upcoming" className="space-y-4">
        <h2 id="upcoming" className="text-lg font-semibold">
          In arrivo
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {upcoming.map(({ icon: Icon, title, text, milestone }) => (
            <Card key={title} className="bg-muted/30 shadow-none">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <span className="inline-flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-4.5" aria-hidden="true" />
                  </span>
                  <Badge variant="outline">{milestone}</Badge>
                </div>
                <CardTitle className="pt-2">{title}</CardTitle>
                <CardDescription>{text}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
