import { BookOpen, FileBarChart, ListChecks } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { catalogueLabel } from "@/features/assessment/catalogues";
import { ASSESSMENT_STATUSES } from "@/features/assessment/constants";
import { listAssessments } from "@/features/assessment/data";
import { computeAssessmentMetrics } from "@/features/assessment/metrics";
import { requireActiveOrganization } from "@/features/organizations/data";
import { DownloadReportButton } from "@/features/reports/components/download-report-button";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Report" };

const CONTENTS = [
  "Copertina con organizzazione, normativa di riferimento, versione del catalogo e data del report",
  "Come leggere il report: il significato di ogni esito, spiegato in parole semplici",
  "Sintesi dei risultati scritta come frasi, con i numeri e i loro denominatori",
  "Avanzamento per area, con la spiegazione di che cosa riguarda ciascuna area",
  "Lacune da colmare ordinate per criticità e attività correttive collegate",
  "Piano di adeguamento con responsabili, scadenze e ritardi",
  "Prossimi passi consigliati, ricavati dai dati",
  "Dettaglio di ogni requisito con il testo ufficiale, l'esito, la motivazione e il responsabile",
  "Criteri di calcolo, glossario e avvertenze",
];

export default async function ReportsPage() {
  const { active } = await requireActiveOrganization();
  const rows = await listAssessments(active.organization.id);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Report"
        description="Report PDF di un assessment, pensato anche per chi non è esperto di sicurezza informatica o di NIS2."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListChecks className="size-4 text-primary" aria-hidden="true" />
            Che cosa contiene il report
          </CardTitle>
          <CardDescription>
            Il testo dei requisiti è sempre quello ufficiale. Le spiegazioni semplici riguardano i concetti e
            i numeri, mai il contenuto della norma. Ogni report generato viene registrato nell&apos;audit log.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="grid list-decimal gap-x-8 gap-y-1.5 pl-5 text-sm text-muted-foreground md:grid-cols-2">
            {CONTENTS.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-14 text-center">
          <FileBarChart className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="max-w-md text-sm text-muted-foreground">
            Per generare un report serve almeno un assessment.
          </p>
          <Button asChild>
            <Link href="/assessments">Vai agli assessment</Link>
          </Button>
        </div>
      ) : (
        <section aria-labelledby="reports-list" className="space-y-3">
          <h2 id="reports-list" className="text-lg font-semibold">
            Scegli l&apos;assessment
          </h2>
          <ul className="space-y-3">
            {rows.map(({ assessment, answers, version }) => {
              const m = computeAssessmentMetrics(answers);
              return (
                <li key={assessment.id}>
                  <Card size="sm">
                    <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/assessments/${assessment.id}`}
                            className="font-semibold underline-offset-4 hover:underline"
                          >
                            {assessment.title}
                          </Link>
                          <StatusBadge options={ASSESSMENT_STATUSES} value={assessment.status} />
                        </div>
                        {version ? (
                          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <BookOpen className="size-3.5 text-primary" aria-hidden="true" />
                            {catalogueLabel(version)}
                          </p>
                        ) : null}
                        <p className="text-xs text-muted-foreground">
                          Creato il {formatDate(assessment.created_at)} · valutati {m.assessed}/{m.total} ·
                          implementati {m.implemented}/{m.applicable} applicabili · lacune {m.gaps}
                        </p>
                      </div>
                      <DownloadReportButton assessmentId={assessment.id} />
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
