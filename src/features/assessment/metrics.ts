import type { AnswerStatus, TaskStatus } from "@/types/database";

/**
 * Pure metric calculations. Every number shown in the UI comes from here, and
 * each one documents its numerator and denominator. These are progress
 * indicators on self-declared answers, NOT a measure of legal compliance.
 */

export type AnswerLike = { status: AnswerStatus; category_code?: string; category_name?: string };

export type AssessmentMetrics = {
  total: number;
  notApplicable: number;
  /** total − not applicable */
  applicable: number;
  notAssessed: number;
  implemented: number;
  partial: number;
  notImplemented: number;
  /** answers with a status other than "not assessed" */
  assessed: number;
  /** assessed / total (0–100) */
  assessmentProgress: number;
  /** implemented / applicable (0–100); partial counts as 0 */
  implementationRate: number;
  /** partial + not implemented */
  gaps: number;
};

const pct = (num: number, den: number) => (den === 0 ? 0 : Math.round((num / den) * 1000) / 10);

export function computeAssessmentMetrics(answers: AnswerLike[]): AssessmentMetrics {
  const count = (status: AnswerStatus) => answers.filter((a) => a.status === status).length;
  const total = answers.length;
  const notApplicable = count("not_applicable");
  const notAssessed = count("not_assessed");
  const implemented = count("implemented");
  const partial = count("partial");
  const notImplemented = count("not_implemented");
  const applicable = total - notApplicable;
  const assessed = total - notAssessed;
  return {
    total,
    notApplicable,
    applicable,
    notAssessed,
    implemented,
    partial,
    notImplemented,
    assessed,
    assessmentProgress: pct(assessed, total),
    implementationRate: pct(implemented, applicable),
    gaps: partial + notImplemented,
  };
}

export type CategoryMetrics = { code: string; name: string } & AssessmentMetrics;

export function computeCategoryMetrics(answers: Required<AnswerLike>[]): CategoryMetrics[] {
  const groups = new Map<string, Required<AnswerLike>[]>();
  for (const a of answers) {
    const list = groups.get(a.category_code) ?? [];
    list.push(a);
    groups.set(a.category_code, list);
  }
  return [...groups.entries()].map(([code, list]) => ({
    code,
    name: list[0]!.category_name,
    ...computeAssessmentMetrics(list),
  }));
}

export type TaskLike = { status: TaskStatus; due_date: string | null };

export type TaskMetrics = {
  open: number;
  overdue: number;
  dueSoon: number;
  done: number;
};

/** `today` as YYYY-MM-DD in the organisation's time zone (Europe/Rome). */
export function todayInRome(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(now);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isOpenTask(status: TaskStatus): boolean {
  return status === "todo" || status === "in_progress" || status === "blocked";
}

export function isOverdue(task: TaskLike, today: string): boolean {
  return isOpenTask(task.status) && task.due_date !== null && task.due_date < today;
}

export function computeTaskMetrics(tasks: TaskLike[], today: string, horizonDays = 30): TaskMetrics {
  const horizon = addDays(today, horizonDays);
  const open = tasks.filter((t) => isOpenTask(t.status));
  return {
    open: open.length,
    overdue: open.filter((t) => t.due_date !== null && t.due_date < today).length,
    dueSoon: open.filter((t) => t.due_date !== null && t.due_date >= today && t.due_date <= horizon).length,
    done: tasks.filter((t) => t.status === "done").length,
  };
}
