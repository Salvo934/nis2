import { ClipboardList } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CreateAssessmentDialog } from "@/features/assessment/components/create-assessment-dialog";
import { ASSESSMENT_STATUSES } from "@/features/assessment/constants";
import { suggestedVersionId } from "@/features/assessment/catalogues";
import { listAssessments, listPublishedVersions } from "@/features/assessment/data";
import { computeAssessmentMetrics } from "@/features/assessment/metrics";
import { NIS2_CLASSIFICATIONS, labelOf } from "@/features/organizations/constants";
import { getOrganization, requireActiveOrganization } from "@/features/organizations/data";
import { can } from "@/features/organizations/permissions";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Assessment NIS2" };

export default async function AssessmentsPage() {
  const { active } = await requireActiveOrganization();
  const [rows, versions, organization] = await Promise.all([
    listAssessments(active.organization.id),
    listPublishedVersions(),
    getOrganization(active.organization.id),
  ]);
  const classification = organization?.nis2_classification ?? null;
  const suggestedId = suggestedVersionId(versions, classification);
  const canManage = can(active.role, "assessment.manage");
  const defaultTitle = `Assessment NIS2 – ${new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric", timeZone: "Europe/Rome" }).format(new Date())}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Assessment NIS2"
        description="Valutazioni dei requisiti del catalogo normativo. I risultati sono autodichiarati e non costituiscono certificazione."
        actions={
          canManage ? (
            <CreateAssessmentDialog
              versions={versions}
              defaultTitle={defaultTitle}
              suggestedId={suggestedId}
              suggestionReason={classification ? labelOf(NIS2_CLASSIFICATIONS, classification) : null}
            />
          ) : null
        }
      />

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <span className="inline-flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ClipboardList className="size-5" aria-hidden="true" />
          </span>
          <h2 className="font-semibold">Nessun assessment</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {canManage
              ? "Crea il primo assessment: verranno caricati tutti i requisiti del catalogo da valutare."
              : "Un amministratore o un security manager può avviare il primo assessment."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map(({ assessment, answers }) => {
            const m = computeAssessmentMetrics(answers);
            return (
              <Link
                key={assessment.id}
                href={`/assessments/${assessment.id}`}
                className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Card className="h-full transition-colors hover:bg-muted/40">
                  <CardContent className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="font-semibold">{assessment.title}</h2>
                        <p className="text-xs text-muted-foreground">
                          Creato il {formatDate(assessment.created_at)}
                        </p>
                      </div>
                      <StatusBadge options={ASSESSMENT_STATUSES} value={assessment.status} />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>
                          Valutati {m.assessed}/{m.total}
                        </span>
                        <span>
                          Implementati {m.implemented}/{m.applicable} applicabili
                        </span>
                      </div>
                      <Progress value={m.assessmentProgress} aria-label="Avanzamento della valutazione" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Lacune aperte: <span className="font-semibold text-foreground">{m.gaps}</span>
                    </p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
