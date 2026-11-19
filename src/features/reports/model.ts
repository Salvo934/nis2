import { GAP_SEVERITIES, TASK_PRIORITIES, TASK_STATUSES } from "@/features/assessment/constants";
import { isOpenTask, isOverdue } from "@/features/assessment/metrics";
import {
  AREA_EXPLANATIONS,
  EVIDENCE_UNAVAILABLE,
  IMPLEMENTATION_STATUS_LABELS,
  NOT_AVAILABLE,
  RISKS_UNAVAILABLE,
} from "@/features/reports/texts";
import { formatDate } from "@/lib/format";
import type {
  AnswerStatus,
  AssessmentStatus,
  GapSeverity,
  Nis2Classification,
  TaskPriority,
  TaskStatus,
} from "@/types/database";

/**
 * Report model: every number and sentence of the PDF is computed here, from
 * the records the user can read (RLS). The renderer (pdf.ts) only lays it out.
 *
 * Three indicators are kept strictly apart:
 *   1. declared implementation (self-declared answers),
 *   2. documentary coverage (evidence linked and assessed),
 *   3. verification coverage (evidence verified by a reviewer).
 * The platform has no evidence register, verification workflow or risk
 * register yet: 2 and 3 are reported as "not available", never as 0 % or 100 %.
 */

export const REPORT_FORMAT_VERSION = "2.0";
export const CONFIDENTIALITY = "Riservato – uso interno dell'organizzazione";

/** Capabilities of the platform that the report depends on. */
export const PLATFORM_CAPABILITIES = {
  evidenceRegister: false,
  verificationWorkflow: false,
  riskRegister: false,
  scopeRegister: false,
} as const;

export type ReportInput = {
  /** Identifier of the audit-log entry recorded for this report. */
  reportId: string;
  generatedAt: string; // ISO
  generatedBy: string;
  today: string; // YYYY-MM-DD, Europe/Rome
  organization: {
    name: string;
    sector: string;
    sizeClass: string;
    classification: Nis2Classification;
    classificationLabel: string;
    classificationBasis: string | null;
    classificationUpdatedAt: string | null;
  };
  assessment: {
    id: string;
    title: string;
    status: AssessmentStatus;
    statusLabel: string;
    createdAt: string;
    createdBy: string | null;
    completedAt: string | null;
  };
  catalogue: {
    label: string;
    versionLabel: string;
    sourceTitle: string;
    sourceUrl: string | null;
    sourcePublishedAt: string | null;
    scopeNote: string | null;
  };
  /** Members of the organisation (name and role label). */
  people: { name: string; role: string }[];
  items: {
    answerId: string;
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
    assessedBy: string | null;
    /** Set by the database when completed tasks closed the gap. */
    resolvedByTasks: boolean;
    /** Status declared before the automatic closure, if any. */
    preResolutionStatus: AnswerStatus | null;
  }[];
  tasks: {
    id: string;
    title: string;
    description: string | null;
    priority: TaskPriority;
    status: TaskStatus;
    assigneeName: string | null;
    dueDate: string | null;
    createdAt: string;
    completedAt: string | null;
    answerId: string | null;
  }[];
};

// -----------------------------------------------------------------------------
// Small helpers
// -----------------------------------------------------------------------------
const labelOf = <T extends string>(list: readonly { value: T; label: string }[], v: T) =>
  list.find((x) => x.value === v)?.label ?? v;

/** Percentage with one decimal, or null when the denominator is zero. */
export function ratio(num: number, den: number): number | null {
  return den === 0 ? null : Math.round((num / den) * 1000) / 10;
}
export const formatPct = (value: number | null) =>
  value === null ? NOT_AVAILABLE : `${value.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const statusLabel = (s: AnswerStatus) => IMPLEMENTATION_STATUS_LABELS[s];
export const taskCode = (id: string) => `AC-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
export const reportCode = (id: string) => `RPT-${id.replace(/-/g, "").slice(0, 12).toUpperCase()}`;

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const MAX_JUSTIFICATION = 700;

// Text appended by the database when completed tasks close a gap
// (private.sync_answer_from_tasks).
const AUTO_NOTE =
  /Aggiornato automaticamente il (\d{2}\/\d{2}\/\d{4}): attività correttive completate \(([\s\S]*?)\)\.(?=\s|$)/g;

/**
 * Separates what a person wrote from the notes appended automatically, removes
 * duplicated paragraphs and shortens very long texts (the full text stays in
 * the platform).
 */
export function splitJustification(text: string | null) {
  if (!text?.trim())
    return { declared: null, autoNotes: [] as { date: string; tasks: string }[], truncated: false };
  const autoNotes = new Map<string, { date: string; tasks: string }>();
  for (const m of text.matchAll(AUTO_NOTE))
    autoNotes.set(`${m[1]}|${m[2]}`, { date: m[1]!, tasks: m[2]!.trim() });
  const paragraphs = text
    .replace(AUTO_NOTE, "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  let declared: string | null = [...new Set(paragraphs)].join("\n\n") || null;
  let truncated = false;
  if (declared && declared.length > MAX_JUSTIFICATION) {
    declared = `${declared.slice(0, MAX_JUSTIFICATION).replace(/\s+\S*$/, "")} […]`;
    truncated = true;
  }
  return { declared, autoNotes: [...autoNotes.values()], truncated };
}

/** "Direttiva (UE) 2022/2555, art. 21, par. 2, lett. a)" -> "Direttiva (UE) 2022/2555, art. 21". */
export function normalizeReference(sourceReference: string): string[] {
  return sourceReference
    .split(" · ")
    .map((part) => /^(.*?, (?:art\. \d+|All\. \d+))/.exec(part.trim())?.[1] ?? part.trim());
}
const unique = (values: string[]) => [...new Set(values)];

export type CatalogueKind = "eu_directive" | "acn_basic" | "other";
export function catalogueKind(sourceTitle: string): CatalogueKind {
  if (/^Direttiva \(UE\) 2022\/2555/.test(sourceTitle)) return "eu_directive";
  if (/Misure di sicurezza di base/i.test(sourceTitle)) return "acn_basic";
  return "other";
}

const KIND_STATEMENT: Record<CatalogueKind, string> = {
  eu_directive:
    "Questa è una valutazione basata sul testo della Direttiva (UE) 2022/2555 (catalogo sintetico degli articoli indicati). Non è una verifica delle misure di sicurezza di base adottate dall'ACN né degli obblighi del D.Lgs. 138/2024 di recepimento: il completamento di questo catalogo non equivale alla conformità agli obblighi nazionali italiani.",
  acn_basic:
    "Questa è una valutazione basata sulle misure di sicurezza di base adottate dall'ACN in attuazione del D.Lgs. 138/2024, per la sola categoria di soggetti indicata nel catalogo. Gli obblighi del D.Lgs. 138/2024 che non compaiono nel registro dei requisiti non sono valutati in questo report.",
  other: "Il report copre esclusivamente i requisiti del catalogo indicato.",
};

// -----------------------------------------------------------------------------
// Model
// -----------------------------------------------------------------------------
export type ReportModel = ReturnType<typeof buildReportModel>;

export function buildReportModel(input: ReportInput) {
  const { items } = input;
  const answerIds = new Set(items.map((i) => i.answerId));
  // Only tasks linked to this assessment's answers (defence in depth: the
  // server already filters them).
  const tasks = input.tasks.filter((t) => t.answerId !== null && answerIds.has(t.answerId));
  const tasksByAnswer = new Map<string, typeof tasks>();
  for (const t of tasks) tasksByAnswer.set(t.answerId!, [...(tasksByAnswer.get(t.answerId!) ?? []), t]);
  const codeByAnswer = new Map(items.map((i) => [i.answerId, i.code]));

  // --- Counts -------------------------------------------------------------------
  const count = (s: AnswerStatus) => items.filter((i) => i.status === s).length;
  const total = items.length;
  const notApplicable = count("not_applicable");
  const applicable = total - notApplicable;
  const notAssessed = count("not_assessed");
  const implemented = count("implemented");
  const implementedAuto = items.filter((i) => i.status === "implemented" && i.resolvedByTasks).length;
  const partial = count("partial");
  const notImplemented = count("not_implemented");
  const assessed = total - notAssessed;
  const gapsCount = partial + notImplemented;
  const missingJustification = items.filter(
    (i) => i.status !== "not_assessed" && !splitJustification(i.justification).declared,
  ).length;
  const openTaskList = tasks.filter((t) => isOpenTask(t.status));
  const overdueTasks = openTaskList.filter((t) =>
    isOverdue({ status: t.status, due_date: t.dueDate }, input.today),
  );

  const counts = {
    total,
    applicable,
    notApplicable,
    assessed,
    notAssessed,
    implemented,
    implementedAuto,
    partial,
    notImplemented,
    gaps: gapsCount,
    openTasks: openTaskList.length,
    overdueTasks: overdueTasks.length,
    missingJustification,
  };

  // --- Indicators ------------------------------------------------------------------
  // With nothing assessed the declared level is not determinable (not 0 %).
  const declaredRate = assessed === 0 ? null : ratio(implemented, applicable);
  const indicators = [
    {
      key: "declared",
      title: "Implementazione dichiarata",
      available: declaredRate !== null,
      value: formatPct(declaredRate),
      detail:
        assessed === 0
          ? "nessun requisito valutato"
          : applicable === 0
            ? "nessun requisito applicabile"
            : `${implemented} su ${applicable} applicabili`,
      formula: "Requisiti dichiarati «Implementato» / requisiti applicabili",
      meaning:
        "Quanto l'organizzazione dichiara di aver messo in atto. I requisiti parziali e quelli non valutati contano zero. È un'autodichiarazione, non una verifica.",
    },
    {
      key: "documentary",
      title: "Copertura documentale",
      available: PLATFORM_CAPABILITIES.evidenceRegister,
      value: "Non disponibile",
      detail: "registro delle evidenze non gestito",
      formula: "Requisiti applicabili con evidenze associate e valutate / requisiti applicabili",
      meaning:
        "Per quanti requisiti esistono documenti che supportano la dichiarazione. Non calcolabile: la piattaforma non registra ancora evidenze.",
    },
    {
      key: "verification",
      title: "Copertura delle verifiche",
      available: PLATFORM_CAPABILITIES.verificationWorkflow,
      value: "Non disponibile",
      detail: "processo di verifica non gestito",
      formula: "Requisiti applicabili verificati e approvati da un verificatore / requisiti applicabili",
      meaning:
        "Per quanti requisiti un verificatore ha esaminato le evidenze con esito positivo. Non calcolabile: la piattaforma non gestisce ancora le verifiche.",
    },
  ];
  const assessmentProgress = ratio(assessed, total);

  const distribution = (
    [
      ["implemented", implemented],
      ["partial", partial],
      ["not_implemented", notImplemented],
      ["not_assessed", notAssessed],
      ["not_applicable", notApplicable],
    ] as const
  ).map(([status, n]) => ({ status, label: statusLabel(status), count: n }));

  // --- Classification ------------------------------------------------------------
  const classificationDetermined =
    input.organization.classification === "essential" || input.organization.classification === "important";
  const classificationText =
    input.organization.classification === "not_determined"
      ? "Classificazione non determinata"
      : `${input.organization.classificationLabel} – dichiarata dall'organizzazione, non verificata dal software`;
  const classificationSource =
    input.organization.classification === "not_determined"
      ? "Nessuna classificazione registrata"
      : [
          input.organization.classificationBasis
            ? `Motivazione registrata: ${input.organization.classificationBasis}`
            : "Motivazione non registrata",
          input.organization.classificationUpdatedAt
            ? `aggiornata il ${formatDate(input.organization.classificationUpdatedAt)}`
            : null,
        ]
          .filter(Boolean)
          .join(", ");

  const kind = catalogueKind(input.catalogue.sourceTitle);
  const catalogueSubject = /soggetti (importanti|essenziali)/.exec(input.catalogue.label)?.[1] ?? null;
  const declaredSubject =
    input.organization.classification === "important"
      ? "importanti"
      : input.organization.classification === "essential"
        ? "essenziali"
        : null;

  // --- Consistency notes and limitations --------------------------------------------
  const notes: string[] = [];
  if (total === 0) notes.push("L'assessment non contiene requisiti: il report non contiene risultati.");
  if (assessed === 0 && total > 0)
    notes.push(
      "Nessun requisito è stato ancora valutato: gli indicatori non descrivono lo stato dell'organizzazione.",
    );
  else if (notAssessed > 0)
    notes.push(
      `${plural(notAssessed, "requisito non è stato valutato", "requisiti non sono stati valutati")} su ${total}: i risultati sono parziali e i requisiti non valutati non sono contati come implementati.`,
    );
  if (input.assessment.status !== "completed" && total > 0 && notAssessed === 0)
    notes.push(
      `Tutti i requisiti risultano valutati, ma l'assessment è nello stato «${input.assessment.statusLabel}»: non è stato chiuso formalmente e i risultati possono ancora cambiare.`,
    );
  if (input.assessment.status === "completed" && notAssessed > 0)
    notes.push(
      `L'assessment è nello stato «Completato» ma ${plural(notAssessed, "requisito risulta", "requisiti risultano")} non valutati.`,
    );
  if (implementedAuto > 0)
    notes.push(
      `${plural(implementedAuto, "requisito risulta", "requisiti risultano")} «Implementato» per aggiornamento automatico al completamento delle attività correttive collegate: l'efficacia delle misure non è stata verificata.`,
    );
  if (missingJustification > 0)
    notes.push(
      `${plural(missingJustification, "requisito valutato è privo", "requisiti valutati sono privi")} di motivazione registrata.`,
    );

  const limitations: string[] = [];
  if (!classificationDetermined)
    limitations.push(
      input.organization.classification === "not_in_scope"
        ? "L'organizzazione si è dichiarata fuori dall'ambito NIS2: la scelta del catalogo e l'applicabilità dei requisiti non sono state verificate rispetto alla classificazione."
        : "Classificazione NIS2 non determinata: non è possibile confermare che il catalogo selezionato sia quello applicabile all'organizzazione.",
    );
  if (catalogueSubject && declaredSubject && catalogueSubject !== declaredSubject)
    limitations.push(
      `La classificazione dichiarata (soggetto ${declaredSubject.replace(/i$/, "e")}) non corrisponde al catalogo selezionato (misure per i soggetti ${catalogueSubject}).`,
    );
  if (kind === "eu_directive")
    limitations.push(
      "Il catalogo è basato sulla Direttiva (UE) 2022/2555: non copre le misure di base ACN né gli altri obblighi del D.Lgs. 138/2024.",
    );
  limitations.push(
    "Le valutazioni sono autodichiarazioni dell'organizzazione: nessuna evidenza documentale e nessuna verifica indipendente sono registrate nella piattaforma.",
    "Non è incluso un registro dei rischi: il report non contiene un'analisi dei rischi.",
    "Il perimetro di sistemi, processi e servizi non è registrato nella piattaforma.",
  );
  if (notAssessed > 0)
    limitations.push(
      `${plural(notAssessed, "requisito non è stato valutato", "requisiti non sono stati valutati")}.`,
    );
  if (implementedAuto > 0)
    limitations.push(
      "La piattaforma aggiorna automaticamente a «Implementato» i requisiti le cui attività correttive sono tutte completate; questi esiti non rappresentano una verifica di efficacia.",
    );

  // --- Scope & methodology --------------------------------------------------------
  const assessedDates = items
    .map((i) => i.assessedAt)
    .filter((d): d is string => !!d)
    .sort();
  const involved = new Set(
    [
      input.assessment.createdBy,
      ...items.map((i) => i.assessedBy),
      ...items.map((i) => i.ownerName),
      ...tasks.map((t) => t.assigneeName),
    ].filter((n): n is string => !!n),
  );
  const people = input.people.filter((p) => involved.has(p.name));
  const scope = {
    kindStatement: KIND_STATEMENT[kind],
    includedReferences: unique(items.flatMap((i) => normalizeReference(i.sourceReference))),
    period: `dal ${formatDate(input.assessment.createdAt)} ${
      input.assessment.completedAt
        ? `al ${formatDate(input.assessment.completedAt)} (chiusura dell'assessment)`
        : `alla data del report (assessment non chiuso)`
    }`,
    assessedWindow:
      assessedDates.length > 0
        ? `Valutazioni registrate tra il ${formatDate(assessedDates[0]!)} e il ${formatDate(assessedDates.at(-1)!)}.`
        : "Nessuna valutazione registrata.",
    method:
      "Autovalutazione: per ciascun requisito un membro dell'organizzazione registra lo stato di attuazione, la motivazione, il responsabile e, per le lacune, una gravità. Le azioni correttive sono pianificate nel piano di adeguamento. Non sono registrate evidenze né verifiche indipendenti.",
    perimeter: PLATFORM_CAPABILITIES.scopeRegister
      ? ""
      : "Non registrati: la piattaforma non gestisce il perimetro di sistemi, processi e servizi oggetto della valutazione.",
    people,
  };

  // --- Areas ------------------------------------------------------------------------
  const areaCodes = unique(items.map((i) => i.categoryCode));
  const areas = areaCodes.map((code) => {
    const list = items.filter((i) => i.categoryCode === code);
    const c = (s: AnswerStatus) => list.filter((i) => i.status === s).length;
    const areaApplicable = list.length - c("not_applicable");
    const areaAnswerIds = new Set(list.map((i) => i.answerId));
    return {
      code,
      name: list[0]!.categoryName,
      explanation: AREA_EXPLANATIONS[code] ?? "",
      reference: unique(list.flatMap((i) => normalizeReference(i.sourceReference))).join("; "),
      total: list.length,
      applicable: areaApplicable,
      // Applicable requirements already assessed: implemented + partial + not implemented.
      assessed: areaApplicable - c("not_assessed"),
      implemented: c("implemented"),
      partial: c("partial"),
      notImplemented: c("not_implemented"),
      notAssessed: c("not_assessed"),
      notApplicable: c("not_applicable"),
      gaps: c("partial") + c("not_implemented"),
      openTasks: openTaskList.filter((t) => areaAnswerIds.has(t.answerId!)).length,
      rate: ratio(c("implemented"), areaApplicable),
    };
  });

  // --- Gap analysis -------------------------------------------------------------------
  const gapItems = items
    .filter((i) => i.status === "partial" || i.status === "not_implemented")
    .sort(
      (a, b) =>
        (SEVERITY_RANK[a.gapSeverity ?? ""] ?? 9) - (SEVERITY_RANK[b.gapSeverity ?? ""] ?? 9) ||
        a.code.localeCompare(b.code, "it", { numeric: true }),
    );
  const gaps = gapItems.map((i) => {
    const linked = tasksByAnswer.get(i.answerId) ?? [];
    return {
      code: i.code,
      title: i.title,
      description: splitJustification(i.justification).declared,
      currentStatus: statusLabel(i.status),
      expectedStatus: "Implementato",
      severity: i.gapSeverity ? labelOf(GAP_SEVERITIES, i.gapSeverity) : "Non classificata",
      severityValue: i.gapSeverity,
      owner: i.ownerName,
      actions: linked.map((t) => ({
        code: taskCode(t.id),
        status: labelOf(TASK_STATUSES, t.status),
        dueDate: t.dueDate,
        overdue: isOverdue({ status: t.status, due_date: t.dueDate }, input.today),
      })),
    };
  });
  const severeGaps = gapItems.filter((i) => i.gapSeverity === "critical" || i.gapSeverity === "high");
  const unclassifiedGaps = gapItems.filter((i) => !i.gapSeverity).length;
  const gapsWithoutOpenTasks = gapItems.filter(
    (i) => !(tasksByAnswer.get(i.answerId) ?? []).some((t) => isOpenTask(t.status)),
  ).length;

  const autoClosed = items
    .filter((i) => i.status === "implemented" && i.resolvedByTasks)
    .map((i) => {
      const note = splitJustification(i.justification).autoNotes.at(-1);
      return {
        code: i.code,
        title: i.title,
        previousStatus: i.preResolutionStatus ? statusLabel(i.preResolutionStatus) : NOT_AVAILABLE,
        closedOn: note?.date ?? NOT_AVAILABLE,
        tasks: (tasksByAnswer.get(i.answerId) ?? []).map((t) => taskCode(t.id)).join(", ") || "—",
      };
    });
  const verificationGap = {
    declaredUnverified: implemented,
    autoClosed,
  };

  // --- Remediation plan ------------------------------------------------------------
  const STATUS_ORDER: Record<TaskStatus, number> = {
    blocked: 1,
    in_progress: 1,
    todo: 1,
    done: 2,
    cancelled: 3,
  };
  const plan = [...tasks]
    .map((t) => ({ t, overdue: isOverdue({ status: t.status, due_date: t.dueDate }, input.today) }))
    .sort(
      (a, b) =>
        Number(b.overdue) - Number(a.overdue) ||
        STATUS_ORDER[a.t.status] - STATUS_ORDER[b.t.status] ||
        (a.t.dueDate ?? "9999").localeCompare(b.t.dueDate ?? "9999"),
    )
    .map(({ t, overdue }) => ({
      code: taskCode(t.id),
      requirement: codeByAnswer.get(t.answerId!) ?? "—",
      title: t.title,
      description: t.description?.trim() || null,
      priority: labelOf(TASK_PRIORITIES, t.priority),
      priorityValue: t.priority,
      assignee: t.assigneeName,
      openedAt: t.createdAt,
      dueDate: t.dueDate,
      completedAt: t.completedAt,
      status: labelOf(TASK_STATUSES, t.status),
      statusValue: t.status,
      overdue,
      completionEvidence: PLATFORM_CAPABILITIES.evidenceRegister ? "" : "Non registrate",
      effectiveness:
        t.status === "done"
          ? "Non verificata"
          : t.status === "cancelled"
            ? "Non applicabile"
            : "In attesa del completamento",
    }));

  // --- Recommendations (process advice derived from the data) ----------------------
  const recommendations: string[] = [];
  if (severeGaps.length > 0)
    recommendations.push(
      `Dare priorità alle ${plural(severeGaps.length, "lacuna", "lacune")} con gravità critica o alta: ${severeGaps
        .slice(0, 6)
        .map((g) => g.code)
        .join(", ")}${severeGaps.length > 6 ? "…" : ""}.`,
    );
  if (overdueTasks.length > 0)
    recommendations.push(
      `Rivedere ${overdueTasks.length === 1 ? "l'attività in ritardo" : `le ${overdueTasks.length} attività in ritardo`} (${overdueTasks
        .slice(0, 6)
        .map((t) => taskCode(t.id))
        .join(", ")}): completarle, aggiornarne la scadenza o riassegnarle.`,
    );
  if (gapsWithoutOpenTasks > 0)
    recommendations.push(
      `Pianificare almeno un'azione correttiva, con responsabile e scadenza, per ${plural(gapsWithoutOpenTasks, "lacuna", "lacune")} senza azioni correttive aperte.`,
    );
  if (unclassifiedGaps > 0)
    recommendations.push(
      `Attribuire una gravità a ${plural(unclassifiedGaps, "lacuna", "lacune")} non ancora classificate.`,
    );
  if (notAssessed > 0) {
    const worst = [...areas].sort((a, b) => b.notAssessed - a.notAssessed)[0];
    recommendations.push(
      `Completare la valutazione di ${plural(notAssessed, "requisito", "requisiti")} «Non valutato»` +
        (worst && worst.notAssessed > 0
          ? `, a partire dall'area «${worst.name}» (${worst.notAssessed}).`
          : "."),
    );
  }
  if (missingJustification > 0)
    recommendations.push(
      `Registrare la motivazione per ${plural(missingJustification, "requisito valutato che ne è privo", "requisiti valutati che ne sono privi")}, così che l'esito sia comprensibile a chi legge.`,
    );
  if (implementedAuto > 0)
    recommendations.push(
      `Verificare l'efficacia delle misure per ${plural(implementedAuto, "requisito chiuso", "requisiti chiusi")} automaticamente al completamento delle attività (${autoClosed
        .slice(0, 6)
        .map((a) => a.code)
        .join(", ")}${autoClosed.length > 6 ? "…" : ""}).`,
    );
  if (implemented > 0)
    recommendations.push(
      `Raccogliere le evidenze documentali per ${plural(implemented, "requisito dichiarato implementato", "requisiti dichiarati implementati")}, che oggi risultano non verificati.`,
    );
  const unassignedTasks = openTaskList.filter((t) => !t.assigneeName).length;
  if (unassignedTasks > 0)
    recommendations.push(
      `Indicare un responsabile per ${plural(unassignedTasks, "attività aperta che non ne ha", "attività aperte che non ne hanno")}.`,
    );
  const withoutOwner = items.filter((i) => i.status !== "not_applicable" && !i.ownerName).length;
  if (withoutOwner > 0)
    recommendations.push(
      `Indicare un responsabile per ${plural(withoutOwner, "requisito applicabile che non ne ha", "requisiti applicabili che non ne hanno")}.`,
    );
  if (input.organization.classification === "not_determined")
    recommendations.push(
      "Determinare e registrare la classificazione NIS2 dell'organizzazione, con la relativa motivazione, e confermare che il catalogo selezionato sia coerente.",
    );
  if (input.assessment.status !== "completed" && total > 0 && notAssessed === 0)
    recommendations.push("Chiudere formalmente l'assessment, se le valutazioni sono definitive.");

  // --- Executive narrative ----------------------------------------------------------
  const narrative: string[] = [];
  if (total === 0 || assessed === 0) {
    narrative.push(
      `L'assessment «${input.assessment.title}» non contiene ancora valutazioni: il livello di implementazione dichiarato non è determinabile. Il presente report non costituisce una certificazione di conformità.`,
    );
  } else if (applicable === 0) {
    narrative.push(
      "Tutti i requisiti del catalogo sono stati dichiarati non applicabili: il livello di implementazione non è determinabile. Il presente report non costituisce una certificazione di conformità.",
    );
  } else {
    narrative.push(
      `Il livello di implementazione dichiarato dall'organizzazione è pari al ${formatPct(declaredRate)} dei requisiti applicabili del catalogo selezionato (${implemented} su ${applicable}). ` +
        `La verifica documentale non è disponibile: nessun requisito risulta verificato mediante evidenze. Il presente report non costituisce una certificazione di conformità.`,
    );
    narrative.push(
      `Sono stati valutati ${assessed} requisiti su ${total} (${formatPct(assessmentProgress)}); ` +
        `${plural(partial, "risulta parzialmente implementato", "risultano parzialmente implementati")}, ${notImplemented} non implementati` +
        (notApplicable > 0 ? ` e ${notApplicable} dichiarati non applicabili.` : "."),
    );
    narrative.push(
      gapsCount === 0
        ? "Tra i requisiti valutati non risultano lacune di implementazione."
        : `Le lacune aperte sono ${gapsCount}` +
            (severeGaps.length > 0 ? `, di cui ${severeGaps.length} con gravità critica o alta` : "") +
            (unclassifiedGaps > 0 ? ` e ${unclassifiedGaps} non classificate` : "") +
            `. Le azioni correttive aperte sono ${openTaskList.length}` +
            (overdueTasks.length > 0
              ? `, di cui ${plural(overdueTasks.length, "scaduta", "scadute")}.`
              : "."),
    );
  }

  // --- Conclusions -------------------------------------------------------------------
  const conclusions = [
    {
      title: "Risultati dichiarati",
      text:
        assessed === 0
          ? "Nessuna valutazione registrata."
          : `Implementazione dichiarata: ${formatPct(declaredRate)} dei requisiti applicabili (${implemented}/${applicable}); ${partial} parziali, ${notImplemented} non implementati, ${notAssessed} non valutati.`,
    },
    {
      title: "Risultati verificati",
      text: "Nessuno: la piattaforma non registra evidenze né verifiche. Tutti gli esiti sono autodichiarazioni.",
    },
    {
      title: "Criticità",
      text:
        severeGaps.length === 0 && overdueTasks.length === 0
          ? "Nessuna lacuna con gravità critica o alta e nessuna attività scaduta."
          : `${plural(severeGaps.length, "lacuna", "lacune")} con gravità critica o alta; ${plural(overdueTasks.length, "attività scaduta", "attività scadute")}.`,
    },
    {
      title: "Azioni ancora necessarie",
      text:
        recommendations.length === 0
          ? "Nessuna azione derivata dai dati."
          : `${plural(recommendations.length, "raccomandazione operativa", "raccomandazioni operative")} (sezione 9).`,
    },
    {
      title: "Perimetro normativo",
      text: `${input.catalogue.label} – versione ${input.catalogue.versionLabel}.`,
    },
  ];

  // --- Requirement register ------------------------------------------------------------
  const register = areas.map((a) => ({
    code: a.code,
    name: a.name,
    items: items
      .filter((i) => i.categoryCode === a.code)
      .map((i) => {
        const j = splitJustification(i.justification);
        const linked = tasksByAnswer.get(i.answerId) ?? [];
        return {
          code: i.code,
          title: i.title,
          description: i.description,
          sourceReference: i.sourceReference,
          applicability: i.status === "not_applicable" ? "Non applicabile (dichiarato)" : "Applicabile",
          status: statusLabel(i.status),
          statusValue: i.status,
          automatic: i.resolvedByTasks && i.status === "implemented",
          previousStatus: i.preResolutionStatus ? statusLabel(i.preResolutionStatus) : null,
          justification: j.declared,
          justificationTruncated: j.truncated,
          autoNote: j.autoNotes.at(-1) ?? null,
          owner: i.ownerName,
          assessedAt: i.assessedAt,
          assessedBy: i.assessedBy,
          severity: i.gapSeverity ? labelOf(GAP_SEVERITIES, i.gapSeverity) : null,
          evidence: "Nessuna evidenza registrata",
          verification: i.status === "not_applicable" ? "Non applicabile alla verifica" : "Non verificato",
          verifier: "nessun verificatore registrato",
          // ACN titles are truncations of the official text: show them only
          // when they add something (e.g. the editorial labels of the directive).
          showTitle: !i.description.includes(i.title.replace(/…$/, "").trim()),
          risks: "Non registrati",
          actions: linked.map((t) => ({
            code: taskCode(t.id),
            title: t.title,
            status: labelOf(TASK_STATUSES, t.status),
            dueDate: t.dueDate,
          })),
        };
      }),
  }));

  const criteria = [
    "Requisiti applicabili = requisiti del catalogo − requisiti dichiarati «Non applicabile».",
    "Requisiti valutati = requisiti con stato diverso da «Non valutato». Avanzamento della valutazione = valutati / requisiti del catalogo.",
    "Implementazione dichiarata = requisiti «Implementato» / requisiti applicabili. «Parzialmente implementato» e «Non valutato» contano zero. Con zero requisiti applicabili il valore è «Dato non disponibile».",
    "Copertura documentale = requisiti applicabili con evidenze associate e valutate / requisiti applicabili. Non calcolata: registro delle evidenze non disponibile.",
    "Copertura delle verifiche = requisiti applicabili verificati e approvati / requisiti applicabili. Non calcolata: processo di verifica non disponibile. La sola presenza di un documento non rende un requisito «Verificato».",
    "Lacune di implementazione = requisiti «Parzialmente implementato» + «Non implementato». Un requisito dichiarato implementato ma non verificato è una carenza di verifica, non una lacuna di implementazione.",
    "Azioni correttive considerate = attività collegate ai requisiti di questo assessment. Aperte = «Da fare», «In corso», «Bloccata». Scadute = aperte con scadenza precedente alla data del report.",
    "Il completamento di un'azione correttiva non equivale alla verifica della sua efficacia: le attività completate sono riportate con efficacia «Non verificata».",
    "Le percentuali sono arrotondate a un decimale.",
  ];

  return {
    input,
    formatVersion: REPORT_FORMAT_VERSION,
    reportCode: reportCode(input.reportId),
    confidentiality: CONFIDENTIALITY,
    classification: {
      determined: classificationDetermined,
      text: classificationText,
      source: classificationSource,
    },
    counts,
    indicators,
    assessmentProgress,
    distribution,
    notes,
    limitations,
    narrative,
    severeGaps: severeGaps.map((g) => ({
      code: g.code,
      title: g.title,
      severity: labelOf(GAP_SEVERITIES, g.gapSeverity!),
    })),
    scope,
    areas,
    gaps,
    verificationGap,
    plan,
    evidence: { available: PLATFORM_CAPABILITIES.evidenceRegister, message: EVIDENCE_UNAVAILABLE },
    risks: { available: PLATFORM_CAPABILITIES.riskRegister, message: RISKS_UNAVAILABLE },
    recommendations,
    conclusions,
    register,
    criteria,
  };
}
