"use server";

import { catalogueLabel } from "@/features/assessment/catalogues";
import { ASSESSMENT_STATUSES } from "@/features/assessment/constants";
import { getAssessment, getVersion, listAssessmentItems } from "@/features/assessment/data";
import { todayInRome } from "@/features/assessment/metrics";
import {
  NIS2_CLASSIFICATIONS,
  ROLES,
  SECTORS,
  SIZE_CLASSES,
  labelOf,
} from "@/features/organizations/constants";
import { getOrganization, listMembers, requireActiveOrganization } from "@/features/organizations/data";
import { dbErrorCode, mapDbError } from "@/features/organizations/errors";
import { uuidSchema } from "@/features/organizations/schemas";
import { listTasks } from "@/features/remediation/data";
import { REPORT_FORMAT_VERSION, type ReportInput } from "@/features/reports/model";
import type { AnswerStatus } from "@/types/database";
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
  // The audit entry id is the report identifier printed on every page.
  const { data: reportId, error: auditError } = await supabase.rpc("log_report_generated", {
    p_assessment: assessment.id,
    p_format: REPORT_FORMAT_VERSION,
  });
  if (auditError || !reportId) {
    if (!auditError) return fail("Non è stato possibile registrare il report.");
    if (!dbErrorCode(auditError)) console.error("[reports] audit", auditError.code);
    return fail(mapDbError(auditError));
  }

  const [organization, version, items, tasks, members] = await Promise.all([
    getOrganization(orgId),
    getVersion(assessment.framework_version_id),
    listAssessmentItems(orgId, assessment),
    listTasks(orgId),
    listMembers(orgId),
  ]);
  if (!organization || !version) return fail("Dati del report non disponibili.");

  const nameOf = new Map(members.map((m) => [m.user_id, m.profile.full_name ?? m.profile.email]));
  const person = (id: string | null) => (id ? (nameOf.get(id) ?? "Utente non più membro") : null);
  const answerIds = new Set(items.map((i) => i.answer.id));
  const PRE_STATUSES: AnswerStatus[] = [
    "not_assessed",
    "implemented",
    "partial",
    "not_implemented",
    "not_applicable",
  ];
  const previousStatus = (pre: unknown): AnswerStatus | null => {
    const s = pre && typeof pre === "object" && "status" in pre ? (pre as { status: unknown }).status : null;
    return PRE_STATUSES.includes(s as AnswerStatus) ? (s as AnswerStatus) : null;
  };

  return ok({
    reportId,
    generatedAt: new Date().toISOString(),
    generatedBy: user.fullName ?? user.email,
    today: todayInRome(),
    organization: {
      name: organization.name,
      sector: labelOf(SECTORS, organization.sector),
      sizeClass: labelOf(SIZE_CLASSES, organization.size_class),
      classification: organization.nis2_classification,
      classificationLabel: labelOf(NIS2_CLASSIFICATIONS, organization.nis2_classification),
      classificationBasis: organization.classification_basis,
      classificationUpdatedAt: organization.classification_updated_at,
    },
    assessment: {
      id: assessment.id,
      title: assessment.title,
      status: assessment.status,
      statusLabel: labelOf(ASSESSMENT_STATUSES, assessment.status),
      createdAt: assessment.created_at,
      createdBy: person(assessment.created_by),
      completedAt: assessment.completed_at,
    },
    catalogue: {
      label: catalogueLabel(version),
      versionLabel: version.version_label,
      sourceTitle: version.source_title,
      sourceUrl: version.source_url,
      sourcePublishedAt: version.source_published_at,
      scopeNote: version.scope_note,
    },
    people: members.map((m) => ({
      name: m.profile.full_name ?? m.profile.email,
      role: labelOf(ROLES, m.role),
    })),
    items: items.map(({ requirement, answer }) => ({
      code: requirement.code,
      categoryCode: requirement.category_code,
      categoryName: requirement.category_name,
      title: requirement.title,
      description: requirement.description,
      sourceReference: requirement.source_reference,
      status: answer.status,
      justification: answer.justification,
      ownerName: person(answer.owner_id),
      gapSeverity: answer.gap_severity,
      assessedAt: answer.assessed_at,
      assessedBy: person(answer.assessed_by),
      resolvedByTasks: answer.resolved_by_tasks,
      preResolutionStatus: previousStatus(answer.pre_resolution),
      answerId: answer.id,
    })),
    tasks: tasks
      .filter((t) => t.assessment_answer_id && answerIds.has(t.assessment_answer_id))
      .map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        priority: t.priority,
        status: t.status,
        assigneeName: person(t.assignee_id),
        dueDate: t.due_date,
        createdAt: t.created_at,
        completedAt: t.completed_at,
        answerId: t.assessment_answer_id,
      })),
  });
}
