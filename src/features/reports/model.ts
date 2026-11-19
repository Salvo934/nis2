import {
  ANSWER_STATUSES,
  GAP_SEVERITIES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from "@/features/assessment/constants";
import {
  computeAssessmentMetrics,
  computeCategoryMetrics,
  computeTaskMetrics,
  isOpenTask,
  isOverdue,
  type AssessmentMetrics,
  type TaskMetrics,
} from "@/features/assessment/metrics";
import { AREA_EXPLANATIONS } from "@/features/reports/texts";
import type { AnswerStatus, GapSeverity, TaskPriority, TaskStatus } from "@/types/database";

/** Everything the report needs, already filtered by RLS on the server. */
export type ReportInput = {
  generatedAt: string; // ISO
  generatedBy: string;
  today: string; // YYYY-MM-DD, Europe/Rome
  organization: {
    name: string;
    sector: string;
    sizeClass: string;
    classification: string;
    classificationBasis: string | null;
  };
  assessment: { id: string; title: string; status: string; createdAt: string; completedAt: string | null };
  catalogue: {
    label: string;
    versionLabel: string;
    sourceTitle: string;
    sourceUrl: string | null;
    scopeNote: string | null;
  };
  items: {
    code: string;
    categoryCode: string;
    categoryName: string;
    title: string;
    description: string;
    sourceReference: string;
    status: AnswerStatus;
    justification: string | null;
    ownerName: string | null;
    gapSeverity: GapSeverity | null;
    assessedAt: string | null;
    resolvedByTasks: boolean;
    answerId: string;
  }[];
  tasks: {
    title: string;
    priority: TaskPriority;
    status: TaskStatus;
    assigneeName: string | null;
    dueDate: string | null;
    answerId: string | null;
  }[];
};

const label = <T extends string>(list: readonly { value: T; label: string }[], v: T | null) =>
  v ? (list.find((x) => x.value === v)?.label ?? v) : "—";

const pct = (n: number) => `${n.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export type ReportModel = ReturnType<typeof buildReportModel>;

export function buildReportModel(input: ReportInput) {
  const metrics: AssessmentMetrics = computeAssessmentMetrics(input.items);
  const answerIds = new Set(input.items.map((i) => i.answerId));
  const tasks = input.tasks.filter((t) => t.answerId && answerIds.has(t.answerId));
  const taskMetrics: TaskMetrics = computeTaskMetrics(
    tasks.map((t) => ({ status: t.status, due_date: t.dueDate })),
    input.today,
  );
  const tasksByAnswer = new Map<string, typeof tasks>();
  for (const t of tasks) tasksByAnswer.set(t.answerId!, [...(tasksByAnswer.get(t.answerId!) ?? []), t]);

  // --- Gaps --------------------------------------------------------------------
  const gapItems = input.items
    .filter((i) => i.status === "partial" || i.status === "not_implemented")
    .sort((a, b) => (SEVERITY_RANK[a.gapSeverity ?? ""] ?? 9) - (SEVERITY_RANK[b.gapSeverity ?? ""] ?? 9));
  const gaps = gapItems.map((i) => {
    const linked = tasksByAnswer.get(i.answerId) ?? [];
    const open = linked.filter((t) => isOpenTask(t.status));
    const nextDue =
      open
        .map((t) => t.dueDate)
        .filter((d): d is string => !!d)
        .sort()[0] ?? null;
    return {
      code: i.code,
      title: i.title,
      area: i.categoryName,
      status: label(ANSWER_STATUSES, i.status),
      severity: i.gapSeverity ? label(GAP_SEVERITIES, i.gapSeverity) : "Da classificare",
      justification: i.justification,
      openTasks: open.length,
      totalTasks: linked.length,
      nextDue,
    };
  });
  const highGaps = gapItems.filter((i) => i.gapSeverity === "critical" || i.gapSeverity === "high").length;
  const unclassifiedGaps = gapItems.filter((i) => !i.gapSeverity).length;
  const gapsWithoutOpenTasks = gaps.filter((g) => g.openTasks === 0).length;

  // --- Summary in plain sentences ---------------------------------------------
  const summary: string[] = [];
  summary.push(
    `La valutazione considera ${plural(metrics.total, "requisito", "requisiti")} del catalogo «${input.catalogue.label}». ` +
      (metrics.notApplicable > 0
        ? `${plural(metrics.notApplicable, "è stato dichiarato non applicabile", "sono stati dichiarati non applicabili")}, quindi i requisiti applicabili sono ${metrics.applicable}.`
        : "Tutti i requisiti sono considerati applicabili."),
  );
  summary.push(
    `Sono stati valutati ${metrics.assessed} requisiti su ${metrics.total} (${pct(metrics.assessmentProgress)}).` +
      (metrics.notAssessed > 0
        ? ` ${plural(metrics.notAssessed, "requisito non è ancora stato valutato", "requisiti non sono ancora stati valutati")}: finché la valutazione non è completa, il quadro è parziale.`
        : " La valutazione è completa."),
  );
  summary.push(
    `Dei ${metrics.applicable} requisiti applicabili, ${metrics.implemented} risultano implementati (${pct(metrics.implementationRate)}), ` +
      `${metrics.partial} implementati solo in parte e ${metrics.notImplemented} non implementati.`,
  );
  summary.push(
    metrics.gaps === 0
      ? "Tra i requisiti valutati non risultano lacune da colmare."
      : `Le lacune da colmare sono ${metrics.gaps}` +
          (highGaps > 0 ? `, di cui ${highGaps} con criticità alta o critica` : "") +
          (unclassifiedGaps > 0 ? ` (${unclassifiedGaps} ancora da classificare)` : "") +
          ".",
  );
  summary.push(
    taskMetrics.open === 0
      ? "Non ci sono attività correttive aperte collegate a questo assessment."
      : `Il piano di adeguamento contiene ${plural(taskMetrics.open, "attività aperta", "attività aperte")} collegate a questo assessment` +
          (taskMetrics.overdue > 0
            ? `, di cui ${taskMetrics.overdue} in ritardo rispetto alla scadenza`
            : "") +
          ".",
  );

  // --- Areas ------------------------------------------------------------------
  const areas = computeCategoryMetrics(
    input.items.map((i) => ({
      status: i.status,
      category_code: i.categoryCode,
      category_name: i.categoryName,
    })),
  ).map((c) => ({
    code: c.code,
    name: c.name,
    explanation: AREA_EXPLANATIONS[c.code] ?? "",
    implemented: c.implemented,
    applicable: c.applicable,
    rate: c.implementationRate,
    gaps: c.gaps,
    notAssessed: c.notAssessed,
  }));

  // --- Open tasks -------------------------------------------------------------
  const codeByAnswer = new Map(input.items.map((i) => [i.answerId, i.code]));
  const openTasks = tasks
    .filter((t) => isOpenTask(t.status))
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
    .map((t) => ({
      title: t.title,
      requirement: t.answerId ? (codeByAnswer.get(t.answerId) ?? "—") : "—",
      priority: label(TASK_PRIORITIES, t.priority),
      status: label(TASK_STATUSES, t.status),
      assignee: t.assigneeName ?? "Non assegnata",
      dueDate: t.dueDate,
      overdue: isOverdue({ status: t.status, due_date: t.dueDate }, input.today),
    }));

  // --- Next steps (data-driven, process advice only) --------------------------
  const nextSteps: string[] = [];
  if (metrics.notAssessed > 0) {
    const worst = [...areas].sort((a, b) => b.notAssessed - a.notAssessed)[0];
    nextSteps.push(
      `Completare la valutazione dei ${metrics.notAssessed} requisiti ancora «Non valutati»` +
        (worst && worst.notAssessed > 0
          ? `, partendo dall'area «${worst.name}» (${worst.notAssessed} da valutare).`
          : "."),
    );
  }
  if (unclassifiedGaps > 0) {
    nextSteps.push(
      `Assegnare una criticità alle ${unclassifiedGaps} lacune ancora da classificare, per decidere da quali partire.`,
    );
  }
  if (gapsWithoutOpenTasks > 0) {
    nextSteps.push(
      `Pianificare almeno un'attività correttiva, con responsabile e scadenza, per le ${gapsWithoutOpenTasks} lacune che non ne hanno.`,
    );
  }
  if (taskMetrics.overdue > 0) {
    nextSteps.push(
      `Rivedere le ${taskMetrics.overdue} attività in ritardo: completarle, aggiornarne la scadenza o riassegnarle.`,
    );
  }
  const unassigned = openTasks.filter((t) => t.assignee === "Non assegnata").length;
  if (unassigned > 0)
    nextSteps.push(`Indicare un responsabile per le ${unassigned} attività aperte che non ne hanno.`);
  const withoutOwner = input.items.filter((i) => i.status !== "not_applicable" && !i.ownerName).length;
  if (withoutOwner > 0)
    nextSteps.push(`Indicare un responsabile per i ${withoutOwner} requisiti applicabili che non ne hanno.`);
  nextSteps.push(
    "Conservare le evidenze (documenti, procedure, registri) che dimostrano quanto dichiarato, e aggiornare la valutazione dopo cambiamenti organizzativi, nuovi sistemi o incidenti.",
  );

  // --- Details grouped by area -------------------------------------------------
  const details = areas.map((a) => ({
    name: a.name,
    items: input.items
      .filter((i) => i.categoryCode === a.code)
      .map((i) => ({
        code: i.code,
        description: i.description,
        sourceReference: i.sourceReference,
        status: label(ANSWER_STATUSES, i.status),
        statusValue: i.status,
        justification: i.justification,
        owner: i.ownerName,
        assessedAt: i.assessedAt,
        automatic: i.resolvedByTasks,
      })),
  }));

  const criteria = [
    "Requisiti applicabili = totale dei requisiti − requisiti dichiarati «Non applicabile».",
    "Avanzamento della valutazione = requisiti con stato diverso da «Non valutato» / totale dei requisiti.",
    "Percentuale di implementazione = requisiti «Implementato» / requisiti applicabili. I requisiti «Parziale» contano zero.",
    "Lacune = requisiti «Parziale» + requisiti «Non implementato».",
    "Attività aperte = attività collegate a questo assessment con stato «Da fare», «In corso» o «Bloccata». In ritardo = aperte con scadenza precedente alla data del report.",
    "Un requisito segnato «Implementato» automaticamente lo è perché tutte le attività correttive collegate sono state concluse.",
  ];

  return {
    input,
    metrics,
    taskMetrics,
    summary,
    areas,
    gaps,
    openTasks,
    nextSteps,
    details,
    criteria,
  };
}
