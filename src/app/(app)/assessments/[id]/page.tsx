import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { AssessmentStatusControl } from "@/features/assessment/components/assessment-status-control";
import { AssessmentWorkspace } from "@/features/assessment/components/assessment-workspace";
import { DeleteAssessmentDialog } from "@/features/assessment/components/delete-assessment-dialog";
import { catalogueLabel } from "@/features/assessment/catalogues";
import { ASSESSMENT_STATUSES } from "@/features/assessment/constants";
import {
  getAssessment,
  getVersion,
  listAssessmentItems,
  listMemberOptions,
} from "@/features/assessment/data";
import { requireActiveOrganization } from "@/features/organizations/data";
import { can } from "@/features/organizations/permissions";
import { uuidSchema } from "@/features/organizations/schemas";
import { listTasks } from "@/features/remediation/data";
import { DownloadReportButton } from "@/features/reports/components/download-report-button";

export const metadata: Metadata = { title: "Assessment" };

export default async function AssessmentPage({ params }: PageProps<"/assessments/[id]">) {
  const { active } = await requireActiveOrganization();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();

  // Scoped to the active organisation: another tenant's id simply 404s.
  const assessment = await getAssessment(active.organization.id, id);
  if (!assessment) notFound();

  const [items, version, members, tasks] = await Promise.all([
    listAssessmentItems(active.organization.id, assessment),
    getVersion(assessment.framework_version_id),
    listMemberOptions(active.organization.id),
    listTasks(active.organization.id),
  ]);
  const answerIds = new Set(items.map((i) => i.answer.id));
  const linkedTasksCount = tasks.filter(
    (t) => t.assessment_answer_id && answerIds.has(t.assessment_answer_id),
  ).length;
  const canEdit = can(active.role, "assessment.manage") && assessment.status !== "archived";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/assessments">
          <ArrowLeft /> Tutti gli assessment
        </Link>
      </Button>
      <PageHeader
        title={assessment.title}
        description={
          version ? (
            <>
              Catalogo: {catalogueLabel(version)} · versione{" "}
              <span className="font-mono">{version.version_label}</span>
            </>
          ) : null
        }
        actions={
          <>
            {can(active.role, "assessment.manage") ? (
              <AssessmentStatusControl assessmentId={assessment.id} status={assessment.status} />
            ) : (
              <StatusBadge options={ASSESSMENT_STATUSES} value={assessment.status} />
            )}
            <DownloadReportButton assessmentId={assessment.id} variant="outline" label="Report PDF" />
            {can(active.role, "assessment.delete") ? (
              <DeleteAssessmentDialog
                assessmentId={assessment.id}
                title={assessment.title}
                answersCount={items.length}
                linkedTasksCount={linkedTasksCount}
              />
            ) : null}
          </>
        }
      />
      {version?.scope_note ? (
        <p className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
          {version.scope_note}
        </p>
      ) : null}
      <AssessmentWorkspace
        items={items}
        members={members}
        canEdit={canEdit}
        sourceUrl={version?.source_url ?? null}
      />
    </div>
  );
}
