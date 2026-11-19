// @vitest-environment node
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";

import catalogue from "../../../data/catalogs/acn-379907-2025-allegato-1.json";
import { buildReportModel, type ReportInput } from "./model";
import { renderReportPdf, toPdfText } from "./pdf";

const statuses = [
  "implemented",
  "implemented",
  "partial",
  "not_implemented",
  "not_applicable",
  "not_assessed",
] as const;

function sampleInput(): ReportInput {
  const items = catalogue.requirements.map((r, i) => {
    const status = statuses[i % statuses.length]!;
    return {
      code: r.code,
      categoryCode: r.category_code,
      categoryName: r.category_name,
      title: r.title,
      description: r.description,
      sourceReference: r.source_reference,
      status,
      justification: status === "not_assessed" ? null : "Verifica documentale (dato dimostrativo)",
      ownerName: i % 4 === 0 ? null : "Mario Rossi",
      gapSeverity: status === "not_implemented" ? ("high" as const) : null,
      assessedAt: status === "not_assessed" ? null : "2026-11-18T10:00:00Z",
      resolvedByTasks: false,
      answerId: `a-${i}`,
    };
  });
  return {
    generatedAt: "2026-11-19T15:30:00Z",
    generatedBy: "Utente Demo",
    today: "2026-11-19",
    organization: {
      name: "Meridiana Componenti Industriali S.r.l.",
      sector: "Fabbricazione",
      sizeClass: "Media impresa",
      classification: "Soggetto importante",
      classificationBasis: "Dato dimostrativo",
    },
    assessment: {
      id: "x",
      title: "Assessment ACN – dicembre 2026",
      status: "In corso",
      createdAt: "2026-11-18T10:00:00Z",
      completedAt: null,
    },
    catalogue: {
      label: "Misure di base ACN – soggetti importanti (Allegato 1)",
      versionLabel: catalogue.version.version_label,
      sourceTitle: catalogue.version.source_title,
      sourceUrl: catalogue.version.source_url,
      scopeNote: catalogue.version.scope_note,
    },
    items,
    tasks: [
      {
        title: "Scrivere la procedura di gestione incidenti",
        priority: "high",
        status: "in_progress",
        assigneeName: "Mario Rossi",
        dueDate: "2026-11-01",
        answerId: "a-3",
      },
      {
        title: "Inventario degli asset → aggiornamento",
        priority: "medium",
        status: "todo",
        assigneeName: null,
        dueDate: "2026-12-10",
        answerId: "a-9",
      },
      {
        title: "Task di un altro assessment",
        priority: "low",
        status: "todo",
        assigneeName: null,
        dueDate: null,
        answerId: "other",
      },
    ],
  };
}

async function pdfText(data: Uint8Array) {
  const pdf = await getDocument({ data, verbosity: 0 }).promise;
  let text = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const content = await (await pdf.getPage(p)).getTextContent();
    text += content.items.map((i) => ("str" in i ? i.str : "")).join(" ") + "\n";
  }
  return { pages: pdf.numPages, text: text.replace(/\s+/g, " ") };
}

describe("toPdfText", () => {
  it("keeps Italian and typographic characters and replaces unsupported symbols", () => {
    expect(toPdfText("àèéìòù “citazione” l’ente – … «x» €")).toBe("àèéìòù “citazione” l’ente – … «x» €");
    expect(toPdfText("a → b ≥ c")).toBe("a -> b >= c");
    expect(toPdfText("emoji 😀")).toBe("emoji ?");
  });
});

describe("buildReportModel", () => {
  const model = buildReportModel(sampleInput());

  it("explains the numbers in plain sentences with explicit denominators", () => {
    expect(model.summary[0]).toContain(`${catalogue.requirements.length} requisiti`);
    expect(model.summary.join(" ")).toContain("finché la valutazione non è completa, il quadro è parziale");
  });

  it("only includes tasks linked to this assessment", () => {
    expect(model.openTasks.map((t) => t.title)).not.toContain("Task di un altro assessment");
    expect(model.openTasks[0]?.overdue).toBe(true);
  });

  it("produces data-driven next steps", () => {
    const steps = model.nextSteps.join(" ");
    expect(steps).toContain("Completare la valutazione");
    expect(steps).toContain("attività in ritardo");
    expect(steps).toContain("Indicare un responsabile");
  });

  it("explains every area of the catalogue", () => {
    expect(model.areas.map((a) => a.code)).toEqual(["GV", "ID", "PR", "DE", "RS", "RC"]);
    for (const a of model.areas) expect(a.explanation.length).toBeGreaterThan(20);
  });
});

describe("renderReportPdf", () => {
  it("renders a complete, readable PDF", async () => {
    const doc = renderReportPdf(buildReportModel(sampleInput()));
    const data = new Uint8Array(doc.output("arraybuffer"));
    if (process.env.REPORT_SAMPLE_OUT) writeFileSync(resolve(process.env.REPORT_SAMPLE_OUT), data);

    const { pages, text } = await pdfText(data);
    expect(pages).toBeGreaterThan(5);
    for (const expected of [
      "Report di valutazione NIS2",
      "Meridiana Componenti Industriali S.r.l.",
      "Misure di base ACN – soggetti importanti (Allegato 1)",
      "Come leggere questo report",
      "In sintesi",
      "Avanzamento per area",
      "Lacune da colmare",
      "Piano di adeguamento",
      "Prossimi passi consigliati",
      "Dettaglio dei requisiti",
      "Criteri di calcolo",
      "Glossario",
      "Non costituisce certificazione",
      "GV.RR-02.3",
      "Inventario degli asset -> aggiornamento",
      `Pagina 1 di ${pages}`,
    ]) {
      expect(text, expected).toContain(expected);
    }
  });
});
