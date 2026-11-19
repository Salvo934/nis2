// @vitest-environment node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import catalogue from "../../../data/catalogs/acn-379907-2025-allegato-1.json";
import dataset from "../../../data/demo/rossi-logistica.json";
import { SAMPLE_REPORT_PATH } from "./constants";
import { buildSampleReportInput } from "./sample-report";
import { buildReportModel } from "@/features/reports/model";
import { renderReportPdf } from "@/features/reports/pdf";

const codes = new Set(catalogue.requirements.map((r) => r.code));

describe("demo dataset", () => {
  it("uses only real requirement codes of the declared catalogue", () => {
    expect(dataset.assessment.catalogue_version).toBe(catalogue.version.version_label);
    for (const a of dataset.answers) expect(codes.has(a.code), a.code).toBe(true);
    for (const t of dataset.tasks) expect(codes.has(t.code), t.code).toBe(true);
    expect(new Set(dataset.answers.map((a) => a.code)).size).toBe(dataset.answers.length);
  });

  it("is an assessment done about halfway, with every gap classified", () => {
    const ratio = dataset.answers.length / catalogue.requirements.length;
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.6);
    for (const a of dataset.answers) {
      const gap = a.status === "partial" || a.status === "not_implemented";
      expect("gap_severity" in a && !!a.gap_severity, a.code).toBe(gap);
      expect(a.justification.length, a.code).toBeGreaterThan(20);
    }
  });

  it("links every action to a gap of the assessment, with some overdue", () => {
    const gaps = new Set(
      dataset.answers
        .filter((a) => a.status === "partial" || a.status === "not_implemented")
        .map((a) => a.code),
    );
    for (const t of dataset.tasks) expect(gaps.has(t.code), t.code).toBe(true);
    expect(dataset.tasks.some((t) => t.status !== "done" && t.due_in_days < 0)).toBe(true);
  });
});

describe("sample report", () => {
  const input = buildSampleReportInput("2026-11-19", "2026-11-19T10:00:00Z");
  const model = buildReportModel(input);

  it("matches the demo: important entity, half assessed, classified gaps, action plan", () => {
    expect(model.classification.text).toContain("Soggetto importante");
    expect(model.counts.assessed).toBe(dataset.answers.length);
    expect(model.counts.notAssessed).toBe(catalogue.requirements.length - dataset.answers.length);
    expect(model.gaps.every((g) => g.severityValue !== null)).toBe(true);
    expect(model.plan).toHaveLength(dataset.tasks.length);
    expect(model.counts.overdueTasks).toBe(2);
    // The completed action closed its gap, reported as unverified.
    expect(model.verificationGap.autoClosed.map((a) => a.code)).toEqual(["GV.RR-04.3"]);
    expect(input.organization.name).toContain("fittizia");
  });

  it("renders the PDF (written to public/ with DEMO_SAMPLE_PDF=1)", () => {
    const data = new Uint8Array(renderReportPdf(model).output("arraybuffer"));
    expect(data.byteLength).toBeGreaterThan(50_000);
    if (process.env.DEMO_SAMPLE_PDF) {
      const out = resolve("public", SAMPLE_REPORT_PATH.slice(1));
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, data);
    }
  });
});
