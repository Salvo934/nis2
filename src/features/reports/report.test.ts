// @vitest-environment node
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";

import acnAll1 from "../../../data/catalogs/acn-379907-2025-allegato-1.json";
import acnAll2 from "../../../data/catalogs/acn-379907-2025-allegato-2.json";
import directive from "../../../data/catalogs/nis2-directive-2022-2555-v1.json";
import {
  buildReportModel,
  normalizeReference,
  ratio,
  splitJustification,
  taskCode,
  type ReportInput,
} from "./model";
import { renderReportPdf, toPdfText } from "./pdf";
import type { AnswerStatus, GapSeverity } from "@/types/database";

// -----------------------------------------------------------------------------
// Fixtures (clearly fictitious data on the real catalogues)
// -----------------------------------------------------------------------------
type Catalogue = typeof acnAll1;
const CATALOGUE_LABEL: Record<string, string> = {
  [acnAll1.version.version_label]: "Misure di base ACN – soggetti importanti (Allegato 1)",
  [acnAll2.version.version_label]: "Misure di base ACN – soggetti essenziali (Allegato 2)",
  [directive.version.version_label]: "Direttiva (UE) 2022/2555 (NIS2)",
};

type Options = {
  catalogue?: Catalogue | typeof directive;
  status?: (i: number) => AnswerStatus;
  severity?: (i: number) => GapSeverity | null;
  justification?: (i: number, status: AnswerStatus) => string | null;
  tasks?: ReportInput["tasks"];
  items?: ReportInput["items"];
  classification?: ReportInput["organization"]["classification"];
  assessmentStatus?: ReportInput["assessment"]["status"];
  orgName?: string;
};

const uuid = (n: number) => `${String(n * 1117).padStart(8, "0")}-0000-4000-8000-000000000000`;

function makeInput(o: Options = {}): ReportInput {
  const catalogue = o.catalogue ?? acnAll1;
  const status = o.status ?? (() => "implemented");
  const items =
    o.items ??
    catalogue.requirements.map((r, i) => {
      const s = status(i);
      return {
        answerId: `a-${i}`,
        code: r.code,
        categoryCode: r.category_code,
        categoryName: r.category_name,
        title: r.title,
        description: r.description,
        sourceReference: r.source_reference,
        status: s,
        justification: o.justification
          ? o.justification(i, s)
          : s === "not_assessed"
            ? null
            : "Verifica documentale (dato dimostrativo)",
        ownerName: i % 4 === 0 ? null : "Mario Rossi",
        gapSeverity: s === "partial" || s === "not_implemented" ? (o.severity?.(i) ?? null) : null,
        assessedAt: s === "not_assessed" ? null : "2026-11-18T10:00:00Z",
        assessedBy: s === "not_assessed" ? null : "Giulia Bianchi",
        resolvedByTasks: false,
        preResolutionStatus: null,
      };
    });
  const classification = o.classification ?? "important";
  return {
    reportId: "6f1c2b9e-0d4a-4c1e-9a77-1f2e3d4c5b6a",
    generatedAt: "2026-11-19T15:30:00Z",
    generatedBy: "Utente Demo",
    today: "2026-11-19",
    organization: {
      name: o.orgName ?? "Meridiana Componenti Industriali S.r.l. (DEMO)",
      sector: "Fabbricazione",
      sizeClass: "Media impresa",
      classification,
      classificationLabel: {
        not_determined: "Non determinata",
        essential: "Soggetto essenziale",
        important: "Soggetto importante",
        not_in_scope: "Fuori ambito",
      }[classification],
      classificationBasis: classification === "not_determined" ? null : "Dato dimostrativo",
      classificationUpdatedAt: classification === "not_determined" ? null : "2026-11-10T09:00:00Z",
    },
    assessment: {
      id: "x",
      title: "Assessment DEMO – dicembre 2026",
      status: o.assessmentStatus ?? "in_progress",
      statusLabel: {
        draft: "Bozza",
        in_progress: "In corso",
        completed: "Completato",
        archived: "Archiviato",
      }[o.assessmentStatus ?? "in_progress"],
      createdAt: "2026-11-18T09:00:00Z",
      createdBy: "Giulia Bianchi",
      completedAt: o.assessmentStatus === "completed" ? "2026-11-19T09:00:00Z" : null,
    },
    catalogue: {
      label: CATALOGUE_LABEL[catalogue.version.version_label]!,
      versionLabel: catalogue.version.version_label,
      sourceTitle: catalogue.version.source_title,
      sourceUrl: catalogue.version.source_url,
      sourcePublishedAt: null,
      scopeNote: catalogue.version.scope_note,
    },
    people: [
      { name: "Giulia Bianchi", role: "Security manager" },
      { name: "Mario Rossi", role: "Amministratore" },
      { name: "Persona non coinvolta", role: "Lettore" },
    ],
    items,
    tasks: o.tasks ?? [],
  };
}

function task(n: number, answerId: string | null, extra: Partial<ReportInput["tasks"][number]> = {}) {
  return {
    id: uuid(n),
    title: `Attività dimostrativa ${n}`,
    description: null,
    priority: "medium" as const,
    status: "todo" as const,
    assigneeName: "Mario Rossi",
    dueDate: "2026-12-31",
    createdAt: "2026-11-18T10:00:00Z",
    completedAt: null,
    answerId,
    ...extra,
  };
}

async function pdfPages(input: ReportInput) {
  const doc = renderReportPdf(buildReportModel(input));
  const data = new Uint8Array(doc.output("arraybuffer"));
  const pdf = await getDocument({ data: data.slice(), verbosity: 0 }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const content = await (await pdf.getPage(p)).getTextContent();
    pages.push(
      content.items
        .map((i) => ("str" in i ? i.str : ""))
        .join(" ")
        .replace(/\s+/g, " "),
    );
  }
  return { data, pages, text: pages.join("\n") };
}

/** Text of a page without the running header and footer. */
const body = (page: string) =>
  page
    .replace(/NIS2 Control · .*?Riservato – uso interno dell'organizzazione/, "")
    .replace(/Catalogo \S+ · Generato il .*$/, "");

const MANDATORY_SECTIONS = [
  "Rapporto di valutazione della cybersecurity e dello stato di attuazione dei requisiti NIS2",
  "1. Executive Summary",
  "2. Perimetro e metodologia",
  "3. Dashboard degli indicatori",
  "4. Analisi per area normativa",
  "5. Gap Analysis",
  "6. Piano di adeguamento",
  "7. Gestione delle evidenze",
  "8. Analisi dei rischi",
  "9. Raccomandazioni operative",
  "10. Conclusioni e limitazioni",
  "Allegato A – Criteri di calcolo, legende e glossario",
  "Allegato B – Registro dettagliato dei requisiti",
];

// -----------------------------------------------------------------------------
// Unit helpers
// -----------------------------------------------------------------------------
describe("helpers", () => {
  it("keeps Italian characters and replaces unsupported symbols", () => {
    expect(toPdfText("àèéìòù “citazione” l’ente – … «x» €")).toBe("àèéìòù “citazione” l’ente – … «x» €");
    expect(toPdfText("a → b ≥ c")).toBe("a -> b >= c");
    expect(toPdfText("emoji 😀")).toBe("emoji ?");
  });

  it("never divides by zero", () => {
    expect(ratio(0, 0)).toBeNull();
    expect(ratio(1, 3)).toBe(33.3);
  });

  it("separates declared text from duplicated automatic notes and shortens long texts", () => {
    const note =
      "Aggiornato automaticamente il 18/11/2026: attività correttive completate (Procedura (v2), Formazione).";
    const j = splitJustification(`Procedura in bozza.\n\nProcedura in bozza.\n\n${note}\n\n${note}`);
    expect(j.declared).toBe("Procedura in bozza.");
    expect(j.autoNotes).toEqual([{ date: "18/11/2026", tasks: "Procedura (v2), Formazione" }]);
    expect(splitJustification(note).declared).toBeNull();
    const long = splitJustification("parola ".repeat(400));
    expect(long.truncated).toBe(true);
    expect(long.declared!.length).toBeLessThan(720);
    expect(splitJustification("   ").declared).toBeNull();
  });

  it("normalises source references to article / annex level", () => {
    expect(normalizeReference("Direttiva (UE) 2022/2555, art. 21, par. 2, lett. a)")).toEqual([
      "Direttiva (UE) 2022/2555, art. 21",
    ]);
    expect(normalizeReference(acnAll1.requirements[0]!.source_reference)).toEqual([
      "Det. ACN 379907/2025, All. 1",
      "D.Lgs. 138/2024, art. 24",
    ]);
  });
});

// -----------------------------------------------------------------------------
// Scenarios
// -----------------------------------------------------------------------------
describe("report scenarios", () => {
  it("1. completely empty assessment (nothing assessed, and no requirements at all)", async () => {
    const model = buildReportModel(makeInput({ status: () => "not_assessed" }));
    expect(model.indicators[0]!.value).toBe("Dato non disponibile");
    expect(model.narrative[0]).toContain("non contiene ancora valutazioni");
    expect(model.gaps).toHaveLength(0);
    expect(model.register.flatMap((a) => a.items).every((i) => i.justification === null)).toBe(true);

    const empty = buildReportModel(makeInput({ items: [] }));
    expect(empty.counts.total).toBe(0);
    expect(empty.areas).toEqual([]);
    expect(empty.notes.join(" ")).toContain("non contiene requisiti");
    const { text } = await pdfPages(makeInput({ items: [] }));
    for (const s of MANDATORY_SECTIONS) expect(text, s).toContain(s);
  });

  it("2. partially assessed: not-assessed requirements are never counted as implemented", () => {
    const model = buildReportModel(makeInput({ status: (i) => (i < 20 ? "implemented" : "not_assessed") }));
    expect(model.counts.implemented).toBe(20);
    expect(model.counts.notAssessed).toBe(acnAll1.requirements.length - 20);
    expect(model.indicators[0]!.value).toBe(
      `${(Math.round((20 / acnAll1.requirements.length) * 1000) / 10).toLocaleString("it-IT")}%`,
    );
    expect(model.notes.join(" ")).toContain("non sono contati come implementati");
  });

  it("3. 100% declared implemented without evidence: 100% declared, nothing verified, no green", async () => {
    const input = makeInput({ status: () => "implemented" });
    const model = buildReportModel(input);
    expect(model.indicators.map((k) => k.value)).toEqual(["100%", "Non disponibile", "Non disponibile"]);
    expect(model.indicators[1]!.available).toBe(false);
    expect(model.indicators[2]!.available).toBe(false);
    expect(model.gaps).toHaveLength(0);
    expect(model.verificationGap.declaredUnverified).toBe(acnAll1.requirements.length);
    expect(model.register.flatMap((a) => a.items).every((i) => i.verification === "Non verificato")).toBe(
      true,
    );
    // In progress + everything assessed: the inconsistency is stated.
    expect(model.notes.join(" ")).toContain("non è stato chiuso formalmente");

    const { text } = await pdfPages(input);
    expect(text).toContain("Il livello di implementazione dichiarato dall'organizzazione è pari al 100%");
    expect(text).toContain("Il presente report non costituisce una certificazione di conformità");
    expect(text).not.toMatch(/conforme alla NIS2|pienamente conforme|è conforme/i);
  });

  it("4. evidence verification is not simulated even when everything is declared implemented", () => {
    const model = buildReportModel(makeInput({ status: () => "implemented", assessmentStatus: "completed" }));
    expect(model.evidence.available).toBe(false);
    expect(model.evidence.message).toContain("Non risultano evidenze documentali associate");
    expect(model.conclusions.find((c) => c.title === "Risultati verificati")!.text).toContain("Nessuno");
    expect(model.notes.join(" ")).not.toContain("non è stato chiuso formalmente");
  });

  it("5. critical gaps come first and drive the recommendations", () => {
    const model = buildReportModel(
      makeInput({
        status: (i) => (i % 3 === 0 ? "not_implemented" : i % 3 === 1 ? "partial" : "implemented"),
        severity: (i) => (i === 6 ? "critical" : i === 3 ? "high" : i % 2 ? "low" : null),
      }),
    );
    expect(model.gaps[0]!.severity).toBe("Critica");
    expect(model.gaps[1]!.severity).toBe("Alta");
    expect(model.severeGaps.map((g) => g.code)).toEqual([
      acnAll1.requirements[6]!.code,
      acnAll1.requirements[3]!.code,
    ]);
    expect(model.recommendations[0]).toContain("gravità critica o alta");
    expect(model.gaps.at(-1)!.severity).toBe("Non classificata");
  });

  it("6. overdue remediation tasks are listed first and counted", () => {
    const tasks = [
      task(1, "a-3", { dueDate: "2027-01-10" }),
      task(2, "a-4", { dueDate: "2026-10-01", priority: "high" }),
      task(3, "a-5", { status: "done", completedAt: "2026-11-01T10:00:00Z", dueDate: "2026-10-01" }),
    ];
    const model = buildReportModel(makeInput({ status: (i) => (i < 10 ? "partial" : "implemented"), tasks }));
    expect(model.counts.openTasks).toBe(2);
    expect(model.counts.overdueTasks).toBe(1);
    expect(model.plan.map((p) => p.code)).toEqual([taskCode(uuid(2)), taskCode(uuid(1)), taskCode(uuid(3))]);
    expect(model.plan[2]!.effectiveness).toBe("Non verificata");
    expect(model.recommendations.join(" ")).toContain(taskCode(uuid(2)));
  });

  it("7. not-applicable requirements are excluded from the denominator", () => {
    const model = buildReportModel(makeInput({ status: (i) => (i < 7 ? "not_applicable" : "implemented") }));
    expect(model.counts.applicable).toBe(acnAll1.requirements.length - 7);
    expect(model.indicators[0]!.value).toBe("100%");
    const na = model.register.flatMap((a) => a.items).filter((i) => i.statusValue === "not_applicable");
    expect(na.every((i) => i.verification === "Non applicabile alla verifica")).toBe(true);
    const allNa = buildReportModel(makeInput({ status: () => "not_applicable" }));
    expect(allNa.indicators[0]!.value).toBe("Dato non disponibile");
    expect(allNa.narrative[0]).toContain("non applicabili");
  });

  it("8. different catalogues: the EU directive is never presented as Italian compliance", async () => {
    const eu = buildReportModel(makeInput({ catalogue: directive }));
    expect(eu.scope.kindStatement).toContain("non equivale alla conformità agli obblighi nazionali italiani");
    expect(eu.limitations.join(" ")).toContain("non copre le misure di base ACN");
    expect(eu.areas.map((a) => a.code)).toEqual(["GOV", "RM", "INC"]);
    expect(eu.scope.includedReferences).toContain("Direttiva (UE) 2022/2555, art. 21");

    const acn = buildReportModel(makeInput({ catalogue: acnAll2 }));
    expect(acn.scope.kindStatement).toContain("misure di sicurezza di base adottate dall'ACN");
    // Declared "important" but catalogue for essential entities.
    expect(acn.limitations.join(" ")).toContain("non corrisponde al catalogo selezionato");
    expect(buildReportModel(makeInput()).limitations.join(" ")).not.toContain("non corrisponde");

    const { text } = await pdfPages(makeInput({ catalogue: directive }));
    expect(text).toContain("Direttiva (UE) 2022/2555 (NIS2)");
    expect(text).toContain(directive.requirements[0]!.code);
  });

  it("9. very long official texts and justifications render without losing rows", async () => {
    const base = makeInput({ catalogue: directive });
    const long = "Testo normativo molto lungo di prova. ".repeat(160);
    const input = {
      ...base,
      items: base.items.map((i, n) =>
        n < 3 ? { ...i, description: long, justification: "Motivazione lunga. ".repeat(200) } : i,
      ),
    };
    const model = buildReportModel(input);
    expect(model.register.flatMap((a) => a.items)[0]!.justificationTruncated).toBe(true);
    const { pages, text } = await pdfPages(input);
    expect(text).toContain("testo completo nella piattaforma");
    for (const r of directive.requirements) expect(text).toContain(r.code);
    expect(pages.length).toBeGreaterThan(8);
  });

  it("10. hundreds of requirements: complete, numbered and without near-empty pages", async () => {
    const base = makeInput({ catalogue: acnAll2 });
    const items = Array.from({ length: 3 }, (_, k) =>
      base.items.map((i, n) => ({
        ...i,
        answerId: `a-${k}-${n}`,
        code: `${i.code}-${k}`,
        status: (["implemented", "partial", "not_implemented", "not_assessed"] as const)[(n + k) % 4]!,
      })),
    ).flat();
    expect(items.length).toBe(acnAll2.requirements.length * 3);
    const input = { ...base, items, tasks: [task(1, "a-0-1"), task(2, "a-1-2", { dueDate: "2026-01-01" })] };
    const model = buildReportModel(input);
    // Arithmetic consistency of the indicators.
    const c = model.counts;
    expect(c.implemented + c.partial + c.notImplemented + c.notAssessed + c.notApplicable).toBe(c.total);
    expect(model.areas.reduce((s, a) => s + a.total, 0)).toBe(c.total);
    for (const a of model.areas) {
      expect(a.implemented + a.partial + a.notImplemented, a.code).toBe(a.assessed);
      expect(a.assessed + a.notAssessed, a.code).toBe(a.applicable);
      expect(a.applicable + a.notApplicable, a.code).toBe(a.total);
    }
    expect(model.areas.reduce((s, a) => s + a.gaps, 0)).toBe(c.gaps);
    expect(model.areas.reduce((s, a) => s + a.openTasks, 0)).toBe(c.openTasks);

    const { pages, text } = await pdfPages(input);
    expect(text).toContain(`Pagina 1 di ${pages.length}`);
    expect(text).toContain(`Pagina ${pages.length} di ${pages.length}`);
    for (const i of items.slice(0, 40)) expect(text).toContain(i.code);
    pages.slice(0, -1).forEach((p, n) => expect(body(p).length, `page ${n + 1}`).toBeGreaterThan(450));
  });

  it("11. organisation without NIS2 classification", async () => {
    const input = makeInput({ classification: "not_determined" });
    const model = buildReportModel(input);
    expect(model.classification.text).toBe("Classificazione non determinata");
    expect(model.limitations[0]).toContain("Classificazione NIS2 non determinata");
    expect(model.recommendations.join(" ")).toContain("Determinare e registrare la classificazione NIS2");
    const { pages } = await pdfPages(input);
    expect(pages[0]).toContain("Classificazione non determinata");
  });

  it("12. no data from other organisations or assessments reaches the report", async () => {
    const input = makeInput({
      orgName: "Alpha DEMO S.r.l.",
      tasks: [
        task(1, "a-2", { title: "Attività di Alpha" }),
        task(2, "answer-of-beta", { title: "Attività riservata di Beta", assigneeName: "Bob Beta" }),
        task(3, null, { title: "Attività non collegata" }),
      ],
    });
    const model = buildReportModel(input);
    expect(model.plan.map((p) => p.title)).toEqual(["Attività di Alpha"]);
    expect(model.scope.people.map((p) => p.name)).not.toContain("Persona non coinvolta");
    const { text } = await pdfPages(input);
    expect(text).toContain("Attività di Alpha");
    expect(text).not.toContain("Beta");
    expect(text).not.toContain("Attività non collegata");
  });

  it("automatic closures are reported as unverified, with the previous status", () => {
    const base = makeInput({ status: () => "implemented" });
    const note =
      "Aggiornato automaticamente il 18/11/2026: attività correttive completate (Attività dimostrativa 1).";
    const input = {
      ...base,
      items: base.items.map((i, n) =>
        n === 0
          ? {
              ...i,
              resolvedByTasks: true,
              preResolutionStatus: "partial" as const,
              justification: `Parziale.\n\n${note}`,
            }
          : i,
      ),
      tasks: [task(1, "a-0", { status: "done" as const, completedAt: "2026-11-18T10:00:00Z" })],
    };
    const model = buildReportModel(input);
    expect(model.counts.implementedAuto).toBe(1);
    expect(model.verificationGap.autoClosed[0]).toMatchObject({
      previousStatus: "Parzialmente implementato",
      closedOn: "18/11/2026",
      tasks: taskCode(uuid(1)),
    });
    expect(model.gaps).toHaveLength(0);
    expect(model.notes.join(" ")).toContain("l'efficacia delle misure non è stata verificata");
    expect(model.recommendations.join(" ")).toContain("Verificare l'efficacia");
  });
});

// -----------------------------------------------------------------------------
// Full sample (also written to disk with REPORT_SAMPLE_OUT for visual checks)
// -----------------------------------------------------------------------------
describe("renderReportPdf", () => {
  it("renders every mandatory section with identifier, catalogue version and disclaimer", async () => {
    const input = makeInput({
      status: (i) =>
        (
          [
            "implemented",
            "implemented",
            "partial",
            "not_implemented",
            "not_applicable",
            "not_assessed",
          ] as const
        )[i % 6]!,
      severity: (i) => (i % 5 === 0 ? "critical" : i % 2 ? "medium" : null),
      justification: (i, s) =>
        s === "not_assessed" || i % 7 === 0 ? null : "Procedura approvata il 10/10/2026 (dato dimostrativo).",
      tasks: [
        task(1, "a-3", {
          title: "Scrivere la procedura di gestione incidenti",
          dueDate: "2026-11-01",
          status: "in_progress",
          priority: "high",
        }),
        task(2, "a-9", { title: "Inventario degli asset → aggiornamento", assigneeName: null }),
        task(3, "a-2", {
          title: "Formazione del personale",
          status: "done",
          completedAt: "2026-11-15T10:00:00Z",
        }),
      ],
    });
    const { data, pages, text } = await pdfPages(input);
    if (process.env.REPORT_SAMPLE_OUT) writeFileSync(resolve(process.env.REPORT_SAMPLE_OUT), data);

    for (const s of MANDATORY_SECTIONS) expect(text, s).toContain(s);
    for (const expected of [
      "RPT-6F1C2B9E0D4A",
      "Formato 2.0",
      acnAll1.version.version_label,
      "Livello di riservatezza",
      "Implementazione dichiarata",
      "Copertura documentale",
      "Copertura delle verifiche",
      "Non disponibile",
      "Lacune di implementazione",
      "Carenze di verifica",
      "Non risultano evidenze documentali associate ai requisiti esaminati nel presente report.",
      "Motivazione non registrata",
      "Inventario degli asset -> aggiornamento",
      "Efficacia: Non verificata",
      "SCADUTA",
      "Il presente documento rappresenta una valutazione dello stato di attuazione dei requisiti inclusi nel catalogo normativo indicato",
    ]) {
      expect(text, expected).toContain(expected);
    }
    // Every requirement of the catalogue is in the register, with its official text.
    for (const r of acnAll1.requirements) expect(text, r.code).toContain(r.code);
    expect(pages[1]).toContain("RPT-6F1C2B9E0D4A");
    pages.slice(0, -1).forEach((p, n) => expect(body(p).length, `page ${n + 1}`).toBeGreaterThan(450));
  });
});
