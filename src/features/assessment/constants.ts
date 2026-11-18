import type { AnswerStatus, AssessmentStatus, GapSeverity, TaskPriority, TaskStatus } from "@/types/database";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "muted";

export const ANSWER_STATUSES: { value: AnswerStatus; label: string; tone: Tone }[] = [
  { value: "not_assessed", label: "Non valutato", tone: "muted" },
  { value: "implemented", label: "Implementato", tone: "success" },
  { value: "partial", label: "Parziale", tone: "warning" },
  { value: "not_implemented", label: "Non implementato", tone: "danger" },
  { value: "not_applicable", label: "Non applicabile", tone: "neutral" },
];

export const GAP_SEVERITIES: { value: GapSeverity; label: string; tone: Tone }[] = [
  { value: "critical", label: "Critica", tone: "danger" },
  { value: "high", label: "Alta", tone: "danger" },
  { value: "medium", label: "Media", tone: "warning" },
  { value: "low", label: "Bassa", tone: "info" },
];

export const ASSESSMENT_STATUSES: { value: AssessmentStatus; label: string; tone: Tone }[] = [
  { value: "draft", label: "Bozza", tone: "muted" },
  { value: "in_progress", label: "In corso", tone: "info" },
  { value: "completed", label: "Completato", tone: "success" },
  { value: "archived", label: "Archiviato", tone: "neutral" },
];

export const TASK_STATUSES: { value: TaskStatus; label: string; tone: Tone }[] = [
  { value: "todo", label: "Da fare", tone: "muted" },
  { value: "in_progress", label: "In corso", tone: "info" },
  { value: "blocked", label: "Bloccata", tone: "danger" },
  { value: "done", label: "Completata", tone: "success" },
  { value: "cancelled", label: "Annullata", tone: "neutral" },
];

export const TASK_PRIORITIES: { value: TaskPriority; label: string; tone: Tone }[] = [
  { value: "critical", label: "Critica", tone: "danger" },
  { value: "high", label: "Alta", tone: "danger" },
  { value: "medium", label: "Media", tone: "warning" },
  { value: "low", label: "Bassa", tone: "info" },
];

export const OPEN_TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "blocked"];
export const GAP_STATUSES: AnswerStatus[] = ["partial", "not_implemented"];
