import { jsPDF } from "jspdf";
import { autoTable, type CellHookData } from "jspdf-autotable";

import type { ReportModel } from "@/features/reports/model";
import { DISCLAIMER, GLOSSARY, STATUS_EXPLANATIONS } from "@/features/reports/texts";
import { formatDate, formatDateTime } from "@/lib/format";

// -----------------------------------------------------------------------------
// Text encoding: the standard PDF fonts use WinAnsi (cp1252). Accents, curly
// quotes, dashes, «» and € are supported; a few symbols are not and are
// replaced with ASCII equivalents so nothing is silently corrupted.
// -----------------------------------------------------------------------------
const CP1252_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
const REPLACEMENTS: Record<string, string> = {
  "→": "->",
  "←": "<-",
  "≥": ">=",
  "≤": "<=",
  "≠": "!=",
  " ": " ",
  " ": " ",
  "​": "",
  "✓": "v",
  "−": "-",
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
// Layout constants
// -----------------------------------------------------------------------------
type RGB = [number, number, number];
const NAVY: RGB = [30, 51, 89];
const INK: RGB = [33, 37, 49];
const MUTED: RGB = [100, 108, 125];
const LIGHT: RGB = [241, 244, 249];
const LINE: RGB = [215, 221, 232];
const GREEN: RGB = [30, 132, 80];
const AMBER: RGB = [190, 120, 10];
const RED: RGB = [190, 45, 45];

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 16;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM = PAGE_H - 20;

const STATUS_COLOR: Record<string, RGB> = {
  implemented: GREEN,
  partial: AMBER,
  not_implemented: RED,
  not_applicable: MUTED,
  not_assessed: MUTED,
};

type Doc = jsPDF & { lastAutoTable?: { finalY: number } };

export function renderReportPdf(model: ReportModel): jsPDF {
  const { input, metrics, taskMetrics } = model;
  const doc: Doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const t = toPdfText;
  let y = MARGIN;

  doc.setProperties({
    title: t(`Report NIS2 – ${input.organization.name} – ${input.assessment.title}`),
    subject: t(`Assessment «${input.assessment.title}» – ${input.catalogue.label}`),
    author: t(input.generatedBy),
    creator: "NIS2 Control",
  });

  // --- helpers ---------------------------------------------------------------
  const ensure = (height: number) => {
    if (y + height > BOTTOM) {
      doc.addPage();
      y = MARGIN + 4;
    }
  };
  const setText = (size: number, color: RGB = INK, style: "normal" | "bold" | "italic" = "normal") => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };
  const lineHeight = (size: number) => size * 0.42;
  const paragraph = (
    text: string,
    size = 10,
    color: RGB = INK,
    style: "normal" | "bold" | "italic" = "normal",
    indent = 0,
  ) => {
    setText(size, color, style);
    const lines = doc.splitTextToSize(t(text), CONTENT_W - indent) as string[];
    for (const line of lines) {
      ensure(lineHeight(size) + 1);
      doc.text(line, MARGIN + indent, y);
      y += lineHeight(size) + 0.8;
    }
    y += 1.5;
  };
  const section = (title: string, intro?: string) => {
    ensure(22);
    y += 4;
    setText(15, NAVY, "bold");
    doc.text(t(title), MARGIN, y);
    y += 2.5;
    doc.setDrawColor(...NAVY);
    doc.setLineWidth(0.6);
    doc.line(MARGIN, y, MARGIN + 24, y);
    y += 6;
    if (intro) paragraph(intro, 10, MUTED);
  };
  const subheading = (title: string) => {
    ensure(14);
    y += 2;
    setText(11.5, INK, "bold");
    doc.text(t(title), MARGIN, y);
    y += 6;
  };
  const list = (items: string[], numbered = false) => {
    items.forEach((item, i) => {
      setText(10, INK);
      const marker = numbered ? `${i + 1}.` : "•";
      const lines = doc.splitTextToSize(t(item), CONTENT_W - 7) as string[];
      ensure(lineHeight(10) * Math.min(lines.length, 3) + 2);
      doc.text(marker, MARGIN + 1, y);
      for (const line of lines) {
        ensure(lineHeight(10) + 1);
        doc.text(line, MARGIN + 7, y);
        y += lineHeight(10) + 0.8;
      }
      y += 1.2;
    });
    y += 1;
  };
  const table = (options: Parameters<typeof autoTable>[1]) => {
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN, top: MARGIN + 4, bottom: PAGE_H - BOTTOM + 2 },
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 8.5,
        cellPadding: 2,
        textColor: INK,
        lineColor: LINE,
        lineWidth: 0.2,
        valign: "top",
      },
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [250, 251, 253] },
      // Keep each row on one page (rows taller than a page are still split).
      rowPageBreak: "avoid",
      ...options,
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 6;
  };

  // ===========================================================================
  // Cover
  // ===========================================================================
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, PAGE_W, 74, "F");
  setText(10, [190, 205, 230], "bold");
  doc.text("NIS2 CONTROL", MARGIN, 18);
  setText(24, [255, 255, 255], "bold");
  doc.text(t("Report di valutazione NIS2"), MARGIN, 38);
  setText(13, [225, 232, 245]);
  doc.text(doc.splitTextToSize(t(input.organization.name), CONTENT_W) as string[], MARGIN, 50);
  setText(10, [190, 205, 230]);
  doc.text(t(`${input.assessment.title} · ${input.catalogue.label}`), MARGIN, 64, { maxWidth: CONTENT_W });
  y = 86;

  table({
    theme: "plain",
    styles: { fontSize: 9.5, cellPadding: 1.8, textColor: INK },
    columnStyles: { 0: { cellWidth: 52, textColor: MUTED }, 1: { fontStyle: "bold" } },
    body: [
      ["Organizzazione", input.organization.name],
      ["Classificazione NIS2 dichiarata", input.organization.classification],
      ["Assessment", input.assessment.title],
      ["Stato dell'assessment", input.assessment.status],
      ["Normativa di riferimento", input.catalogue.label],
      ["Versione del catalogo", input.catalogue.versionLabel],
      ["Data del report", formatDateTime(input.generatedAt)],
      ["Generato da", input.generatedBy],
    ].map((row) => row.map(t)),
  });

  // KPI tiles
  const kpis: { label: string; value: string; note: string; color: RGB }[] = [
    {
      label: "Requisiti applicabili",
      value: String(metrics.applicable),
      note: `su ${metrics.total} totali`,
      color: NAVY,
    },
    {
      label: "Implementati",
      value: `${metrics.implementationRate.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`,
      note: `${metrics.implemented} su ${metrics.applicable}`,
      color: GREEN,
    },
    {
      label: "Lacune da colmare",
      value: String(metrics.gaps),
      note: `${metrics.partial} parziali, ${metrics.notImplemented} assenti`,
      color: metrics.gaps ? AMBER : GREEN,
    },
    {
      label: "Attività aperte",
      value: String(taskMetrics.open),
      note: taskMetrics.overdue ? `${taskMetrics.overdue} in ritardo` : "nessuna in ritardo",
      color: taskMetrics.overdue ? RED : NAVY,
    },
  ];
  ensure(34);
  const tileW = (CONTENT_W - 3 * 4) / 4;
  kpis.forEach((k, i) => {
    const x = MARGIN + i * (tileW + 4);
    doc.setFillColor(...LIGHT);
    doc.roundedRect(x, y, tileW, 28, 2, 2, "F");
    doc.setFillColor(...k.color);
    doc.rect(x, y, 1.4, 28, "F");
    setText(8, MUTED, "bold");
    doc.text(t(k.label), x + 4, y + 7, { maxWidth: tileW - 6 });
    setText(18, k.color, "bold");
    doc.text(t(k.value), x + 4, y + 18);
    setText(7.5, MUTED);
    doc.text(t(k.note), x + 4, y + 24, { maxWidth: tileW - 6 });
  });
  y += 36;

  if (metrics.notAssessed > 0) {
    paragraph(
      `Attenzione: ${metrics.notAssessed} requisiti su ${metrics.total} non sono ancora stati valutati, quindi i numeri sono parziali.`,
      9.5,
      AMBER,
      "bold",
    );
  }
  doc.setFillColor(...LIGHT);
  const disclaimerLines = doc.splitTextToSize(t(DISCLAIMER), CONTENT_W - 8) as string[];
  ensure(disclaimerLines.length * 4.2 + 8);
  doc.roundedRect(MARGIN, y, CONTENT_W, disclaimerLines.length * 4.2 + 6, 2, 2, "F");
  setText(8.5, MUTED, "italic");
  doc.text(disclaimerLines, MARGIN + 4, y + 5);

  // ===========================================================================
  // 1. How to read
  // ===========================================================================
  doc.addPage();
  y = MARGIN + 4;
  section(
    "1. Come leggere questo report",
    "Il report fotografa, alla data indicata in copertina, quanto l'organizzazione ha messo in atto rispetto ai requisiti di una normativa sulla sicurezza informatica.",
  );
  paragraph(
    `Ogni requisito del catalogo «${input.catalogue.label}» è stato esaminato e gli è stato assegnato uno di questi esiti:`,
  );
  table({
    theme: "plain",
    styles: { fontSize: 9.5, cellPadding: 1.6 },
    columnStyles: { 0: { cellWidth: 42, fontStyle: "bold" } },
    body: STATUS_EXPLANATIONS.map((s) => [t(s.label), t(s.text)]),
  });
  paragraph(
    "Le valutazioni sono dichiarate dall'organizzazione stessa. Per questo, accanto a ogni esito, il report riporta la motivazione, il responsabile e la data dell'ultima valutazione, così chi legge può capire su cosa si basano.",
  );

  // ===========================================================================
  // 2. Summary
  // ===========================================================================
  section("2. In sintesi");
  list(model.summary);

  // ===========================================================================
  // 3. Areas
  // ===========================================================================
  section(
    "3. Avanzamento per area",
    "I requisiti sono raggruppati per area. Per ciascuna è indicato di che cosa si occupa, in parole semplici, e quanti requisiti applicabili risultano implementati.",
  );
  table({
    head: [["Area", "Di che cosa si occupa", "Implementati", "Lacune"]].map((r) => r.map(t)),
    body: model.areas.map((a) => [
      t(a.name),
      t(a.explanation),
      `${a.implemented}/${a.applicable}  (${t(`${a.rate.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`)})`,
      String(a.gaps),
    ]),
    columnStyles: {
      0: { cellWidth: 36, fontStyle: "bold" },
      2: { cellWidth: 34, minCellHeight: 11 },
      3: { cellWidth: 16, halign: "center" },
    },
    didDrawCell: (data: CellHookData) => {
      if (data.section !== "body" || data.column.index !== 2) return;
      const area = model.areas[data.row.index];
      if (!area) return;
      const x = data.cell.x + 2;
      const w = data.cell.width - 4;
      const by = data.cell.y + data.cell.height - 3.5;
      doc.setFillColor(...LINE);
      doc.roundedRect(x, by, w, 1.8, 0.9, 0.9, "F");
      if (area.rate > 0) {
        doc.setFillColor(...GREEN);
        doc.roundedRect(x, by, Math.max(1.8, (w * area.rate) / 100), 1.8, 0.9, 0.9, "F");
      }
    },
  });

  // ===========================================================================
  // 4. Gaps
  // ===========================================================================
  section(
    "4. Lacune da colmare",
    "Una lacuna è un requisito valutato «Parziale» o «Non implementato». La criticità è assegnata dall'organizzazione per stabilire le priorità: si consiglia di partire da quelle critiche e alte. Il testo completo di ogni requisito è riportato nella sezione 8.",
  );
  if (model.gaps.length === 0) {
    paragraph("Non risultano lacune tra i requisiti valutati.");
  } else {
    table({
      head: [["Codice", "Requisito", "Esito", "Criticità", "Attività correttive"]].map((r) => r.map(t)),
      body: model.gaps.map((g) => [
        t(g.code),
        t(g.justification ? `${g.title}\nMotivazione: ${g.justification}` : g.title),
        t(g.status),
        t(g.severity),
        t(
          g.totalTasks === 0
            ? "Nessuna"
            : `${g.openTasks} ${g.openTasks === 1 ? "aperta" : "aperte"} su ${g.totalTasks}${g.nextDue ? `\nprossima scadenza ${formatDate(g.nextDue)}` : ""}`,
        ),
      ]),
      columnStyles: {
        0: { cellWidth: 22, fontStyle: "bold" },
        2: { cellWidth: 24 },
        3: { cellWidth: 22 },
        4: { cellWidth: 32 },
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 3) {
          const v = String(data.cell.raw);
          if (v === "Critica" || v === "Alta") data.cell.styles.textColor = RED;
          else if (v === "Media") data.cell.styles.textColor = AMBER;
        }
      },
    });
  }

  // ===========================================================================
  // 5. Remediation plan
  // ===========================================================================
  section(
    "5. Piano di adeguamento",
    "Le attività correttive ancora aperte collegate a questo assessment, ordinate per scadenza. Quelle in ritardo sono evidenziate in rosso.",
  );
  if (model.openTasks.length === 0) {
    paragraph("Non ci sono attività correttive aperte collegate a questo assessment.");
  } else {
    table({
      head: [["Attività", "Requisito", "Priorità", "Responsabile", "Scadenza", "Stato"]].map((r) => r.map(t)),
      body: model.openTasks.map((o) => [
        t(o.title),
        t(o.requirement),
        t(o.priority),
        t(o.assignee),
        t(o.dueDate ? `${formatDate(o.dueDate)}${o.overdue ? "\nIN RITARDO" : ""}` : "—"),
        t(o.status),
      ]),
      columnStyles: {
        1: { cellWidth: 22 },
        2: { cellWidth: 18 },
        3: { cellWidth: 30 },
        4: { cellWidth: 24 },
        5: { cellWidth: 20 },
      },
      didParseCell: (data) => {
        if (
          data.section === "body" &&
          data.column.index === 4 &&
          String(data.cell.raw).includes("IN RITARDO")
        ) {
          data.cell.styles.textColor = RED;
          data.cell.styles.fontStyle = "bold";
        }
      },
    });
  }

  // ===========================================================================
  // 6. Next steps
  // ===========================================================================
  section(
    "6. Prossimi passi consigliati",
    "Indicazioni operative ricavate dai dati di questo assessment. Riguardano l'organizzazione del lavoro, non l'interpretazione della norma.",
  );
  list(model.nextSteps, true);

  // ===========================================================================
  // 7. Catalogue
  // ===========================================================================
  section("7. Normativa di riferimento");
  table({
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 1.6 },
    columnStyles: { 0: { cellWidth: 42, textColor: MUTED } },
    body: [
      ["Catalogo", input.catalogue.label],
      ["Fonte ufficiale", input.catalogue.sourceTitle],
      ["Versione", input.catalogue.versionLabel],
      ["Testo ufficiale", input.catalogue.sourceUrl ?? "—"],
      ["Ambito del catalogo", input.catalogue.scopeNote ?? "—"],
    ].map((r) => r.map(t)),
  });

  // ===========================================================================
  // 8. Requirement details
  // ===========================================================================
  section(
    "8. Dettaglio dei requisiti",
    "Per ogni requisito: testo ufficiale e riferimento normativo, esito della valutazione, motivazione, responsabile e data dell'ultima valutazione.",
  );
  for (const area of model.details) {
    subheading(area.name);
    table({
      head: [["Codice", "Testo ufficiale", "Esito", "Motivazione e responsabile"]].map((r) => r.map(t)),
      body: area.items.map((i) => [
        t(i.code),
        t(`${i.description}\n\nFonte: ${i.sourceReference}`),
        t(i.automatic ? `${i.status}\n(automatico)` : i.status),
        t(
          [
            i.justification ? `Motivazione: ${i.justification}` : "Motivazione: —",
            `Responsabile: ${i.owner ?? "—"}`,
            `Valutato il: ${i.assessedAt ? formatDate(i.assessedAt) : "—"}`,
          ].join("\n"),
        ),
      ]),
      styles: { fontSize: 7.8, cellPadding: 1.8 },
      columnStyles: { 0: { cellWidth: 21, fontStyle: "bold" }, 2: { cellWidth: 22 }, 3: { cellWidth: 50 } },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 2) {
          const item = area.items[data.row.index];
          if (item) {
            data.cell.styles.textColor = STATUS_COLOR[item.statusValue] ?? INK;
            data.cell.styles.fontStyle = "bold";
          }
        }
      },
    });
  }

  // ===========================================================================
  // 9–10. Criteria and glossary
  // ===========================================================================
  section("9. Criteri di calcolo");
  list(model.criteria);
  section("10. Glossario");
  table({
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 1.6 },
    columnStyles: { 0: { cellWidth: 48, fontStyle: "bold" } },
    body: GLOSSARY.map((g) => [t(g.term), t(g.text)]),
  });
  section("Avvertenze");
  paragraph(DISCLAIMER, 9.5, MUTED, "italic");

  // ===========================================================================
  // Footer on every page
  // ===========================================================================
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, PAGE_H - 13, PAGE_W - MARGIN, PAGE_H - 13);
    setText(7.5, MUTED);
    doc.text(
      t(
        `NIS2 Control · ${input.organization.name} · Report del ${formatDate(input.generatedAt)} · Non costituisce certificazione`,
      ),
      MARGIN,
      PAGE_H - 8.5,
      { maxWidth: CONTENT_W - 25 },
    );
    doc.text(t(`Pagina ${p} di ${pages}`), PAGE_W - MARGIN, PAGE_H - 8.5, { align: "right" });
  }

  return doc;
}
