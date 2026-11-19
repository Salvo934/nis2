import catalogue from "../../../data/catalogs/acn-379907-2025-allegato-1.json";
import dataset from "../../../data/demo/rossi-logistica.json";
import { catalogueLabel } from "@/features/assessment/catalogues";
import { NIS2_CLASSIFICATIONS, SECTORS, SIZE_CLASSES, labelOf } from "@/features/organizations/constants";
import type { ReportInput } from "@/features/reports/model";
import type {
  AnswerStatus,
  GapSeverity,
  Nis2Classification,
  TaskPriority,
  TaskStatus,
} from "@/types/database";

/**
 * Report input for the downloadable sample PDF, built from the SAME dataset
 * the database uses for "Prova la demo" (data/demo/rossi-logistica.json) and
 * mirroring what the database does with it (including the automatic closure
 * of a gap whose actions are all completed). Pure: dates are relative to `today`.
 */
export function buildSampleReportInput(today: string, generatedAt: string): ReportInput {
  const addDays = (days: number) => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const owner = "Visitatore demo";
  const createdAt = `${addDays(-14)}T09:00:00Z`;
  const assessedAt = `${addDays(-7)}T10:00:00Z`;

  const answers = new Map(dataset.answers.map((a) => [a.code, a]));
  const tasks: ReportInput["tasks"] = dataset.tasks.map((t, i) => ({
    id: `${String(i + 1).padStart(8, "0")}-demo-4000-8000-000000000000`,
    title: t.title,
    description: t.description,
    priority: t.priority as TaskPriority,
    status: t.status as TaskStatus,
    assigneeName: owner,
    dueDate: addDays(t.due_in_days),
    createdAt,
    completedAt: t.status === "done" ? `${addDays(-2)}T16:00:00Z` : null,
    answerId: `answer-${t.code}`,
  }));

  const items: ReportInput["items"] = catalogue.requirements.map((r) => {
    const a = answers.get(r.code);
    const linked = tasks.filter((t) => t.answerId === `answer-${r.code}`);
    const declared = (a?.status ?? "not_assessed") as AnswerStatus;
    // Same rule as private.sync_answer_from_tasks: a gap whose actions are
    // all completed becomes "implemented", keeping the previous answer.
    const autoClosed =
      (declared === "partial" || declared === "not_implemented") &&
      linked.length > 0 &&
      linked.every((t) => t.status === "done" || t.status === "cancelled") &&
      linked.some((t) => t.status === "done");
    const [dd, mm, yyyy] = [addDays(-2).slice(8, 10), addDays(-2).slice(5, 7), addDays(-2).slice(0, 4)];
    return {
      answerId: `answer-${r.code}`,
      code: r.code,
      categoryCode: r.category_code,
      categoryName: r.category_name,
      title: r.title,
      description: r.description,
      sourceReference: r.source_reference,
      status: autoClosed ? "implemented" : declared,
      justification: autoClosed
        ? `${a!.justification}\n\nAggiornato automaticamente il ${dd}/${mm}/${yyyy}: attività correttive completate (${linked
            .filter((t) => t.status === "done")
            .map((t) => t.title)
            .join("; ")}).`
        : (a?.justification ?? null),
      ownerName: a ? owner : null,
      gapSeverity: autoClosed
        ? null
        : ((a && "gap_severity" in a ? a.gap_severity : null) as GapSeverity | null),
      assessedAt: a ? assessedAt : null,
      assessedBy: a ? owner : null,
      resolvedByTasks: autoClosed,
      preResolutionStatus: autoClosed ? declared : null,
    };
  });

  const classification = dataset.organization.nis2_classification as Nis2Classification;
  return {
    reportId: "00000000-0000-4000-8000-00000000e5e1",
    generatedAt,
    generatedBy: `${owner} (report di esempio)`,
    today,
    organization: {
      name: `${dataset.organization.name} – azienda fittizia`,
      sector: labelOf(SECTORS, dataset.organization.sector as (typeof SECTORS)[number]["value"]),
      sizeClass: labelOf(
        SIZE_CLASSES,
        dataset.organization.size_class as (typeof SIZE_CLASSES)[number]["value"],
      ),
      classification,
      classificationLabel: labelOf(NIS2_CLASSIFICATIONS, classification),
      classificationBasis: dataset.organization.classification_basis,
      classificationUpdatedAt: createdAt,
    },
    assessment: {
      id: "demo",
      title: dataset.assessment.title,
      status: "in_progress",
      statusLabel: "In corso",
      createdAt,
      createdBy: owner,
      completedAt: null,
    },
    catalogue: {
      label: catalogueLabel(catalogue.version),
      versionLabel: catalogue.version.version_label,
      sourceTitle: catalogue.version.source_title,
      sourceUrl: catalogue.version.source_url,
      sourcePublishedAt: null,
      scopeNote: catalogue.version.scope_note,
    },
    people: [{ name: owner, role: "Amministratore" }],
    items,
    tasks,
  };
}
