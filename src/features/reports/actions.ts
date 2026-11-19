"use server";

import { catalogueLabel } from "@/features/assessment/catalogues";
import { ASSESSMENT_STATUSES } from "@/features/assessment/constants";
import {
  getAssessment,
  getVersion,
  listAssessmentItems,
  listMemberOptions,
} from "@/features/assessment/data";
import { todayInRome } from "@/features/assessment/metrics";
import { NIS2_CLASSIFICATIONS, SECTORS, SIZE_CLASSES, labelOf } from "@/features/organizations/constants";
import { getOrganization, requireActiveOrganization } from "@/features/organizations/data";
import { dbErrorCode, mapDbError } from "@/features/organizations/errors";
import { uuidSchema } from "@/features/organizations/schemas";
import { listTasks } from "@/features/remediation/data";
import type { ReportInput } from "@/features/reports/model";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";

/**
 * Collects the data for one assessment report and records the generation in
 * the audit log. Everything is read with the user's session (RLS) and scoped
 * to the active organisation; the PDF itself is rendered in the browser.
 */
export async function prepareReportAction(assessmentId: unknown): Promise<ActionResult<ReportInput>> {
  const { user, active } = await requireActiveOrganization();
  const parsed = uuidSchema.safeParse(assessmentId);
  if (!parsed.success) return fail("Assessment non valido.");

  const orgId = active.organization.id;
  const assessment = await getAssessment(orgId, parsed.data);
  if (!assessment) return fail("Assessment non trovato.");

  const supabase = await createClient();
  const { error: auditError } = await supabase.rpc("log_report_generated", { p_assessment: assessment.id });
  if (auditError) {
    if (!dbErrorCode(auditError)) console.error("[reports] audit", auditError.code);
    return fail(mapDbError(auditError));
  }

  const [organization, version, items, tasks, members] = await Promise.all([
    getOrganization(orgId),
    getVersion(assessment.framework_version_id),
    listAssessmentItems(orgId, assessment),
    listTasks(orgId),
    listMemberOptions(orgId),
  ]);
  if (!organization || !version) return fail("Dati del report non disponibili.");

  const nameOf = new Map(members.map((m) => [m.value, m.label]));
  const answerIds = new Set(items.map((i) => i.answer.id));

  return ok({
    generatedAt: new Date().toISOString(),
    generatedBy: user.fullName ?? user.email,
    today: todayInRome(),
    organization: {
      name: organization.name,
      sector: labelOf(SECTORS, organization.sector),
      sizeClass: labelOf(SIZE_CLASSES, organization.size_class),
      classification: labelOf(NIS2_CLASSIFICATIONS, organization.nis2_classification),
      classificationBasis: organization.classification_basis,
    },
    assessment: {
      id: assessment.id,
      title: assessment.title,
      status: labelOf(ASSESSMENT_STATUSES, assessment.status),
      createdAt: assessment.created_at,
      completedAt: assessment.completed_at,
    },
    catalogue: {
      label: catalogueLabel(version),
      versionLabel: version.version_label,
      sourceTitle: version.source_title,
      sourceUrl: version.source_url,
      scopeNote: version.scope_note,
    },
    items: items.map(({ requirement, answer }) => ({
      code: requirement.code,
      categoryCode: requirement.category_code,
      categoryName: requirement.category_name,
      title: requirement.title,
      description: requirement.description,
      sourceReference: requirement.source_reference,
      status: answer.status,
      justification: answer.justification,
      ownerName: answer.owner_id ? (nameOf.get(answer.owner_id) ?? "Utente non più membro") : null,
      gapSeverity: answer.gap_severity,
      assessedAt: answer.assessed_at,
      resolvedByTasks: answer.resolved_by_tasks,
      answerId: answer.id,
    })),
    tasks: tasks
      .filter((t) => t.assessment_answer_id && answerIds.has(t.assessment_answer_id))
      .map((t) => ({
        title: t.title,
        priority: t.priority,
        status: t.status,
        assigneeName: t.assignee_id ? (nameOf.get(t.assignee_id) ?? "Utente non più membro") : null,
        dueDate: t.due_date,
        answerId: t.assessment_answer_id,
      })),
  });
}
