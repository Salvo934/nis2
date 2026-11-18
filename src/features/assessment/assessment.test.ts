import { describe, expect, it } from "vitest";

import {
  addDays,
  computeAssessmentMetrics,
  computeCategoryMetrics,
  computeTaskMetrics,
  isOverdue,
  todayInRome,
} from "./metrics";
import { updateAnswerSchema } from "./schemas";
import { taskSchema } from "../remediation/schemas";
import catalogue from "../../../data/catalogs/nis2-directive-2022-2555-v1.json";

const a = (status: Parameters<typeof computeAssessmentMetrics>[0][number]["status"], cat = "RM") => ({
  status,
  category_code: cat,
  category_name: cat,
});

describe("computeAssessmentMetrics", () => {
  it("uses explicit numerators and denominators", () => {
    const m = computeAssessmentMetrics([
      a("implemented"),
      a("implemented"),
      a("partial"),
      a("not_implemented"),
      a("not_applicable"),
      a("not_assessed"),
    ]);
    expect(m).toMatchObject({
      total: 6,
      applicable: 5,
      assessed: 5,
      implemented: 2,
      gaps: 2,
      notAssessed: 1,
    });
    expect(m.implementationRate).toBe(40); // 2 / 5 applicable — partial counts as 0
    expect(m.assessmentProgress).toBe(83.3); // 5 / 6
  });

  it("never divides by zero", () => {
    expect(computeAssessmentMetrics([]).implementationRate).toBe(0);
    expect(computeAssessmentMetrics([a("not_applicable")]).implementationRate).toBe(0);
  });

  it("groups by category", () => {
    const cats = computeCategoryMetrics([
      a("implemented", "GOV"),
      a("partial", "GOV"),
      a("implemented", "INC"),
    ]);
    expect(cats.map((c) => [c.code, c.implementationRate])).toEqual([
      ["GOV", 50],
      ["INC", 100],
    ]);
  });
});

describe("task metrics", () => {
  const today = "2026-11-18";
  it("counts open, overdue and due-soon tasks", () => {
    const m = computeTaskMetrics(
      [
        { status: "todo", due_date: "2026-11-10" },
        { status: "in_progress", due_date: "2026-11-30" },
        { status: "blocked", due_date: null },
        { status: "done", due_date: "2026-11-01" },
        { status: "cancelled", due_date: "2026-11-01" },
        { status: "todo", due_date: "2027-03-01" },
      ],
      today,
    );
    expect(m).toEqual({ open: 4, overdue: 1, dueSoon: 1, done: 1 });
  });
  it("completed tasks are never overdue", () => {
    expect(isOverdue({ status: "done", due_date: "2020-01-01" }, today)).toBe(false);
  });
  it("handles dates in Europe/Rome", () => {
    expect(todayInRome(new Date("2026-11-18T23:30:00Z"))).toBe("2026-11-19");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("updateAnswerSchema", () => {
  const base = { answerId: "11111111-1111-4111-8111-111111111111", justification: "", ownerId: "" };
  it("requires a justification for partial and not applicable", () => {
    expect(updateAnswerSchema.safeParse({ ...base, status: "partial" }).success).toBe(false);
    expect(
      updateAnswerSchema.safeParse({ ...base, status: "not_applicable", justification: "Fuori perimetro" })
        .success,
    ).toBe(true);
    expect(updateAnswerSchema.safeParse({ ...base, status: "implemented" }).success).toBe(true);
  });
  it("maps an empty owner to null", () => {
    expect(updateAnswerSchema.parse({ ...base, status: "implemented" }).ownerId).toBeNull();
  });
});

describe("taskSchema", () => {
  it("validates dates and normalises empty values", () => {
    const parsed = taskSchema.parse({
      title: "Policy backup",
      description: "",
      priority: "high",
      status: "todo",
      assigneeId: "",
      dueDate: "",
      answerId: "",
    });
    expect(parsed).toMatchObject({ dueDate: null, assigneeId: null, answerId: null });
    expect(
      taskSchema.safeParse({ ...parsed, dueDate: "31/12/2026", assigneeId: "", answerId: "" }).success,
    ).toBe(false);
  });
});

describe("NIS2 directive catalogue dataset", () => {
  it("has unique codes, a source for every requirement and no ACN codes", () => {
    const codes = catalogue.requirements.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toHaveLength(17);
    for (const r of catalogue.requirements) {
      expect(r.source_reference).toMatch(/^Direttiva \(UE\) 2022\/2555, art\. (20|21|23)/);
      expect(r.description.length).toBeGreaterThan(40);
    }
  });
});
