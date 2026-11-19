import { jsPDF } from "jspdf";
import { autoTable, type CellHookData, type UserOptions } from "jspdf-autotable";

import type { ReportModel } from "@/features/reports/model";
import {
  COLOR_LEGEND,
  DISCLAIMER,
  GLOSSARY,
  IMPLEMENTATION_STATUS_TEXT,
  NOT_AVAILABLE,
  VERIFICATION_STATUS_TEXT,
} from "@/features/reports/texts";
import { formatDate, formatDateTime } from "@/lib/format";
import type { AnswerStatus } from "@/types/database";

// -----------------------------------------------------------------------------
// Text encoding: the standard PDF fonts use WinAnsi (cp1252). Accents, curly
// quotes, dashes, «» and € are supported; a few symbols are not and are
// replaced with ASCII equivalents so nothing is silently corrupted.
// -----------------------------------------------------------------------------
const CP1252_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
const REPLACEMENTS: Record<string, string> = {
  "\u2192": "->",
  "\u2190": "<-",
  "\u2265": ">=",
  "\u2264": "<=",
  "\u2260": "!=",
  "\u202f": " ",
  "\u2009": " ",
  "\u200b": "",
  "\u2713": "v",
  "\u2212": "-",
};

export function toPdfText(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if ((code <= 0xff && (code < 0x80 || code > 0x9f)) || CP1252_EXTRA.has(ch)) out += ch;
    else out += REPLACEMENTS[ch] ?? "?";
  }
  return out;
}

// -----------------------------------------------------------------------------
// Palette (NIS2 Control identity). Green is reserved for VERIFIED results:
// self-declared implementation is blue.
// -----------------------------------------------------------------------------
type RGB = [number, number, number];
const NAVY: RGB = [30, 51, 89];
const INK: RGB = [33, 37, 49];
const MUTED: RGB = [105, 112, 128];
const LIGHT: RGB = [241, 244, 249];
const LINE: RGB = [215, 221, 232];
const DECLARED: RGB = [47, 98, 168];
const GREEN: RGB = [30, 132, 80];
const AMBER: RGB = [181, 116, 10];
const RED: RGB = [190, 45, 45];
const GREY: RGB = [150, 156, 168];
const AMBER_BG: RGB = [253, 246, 232];
const WHITE: RGB = [255, 255, 255];
const ZEBRA: RGB = [250, 251, 253];

const LEGEND_COLOR: Record<(typeof COLOR_LEGEND)[number]["color"], RGB> = {
  declared: DECLARED,
  verified: GREEN,
  partial: AMBER,
  gap: RED,
  muted: GREY,
};

const STATUS_COLOR: Record<AnswerStatus, RGB> = {
  implemented: DECLARED,
  partial: AMBER,
  not_implemented: RED,
  not_applicable: GREY,
  not_assessed: GREY,
};
const STATUS_BAR: Record<AnswerStatus, RGB> = { ...STATUS_COLOR, not_applicable: [205, 210, 220] };

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 16;
const CONTENT_W = PAGE_W - MARGIN * 2;
const TOP = 24;
const BOTTOM = PAGE_H - 20;

type Doc = jsPDF & { lastAutoTable?: { finalY: number } };
type Style = "normal" | "bold" | "italic" | "bolditalic";

export function renderReportPdf(model: ReportModel): jsPDF {
  const { input, counts } = model;
  const doc: Doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const t = toPdfText;
  const dash = (v: string | null | undefined) => (v ? v : "—");
  const date = (v: string | null | undefined) => (v ? formatDate(v) : "—");
  let y = TOP;

  doc.setProperties({
    title: t(`Rapporto di valutazione NIS2 – ${input.organization.name} – ${model.reportCode}`),
    subject: t(`Assessment «${input.assessment.title}» – ${input.catalogue.label}`),
    author: t(input.generatedBy),
    creator: "NIS2 Control",
    keywords: t(`${model.reportCode} ${input.catalogue.versionLabel}`),
  });

  // --- helpers ---------------------------------------------------------------
  const newPage = () => {
    doc.addPage();
    y = TOP;
  };
  const ensure = (height: number) => {
    if (y + height > BOTTOM) newPage();
  };
  const setText = (size: number, color: RGB = INK, style: Style = "normal") => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };
  const lh = (size: number) => size * 0.42 + 0.8;
  const paragraph = (text: string, size = 9.5, color: RGB = INK, style: Style = "normal") => {
    setText(size, color, style);
    const lines = doc.splitTextToSize(t(text), CONTENT_W) as string[];
    for (const line of lines) {
      ensure(lh(size));
      doc.text(line, MARGIN, y);
      y += lh(size);
    }
    y += 1.5;
  };
  const box = (
    text: string | string[],
    opts: { color?: RGB; bg?: RGB; title?: string; size?: number } = {},
  ) => {
    const size = opts.size ?? 8.8;
    const bullets = Array.isArray(text);
    const items = bullets ? text : [text];
    setText(size);
    const lines = items.flatMap(
      (s) => doc.splitTextToSize(t(bullets ? `•  ${s}` : s), CONTENT_W - 10) as string[],
    );
    const height = lines.length * lh(size) + (opts.title ? 7 : 0) + 6;
    ensure(Math.min(height, BOTTOM - TOP));
    doc.setFillColor(...(opts.bg ?? LIGHT));
    doc.roundedRect(MARGIN, y, CONTENT_W, height, 1.6, 1.6, "F");
    doc.setFillColor(...(opts.color ?? NAVY));
    doc.rect(MARGIN, y, 1.2, height, "F");
    let by = y + 5.5;
    if (opts.title) {
      setText(9, opts.color ?? NAVY, "bold");
      doc.text(t(opts.title), MARGIN + 5, by);
      by += 6;
    }
    setText(size, INK, opts.title || bullets ? "normal" : "italic");
    for (const line of lines) {
      doc.text(line, MARGIN + 5, by);
      by += lh(size);
    }
    y += height + 5;
  };
  const section = (title: string, intro?: string) => {
    ensure(42);
    y += 3;
    setText(14, NAVY, "bold");
    doc.text(t(title), MARGIN, y);
    y += 2.5;
    doc.setDrawColor(...NAVY);
    doc.setLineWidth(0.6);
    doc.line(MARGIN, y, MARGIN + 24, y);
    y += 6;
    if (intro) paragraph(intro, 9.2, MUTED);
  };
  const subheading = (title: string, reserve = 36) => {
    ensure(reserve);
    y += 1.5;
    setText(10.5, INK, "bold");
    doc.text(t(title), MARGIN, y);
    y += 5;
  };
  const list = (items: string[], numbered = false, size = 9.3) => {
    items.forEach((item, i) => {
      setText(size, INK);
      const marker = numbered ? `${i + 1}.` : "•";
      const lines = doc.splitTextToSize(t(item), CONTENT_W - 7) as string[];
      ensure(lh(size) * Math.min(lines.length, 3));
      doc.text(marker, MARGIN + 1, y);
      for (const line of lines) {
        ensure(lh(size));
        doc.text(line, MARGIN + 7, y);
        y += lh(size);
      }
      y += 1;
    });
    y += 1.5;
  };
  const table = (options: UserOptions) => {
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN, top: TOP, bottom: PAGE_H - BOTTOM + 2 },
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 8.2,
        cellPadding: 1.8,
        textColor: INK,
        lineColor: LINE,
        lineWidth: 0.2,
        valign: "top",
        overflow: "linebreak",
      },
      alternateRowStyles: { fillColor: ZEBRA },
      // Keep each row on one page (rows taller than a page are still split)
      // and repeat the header on every page.
      rowPageBreak: "avoid",
      showHead: "everyPage",
      ...options,
      headStyles: {
        fillColor: NAVY,
        textColor: WHITE,
        fontStyle: "bold",
        valign: "middle",
        ...options.headStyles,
      },
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 5;
  };
  const keyValue = (rows: [string, string][], labelWidth = 50, size = 8.8) =>
    table({
      theme: "plain",
      styles: { fontSize: size, cellPadding: { top: 1.3, bottom: 1.3, left: 0, right: 2 }, textColor: INK },
      columnStyles: { 0: { cellWidth: labelWidth, textColor: MUTED }, 1: { fontStyle: "bold" } },
      body: rows.map(([k, v]) => [t(k), t(v)]),
      didDrawCell: (data: CellHookData) => {
        if (data.section === "body" && data.column.index === 1) {
          doc.setDrawColor(...LINE);
          doc.setLineWidth(0.15);
          doc.line(MARGIN, data.cell.y + data.cell.height, PAGE_W - MARGIN, data.cell.y + data.cell.height);
        }
      },
    });
  const tiles = (items: { title: string; value: string; detail: string; color: RGB }[], height = 27) => {
    ensure(height + 4);
    const gap = 4;
    const w = (CONTENT_W - gap * (items.length - 1)) / items.length;
    items.forEach((k, i) => {
      const x = MARGIN + i * (w + gap);
      doc.setFillColor(...LIGHT);
      doc.roundedRect(x, y, w, height, 2, 2, "F");
      doc.setFillColor(...k.color);
      doc.rect(x, y, 1.4, height, "F");
      setText(8, MUTED, "bold");
      doc.text(t(k.title), x + 4.5, y + 6.5, { maxWidth: w - 7 });
      setText(k.value.length > 8 ? 12 : 18, k.color, "bold");
      doc.text(t(k.value), x + 4.5, y + 17);
      setText(7.4, MUTED);
      doc.text(t(k.detail), x + 4.5, y + 23, { maxWidth: w - 7 });
    });
    y += height + 6;
  };
  const drawLogo = (x: number, yy: number, size: number, bg: RGB, fg: RGB) => {
    doc.setFillColor(...bg);
    doc.roundedRect(x, yy, size, size, size * 0.22, size * 0.22, "F");
    const s = size / 10;
    const cx = x + size / 2;
    const top = yy + 1.8 * s;
    // Shield
    doc.setFillColor(...fg);
    doc.lines(
      [
        [3 * s, 0.9 * s],
        [0, 2.6 * s],
        [0, 2 * s, -2 * s, 3.3 * s, -3 * s, 3.6 * s],
        [-1 * s, -0.3 * s, -3 * s, -1.6 * s, -3 * s, -3.6 * s],
        [0, -2.6 * s],
      ],
      cx,
      top,
      [1, 1],
      "F",
      true,
    );
    // Check mark
    doc.setDrawColor(...bg);
    doc.setLineWidth(0.6 * s);
    doc.lines(
      [
        [0.9 * s, 0.9 * s],
        [1.8 * s, -2 * s],
      ],
      cx - 1.4 * s,
      top + 3.4 * s,
    );
  };

  // ===========================================================================
  // Cover
  // ===========================================================================
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, PAGE_W, 96, "F");
  drawLogo(MARGIN, 13, 11, [226, 233, 245], NAVY);
  setText(12, WHITE, "bold");
  doc.text("NIS2 Control", MARGIN + 15, 20.3);
  setText(8.5, [190, 205, 230], "bold");
  doc.text(t(model.confidentiality.toUpperCase()), PAGE_W - MARGIN, 20.3, { align: "right" });

  setText(19, WHITE, "bold");
  const titleLines = doc.splitTextToSize(
    t("Rapporto di valutazione della cybersecurity e dello stato di attuazione dei requisiti NIS2"),
    CONTENT_W,
  ) as string[];
  doc.text(titleLines, MARGIN, 42, { lineHeightFactor: 1.2 });
  let cy = 42 + titleLines.length * 8.2 + 4;
  setText(13, [225, 232, 245], "bold");
  const orgLines = doc.splitTextToSize(t(input.organization.name), CONTENT_W) as string[];
  doc.text(orgLines, MARGIN, cy);
  cy += orgLines.length * 6 + 2;
  setText(9.5, [190, 205, 230]);
  doc.text(t(`${input.assessment.title} · ${input.catalogue.label}`), MARGIN, cy, { maxWidth: CONTENT_W });

  y = 106;
  keyValue([
    ["Identificativo del report", `${model.reportCode} (voce del registro audit ${input.reportId})`],
    ["Versione del report", `Formato ${model.formatVersion}`],
    ["Data e ora di generazione", formatDateTime(input.generatedAt)],
    ["Generato da", input.generatedBy],
    ["Periodo di riferimento", model.scope.period],
    ["Assessment", input.assessment.title],
    ["Stato dell'assessment", input.assessment.statusLabel],
    [
      "Responsabile della valutazione",
      `Non registrato nella piattaforma${input.assessment.createdBy ? ` (assessment creato da ${input.assessment.createdBy})` : ""}`,
    ],
    ["Catalogo normativo", input.catalogue.label],
    ["Versione del catalogo", input.catalogue.versionLabel],
    ["Classificazione NIS2", model.classification.text],
    ["Fonte della classificazione", model.classification.source],
    ["Livello di riservatezza", model.confidentiality],
  ]);
  y += 2;
  box(DISCLAIMER, { size: 8.4 });

  // ===========================================================================
  // 1. Executive summary
  // ===========================================================================
  newPage();
  section(
    "1. Executive Summary",
    "Sintesi per la direzione. Tutti i valori derivano dai dati registrati nella piattaforma alla data del report.",
  );
  tiles(
    model.indicators.map((k) => ({
      title: k.title,
      value: k.value,
      detail: k.detail,
      color: k.available ? DECLARED : GREY,
    })),
  );
  for (const p of model.narrative) paragraph(p, 9.5);
  y += 1;

  const pctOf = (n: number, d: number) =>
    d === 0 ? "" : ` (${(Math.round((n / d) * 1000) / 10).toLocaleString("it-IT")}%)`;
  const figures: [string, string][] = [
    ["Requisiti presenti nel catalogo", String(counts.total)],
    ["Requisiti applicabili", String(counts.applicable)],
    ["Requisiti valutati", `${counts.assessed}${pctOf(counts.assessed, counts.total)}`],
    ["Requisiti non valutati", String(counts.notAssessed)],
    [
      "Implementati (autodichiarazione)",
      `${counts.implemented}${counts.implementedAuto ? `, di cui ${counts.implementedAuto} per chiusura automatica` : ""}`,
    ],
    ["Parzialmente implementati", String(counts.partial)],
    ["Non implementati", String(counts.notImplemented)],
    ["Non applicabili", String(counts.notApplicable)],
    ["Verificati mediante evidenze", "Non disponibile"],
    ["Privi di evidenze sufficienti", "Non determinabile"],
    ["Lacune aperte", String(counts.gaps)],
    ["Azioni correttive aperte", String(counts.openTasks)],
    ["Azioni correttive scadute", String(counts.overdueTasks)],
    ["Principali rischi", "Non valutati (registro dei rischi non gestito)"],
  ];
  const half = Math.ceil(figures.length / 2);
  table({
    theme: "plain",
    styles: { fontSize: 8.6, cellPadding: { top: 1.4, bottom: 1.4, left: 1.5, right: 1.5 } },
    columnStyles: {
      0: { cellWidth: 50, textColor: MUTED },
      1: { cellWidth: 39, fontStyle: "bold" },
      2: { cellWidth: 50, textColor: MUTED },
      3: { fontStyle: "bold" },
    },
    body: Array.from({ length: half }, (_, i) => {
      const a = figures[i]!;
      const b = figures[i + half];
      return [t(a[0]), t(a[1]), t(b?.[0] ?? ""), t(b?.[1] ?? "")];
    }),
    didParseCell: (data) => {
      if (data.section !== "body" || (data.column.index !== 1 && data.column.index !== 3)) return;
      if (/^Non (disponibile|determinabile|valutati)/.test(String(data.cell.raw))) {
        data.cell.styles.textColor = GREY;
        data.cell.styles.fontStyle = "italic";
      }
    },
    didDrawCell: (data: CellHookData) => {
      if (data.section === "body" && data.column.index === 3) {
        doc.setDrawColor(...LINE);
        doc.setLineWidth(0.15);
        doc.line(MARGIN, data.cell.y + data.cell.height, PAGE_W - MARGIN, data.cell.y + data.cell.height);
      }
    },
  });

  if (model.severeGaps.length > 0) {
    subheading("Lacune con gravità critica o alta", 20);
    list(
      model.severeGaps.slice(0, 5).map((g) => `${g.code} – ${g.title} (gravità ${g.severity.toLowerCase()})`),
    );
    if (model.severeGaps.length > 5)
      paragraph(
        model.severeGaps.length === 6
          ? "Un'altra nella sezione 5."
          : `Altre ${model.severeGaps.length - 5} nella sezione 5.`,
        8.5,
        MUTED,
        "italic",
      );
  }
  if (model.notes.length > 0)
    box(model.notes, { title: "Elementi da considerare nella lettura", color: AMBER, bg: AMBER_BG });

  // ===========================================================================
  // 2. Scope and methodology
  // ===========================================================================
  section("2. Perimetro e metodologia");
  box(model.scope.kindStatement, { title: "Natura della valutazione", color: NAVY, size: 8.8 });
  keyValue(
    [
      ["Catalogo normativo", input.catalogue.label],
      ["Fonte ufficiale", input.catalogue.sourceTitle],
      ["Versione del catalogo", input.catalogue.versionLabel],
      ["Data della fonte", date(input.catalogue.sourcePublishedAt)],
      ["Testo ufficiale", dash(input.catalogue.sourceUrl)],
      ["Riferimenti inclusi", model.scope.includedReferences.join("; ") || NOT_AVAILABLE],
      ["Ambito ed esclusioni del catalogo", dash(input.catalogue.scopeNote)],
      ["Sistemi, processi e servizi", model.scope.perimeter],
      ["Periodo di esecuzione", `${model.scope.period}. ${model.scope.assessedWindow}`],
      ["Metodo", model.scope.method],
      [
        "Persone e ruoli coinvolti",
        model.scope.people.length
          ? model.scope.people.map((p) => `${p.name} (${p.role})`).join("; ")
          : "Nessuna persona registrata come valutatore, responsabile o assegnatario",
      ],
    ],
    48,
    8.5,
  );
  subheading("Limitazioni", 20);
  list(model.limitations, false, 8.9);

  // ===========================================================================
  // 3. Indicators
  // ===========================================================================
  section(
    "3. Dashboard degli indicatori",
    "Tre indicatori indipendenti: non vanno confrontati né sommati. Ogni valore riporta numeratore, denominatore e significato.",
  );
  table({
    head: [["Indicatore", "Valore", "Formula", "Significato"].map(t)],
    body: model.indicators.map((k) => [t(k.title), t(`${k.value}\n${k.detail}`), t(k.formula), t(k.meaning)]),
    columnStyles: {
      0: { cellWidth: 32, fontStyle: "bold" },
      1: { cellWidth: 32 },
      2: { cellWidth: 50 },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 1) {
        const k = model.indicators[data.row.index];
        data.cell.styles.textColor = k?.available ? DECLARED : GREY;
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  subheading("Distribuzione degli esiti dichiarati", 34);
  paragraph(
    `Avanzamento della valutazione: ${counts.assessed} requisiti valutati su ${counts.total}` +
      (model.assessmentProgress === null ? "." : ` (${model.assessmentProgress.toLocaleString("it-IT")}%).`),
    8.8,
    MUTED,
  );
  {
    ensure(22);
    const barH = 6;
    if (counts.total === 0) {
      doc.setFillColor(...LINE);
      doc.rect(MARGIN, y, CONTENT_W, barH, "F");
    } else {
      let x = MARGIN;
      for (const seg of model.distribution) {
        if (seg.count === 0) continue;
        const w = (CONTENT_W * seg.count) / counts.total;
        doc.setFillColor(...STATUS_BAR[seg.status]);
        doc.rect(x, y, w, barH, "F");
        x += w;
      }
    }
    y += barH + 5;
    let lx = MARGIN;
    setText(7.8, INK);
    for (const seg of model.distribution) {
      const label = t(`${seg.label}: ${seg.count}`);
      const w = doc.getTextWidth(label) + 9;
      if (lx + w > PAGE_W - MARGIN) {
        lx = MARGIN;
        y += 5;
      }
      doc.setFillColor(...STATUS_BAR[seg.status]);
      doc.rect(lx, y - 2.6, 3, 3, "F");
      doc.text(label, lx + 4.5, y);
      lx += w;
    }
    y += 5;
    paragraph(
      "Il blu indica requisiti implementati secondo l'autodichiarazione: il verde è riservato ai requisiti verificati, che in questo report sono assenti.",
      8,
      MUTED,
      "italic",
    );
  }

  // ===========================================================================
  // 4. Areas
  // ===========================================================================
  section(
    "4. Analisi per area normativa",
    "Conteggi per area del catalogo. La percentuale è l'implementazione dichiarata sui requisiti applicabili dell'area.",
  );
  table({
    head: [
      [
        "Area",
        "Appl.",
        "Valut.",
        "Impl.",
        "Parz.",
        "Non impl.",
        "Non val.",
        "Implementazione dichiarata",
        "Evidenze",
        "Lacune",
        "Azioni aperte",
      ].map(t),
    ],
    body: model.areas.map((a) => [
      t(a.name),
      String(a.applicable),
      String(a.assessed),
      String(a.implemented),
      String(a.partial),
      String(a.notImplemented),
      String(a.notAssessed),
      t(a.rate === null ? NOT_AVAILABLE : `${a.rate.toLocaleString("it-IT")}%`),
      "N/D",
      String(a.gaps),
      String(a.openTasks),
    ]),
    styles: { fontSize: 7.6, cellPadding: 1.5, halign: "center" },
    headStyles: { fontSize: 7, halign: "center" },
    columnStyles: {
      0: { cellWidth: 34, halign: "left", fontStyle: "bold" },
      7: { cellWidth: 30, minCellHeight: 10 },
    },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const a = model.areas[data.row.index];
      if (!a) return;
      if (data.column.index === 3) data.cell.styles.textColor = DECLARED;
      if (data.column.index === 4 && a.partial > 0) data.cell.styles.textColor = AMBER;
      if (data.column.index === 5 && a.notImplemented > 0) data.cell.styles.textColor = RED;
      if (data.column.index === 6 || data.column.index === 8) data.cell.styles.textColor = GREY;
    },
    didDrawCell: (data: CellHookData) => {
      if (data.section !== "body" || data.column.index !== 7) return;
      const a = model.areas[data.row.index];
      if (!a || a.rate === null) return;
      const x = data.cell.x + 3;
      const w = data.cell.width - 6;
      const by = data.cell.y + data.cell.height - 3.2;
      doc.setFillColor(...LINE);
      doc.rect(x, by, w, 1.6, "F");
      if (a.rate > 0) {
        doc.setFillColor(...DECLARED);
        doc.rect(x, by, (w * a.rate) / 100, 1.6, "F");
      }
    },
  });
  paragraph(
    "Legenda: Appl. = applicabili; Valut. = valutati tra gli applicabili (Impl. + Parz. + Non impl.); Impl. = implementati secondo autodichiarazione (blu); Parz. = parzialmente implementati (ambra); Non impl. = non implementati (rosso); Non val. = non valutati (grigio); Evidenze N/D = registro delle evidenze non disponibile.",
    7.8,
    MUTED,
    "italic",
  );
  subheading("Di che cosa si occupa ogni area", 30);
  table({
    head: [["Area", "Descrizione in parole semplici", "Riferimento normativo"].map(t)],
    body: model.areas.map((a) => [t(a.name), t(a.explanation || NOT_AVAILABLE), t(a.reference)]),
    styles: { fontSize: 7.8 },
    columnStyles: { 0: { cellWidth: 34, fontStyle: "bold" }, 2: { cellWidth: 52 } },
  });

  // ===========================================================================
  // 5. Gap analysis
  // ===========================================================================
  section(
    "5. Gap Analysis",
    "Le lacune di implementazione (requisiti parziali o non implementati) sono separate dalle carenze di verifica (requisiti dichiarati implementati ma non verificati).",
  );
  subheading("5.1 Lacune di implementazione", 30);
  if (model.gaps.length === 0) {
    paragraph("Non risultano lacune di implementazione tra i requisiti valutati.");
  } else {
    table({
      head: [
        [
          "Codice",
          "Requisito e descrizione del gap",
          "Stato attuale -> atteso",
          "Gravità",
          "Responsabile",
          "Evidenze",
          "Azioni correttive",
        ].map(t),
      ],
      body: model.gaps.map((g) => [
        t(g.code),
        t(
          `${g.title}\n${g.description ? `Motivazione registrata: ${g.description}` : "Descrizione del gap non registrata"}`,
        ),
        t(`${g.currentStatus}\n-> ${g.expectedStatus}`),
        t(g.severity),
        t(g.owner ?? "Non indicato"),
        "Nessuna registrata",
        t(
          g.actions.length === 0
            ? "Nessuna"
            : g.actions
                .map(
                  (a) =>
                    `${a.code} · ${a.status}${a.dueDate ? ` · ${formatDate(a.dueDate)}` : ""}${a.overdue ? " · SCADUTA" : ""}`,
                )
                .join("\n"),
        ),
      ]),
      styles: { fontSize: 7.4, cellPadding: 1.5 },
      columnStyles: {
        0: { cellWidth: 19, fontStyle: "bold" },
        2: { cellWidth: 24 },
        3: { cellWidth: 19 },
        4: { cellWidth: 21 },
        5: { cellWidth: 16 },
        6: { cellWidth: 32 },
      },
      didParseCell: (data) => {
        if (data.section !== "body") return;
        const g = model.gaps[data.row.index];
        if (!g) return;
        if (data.column.index === 3) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.textColor =
            g.severityValue === "critical" || g.severityValue === "high"
              ? RED
              : g.severityValue === "medium"
                ? AMBER
                : g.severityValue
                  ? INK
                  : GREY;
        }
        if (data.column.index === 2)
          data.cell.styles.textColor = g.currentStatus === "Non implementato" ? RED : AMBER;
        if (data.column.index === 5) data.cell.styles.textColor = GREY;
        if (data.column.index === 6 && g.actions.some((a) => a.overdue)) data.cell.styles.textColor = RED;
      },
    });
  }

  subheading("5.2 Carenze di verifica", 30);
  const vg = model.verificationGap;
  paragraph(
    vg.declaredUnverified === 0
      ? "Nessun requisito risulta dichiarato implementato: non ci sono carenze di verifica da segnalare."
      : `${vg.declaredUnverified} ${vg.declaredUnverified === 1 ? "requisito è dichiarato" : "requisiti sono dichiarati"} «Implementato» senza evidenze né verifica registrate. Non sono lacune di implementazione: sono dichiarazioni ancora da documentare e verificare.`,
    9.2,
  );
  if (vg.autoClosed.length > 0) {
    paragraph(
      "I requisiti seguenti sono passati a «Implementato» automaticamente quando tutte le attività correttive collegate sono state completate. Il completamento delle attività non è una verifica di efficacia.",
      9,
      MUTED,
    );
    table({
      head: [
        [
          "Codice",
          "Requisito",
          "Stato dichiarato in precedenza",
          "Aggiornato il",
          "Attività collegate",
          "Verifica di efficacia",
        ].map(t),
      ],
      body: vg.autoClosed.map((a) => [
        t(a.code),
        t(a.title),
        t(a.previousStatus),
        t(a.closedOn),
        t(a.tasks),
        "Non verificata",
      ]),
      styles: { fontSize: 7.6 },
      columnStyles: {
        0: { cellWidth: 20, fontStyle: "bold" },
        2: { cellWidth: 28 },
        3: { cellWidth: 20 },
        4: { cellWidth: 28 },
        5: { cellWidth: 22, textColor: AMBER },
      },
    });
  }

  // ===========================================================================
  // 6. Remediation plan
  // ===========================================================================
  section(
    "6. Piano di adeguamento",
    "Tutte le azioni correttive registrate e collegate ai requisiti di questo assessment, con le scadute in testa. Il completamento di un'azione e la verifica della sua efficacia sono eventi distinti.",
  );
  if (model.plan.length === 0) {
    paragraph("Non risultano azioni correttive registrate per i requisiti di questo assessment.");
  } else {
    table({
      head: [
        ["ID", "Req.", "Azione", "Priorità", "Responsabile", "Date", "Stato", "Evidenze ed efficacia"].map(t),
      ],
      body: model.plan.map((p) => [
        t(p.code),
        t(p.requirement),
        t(
          p.description
            ? `${p.title}\n${p.description.length > 260 ? `${p.description.slice(0, 260)}…` : p.description}`
            : p.title,
        ),
        t(p.priority),
        t(p.assignee ?? "Non assegnata"),
        t(
          [
            `Aperta: ${formatDate(p.openedAt)}`,
            `Scadenza: ${date(p.dueDate)}`,
            p.completedAt ? `Completata: ${formatDate(p.completedAt)}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
        ),
        t(p.overdue ? `${p.status}\nSCADUTA` : p.status),
        t(`Evidenze: ${p.completionEvidence}\nEfficacia: ${p.effectiveness}`),
      ]),
      styles: { fontSize: 7.2, cellPadding: 1.4 },
      columnStyles: {
        0: { cellWidth: 19, fontStyle: "bold" },
        1: { cellWidth: 17 },
        3: { cellWidth: 14 },
        4: { cellWidth: 21 },
        5: { cellWidth: 27 },
        6: { cellWidth: 16 },
        7: { cellWidth: 27 },
      },
      didParseCell: (data) => {
        if (data.section !== "body") return;
        const p = model.plan[data.row.index];
        if (!p) return;
        if (data.column.index === 6 && p.overdue) {
          data.cell.styles.textColor = RED;
          data.cell.styles.fontStyle = "bold";
        }
        if (data.column.index === 3 && (p.priorityValue === "critical" || p.priorityValue === "high"))
          data.cell.styles.textColor = RED;
        if (data.column.index === 7) data.cell.styles.textColor = p.statusValue === "done" ? AMBER : MUTED;
      },
    });
  }

  // ===========================================================================
  // 7–8. Evidence and risks
  // ===========================================================================
  section("7. Gestione delle evidenze");
  box(model.evidence.message, { color: GREY, size: 8.8 });
  section("8. Analisi dei rischi");
  box(model.risks.message, { color: GREY, size: 8.8 });

  // ===========================================================================
  // 9. Recommendations
  // ===========================================================================
  section(
    "9. Raccomandazioni operative",
    "Indicazioni gestionali ricavate dai dati di questo assessment (lacune, ritardi, valutazioni mancanti, dichiarazioni non verificate). Non sono obblighi normativi e non interpretano la norma.",
  );
  if (model.recommendations.length === 0) paragraph("Nessuna raccomandazione derivata dai dati.");
  else list(model.recommendations, true);

  // ===========================================================================
  // 10. Conclusions
  // ===========================================================================
  section("10. Conclusioni e limitazioni");
  keyValue(
    model.conclusions.map((c) => [c.title, c.text]),
    42,
    8.8,
  );
  subheading("Limiti dell'assessment", 20);
  list(model.limitations, false, 8.9);
  box(DISCLAIMER, { title: "Avvertenza", color: NAVY, size: 8.6 });

  // ===========================================================================
  // Annex A. Criteria, legends and glossary (read before the register)
  // ===========================================================================
  section("Allegato A – Criteri di calcolo, legende e glossario");
  subheading("Criteri di calcolo", 24);
  list(model.criteria, false, 8.8);
  subheading("Stato di attuazione (dichiarato dall'organizzazione)", 30);
  table({
    theme: "plain",
    styles: { fontSize: 8.6, cellPadding: 1.3 },
    columnStyles: { 0: { cellWidth: 46, fontStyle: "bold" } },
    body: IMPLEMENTATION_STATUS_TEXT.map((s) => [t(s.label), t(s.text)]),
  });
  subheading("Stato di verifica", 30);
  paragraph(
    "Stati previsti dal modello del report. Alla data del report la piattaforma non gestisce verifiche: ogni requisito applicabile risulta «Non verificato».",
    8.6,
    MUTED,
  );
  table({
    theme: "plain",
    styles: { fontSize: 8.6, cellPadding: 1.3 },
    columnStyles: { 0: { cellWidth: 46, fontStyle: "bold" } },
    body: VERIFICATION_STATUS_TEXT.map((s) => [t(s.label), t(s.text)]),
  });
  subheading("Colori", 26);
  for (const c of COLOR_LEGEND) {
    ensure(6);
    doc.setFillColor(...LEGEND_COLOR[c.color]);
    doc.rect(MARGIN, y - 2.7, 3.2, 3.2, "F");
    setText(8.6, INK);
    doc.text(t(c.text), MARGIN + 6, y);
    y += 5;
  }
  y += 2;
  subheading("Glossario", 30);
  table({
    theme: "plain",
    styles: { fontSize: 8.6, cellPadding: 1.3 },
    columnStyles: { 0: { cellWidth: 46, fontStyle: "bold" } },
    body: GLOSSARY.map((g) => [t(g.term), t(g.text)]),
  });

  // ===========================================================================
  // Annex B. Requirement register (last: it is the longest part)
  // ===========================================================================
  newPage();
  section(
    "Allegato B – Registro dettagliato dei requisiti",
    "Per ogni requisito il registro risponde a cinque domande: che cosa è richiesto (testo ufficiale e fonte), che cosa dichiara l'organizzazione, quali evidenze lo documentano, chi lo ha verificato e con quale esito, quali attività o rischi restano aperti. Se un'informazione non è registrata, è indicato esplicitamente.",
  );
  for (const area of model.register) {
    subheading(`${area.name} (${area.code})`, 48);
    table({
      head: [
        [
          "Requisito",
          "Che cosa è richiesto",
          "Stato dichiarato",
          "Dichiarazione dell'organizzazione",
          "Evidenze, verifica, aperto",
        ].map(t),
      ],
      body: area.items.map((i) => [
        t(`${i.code}\n${i.showTitle ? `${i.title}\n` : ""}${i.applicability}`),
        t(`${i.description}\n\nFonte: ${i.sourceReference}`),
        t(
          [
            i.status,
            i.automatic ? "(aggiornato automaticamente)" : null,
            i.statusValue === "implemented" ? "autodichiarato" : null,
            i.severity ? `Gravità: ${i.severity}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
        ),
        t(
          [
            i.justification
              ? `Motivazione: ${i.justification}${i.justificationTruncated ? " (testo completo nella piattaforma)" : ""}`
              : i.statusValue === "not_assessed"
                ? "Non ancora valutato"
                : "Motivazione non registrata",
            i.autoNote
              ? `Nota di sistema: aggiornato il ${i.autoNote.date} per completamento delle attività (${i.autoNote.tasks})${i.previousStatus ? `; stato precedente: ${i.previousStatus}` : ""}.`
              : null,
            `Responsabile: ${i.owner ?? "non indicato"}`,
            `Ultima valutazione: ${i.assessedAt ? formatDate(i.assessedAt) : "—"}${i.assessedBy ? `, ${i.assessedBy}` : ""}`,
          ]
            .filter(Boolean)
            .join("\n"),
        ),
        t(
          [
            `Evidenze: ${i.evidence}`,
            i.statusValue === "not_applicable"
              ? `Verifica: ${i.verification}`
              : `Verifica: ${i.verification}; ${i.verifier}`,
            `Rischi: ${i.risks}`,
            i.actions.length
              ? `Azioni: ${i.actions.map((a) => `${a.code} (${a.status.toLowerCase()}${a.dueDate ? `, ${formatDate(a.dueDate)}` : ""})`).join("; ")}`
              : "Azioni: nessuna",
          ].join("\n"),
        ),
      ]),
      styles: { fontSize: 7, cellPadding: 1.5 },
      columnStyles: {
        0: { cellWidth: 22 },
        2: { cellWidth: 21, fontStyle: "bold" },
        3: { cellWidth: 42 },
        4: { cellWidth: 34 },
      },
      didParseCell: (data) => {
        if (data.section !== "body") return;
        const item = area.items[data.row.index];
        if (!item) return;
        if (data.column.index === 2) data.cell.styles.textColor = STATUS_COLOR[item.statusValue];
        if (data.column.index === 4) data.cell.styles.textColor = MUTED;
      },
      didDrawCell: (data: CellHookData) => {
        // Requirement code in bold navy on the first line of column 0.
        if (data.section !== "body" || data.column.index !== 0) return;
        const item = area.items[data.row.index];
        if (!item) return;
        const left = data.cell.x + data.cell.padding("left");
        const top = data.cell.y + data.cell.padding("top");
        doc.setFillColor(...(data.row.index % 2 ? ZEBRA : WHITE));
        doc.rect(data.cell.x + 0.2, top - 0.3, data.cell.width - 0.4, 3.3, "F");
        setText(7, NAVY, "bold");
        doc.text(t(item.code), left, top + 2.45);
      },
    });
  }

  // ===========================================================================
  // Header and footer on every page
  // ===========================================================================
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    if (p > 1) {
      drawLogo(MARGIN, 8.2, 5, NAVY, WHITE);
      setText(7.5, NAVY, "bold");
      doc.text("NIS2 Control", MARGIN + 7, 11.8);
      setText(7.5, MUTED);
      doc.text(t(`· ${input.organization.name}`), MARGIN + 26, 11.8, { maxWidth: 90 });
      doc.text(t(`${model.reportCode} · ${model.confidentiality}`), PAGE_W - MARGIN, 11.8, {
        align: "right",
      });
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.2);
      doc.line(MARGIN, 15, PAGE_W - MARGIN, 15);
    }
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, PAGE_H - 13, PAGE_W - MARGIN, PAGE_H - 13);
    setText(7, MUTED);
    doc.text(
      t(
        `Catalogo ${input.catalogue.versionLabel} · Generato il ${formatDateTime(input.generatedAt)} · Formato ${model.formatVersion} · Non costituisce certificazione di conformità`,
      ),
      MARGIN,
      PAGE_H - 8.5,
      { maxWidth: CONTENT_W - 25 },
    );
    doc.text(t(`Pagina ${p} di ${pages}`), PAGE_W - MARGIN, PAGE_H - 8.5, { align: "right" });
  }

  return doc;
}
