#!/usr/bin/env node
// Builds a catalogue dataset (data/catalogs/*.json) from the text of an ACN
// annex with the basic security measures ("misure di sicurezza di base").
//
//   node scripts/catalog/parse-acn-annex.mjs 1   # Allegato 1 – soggetti importanti
//   node scripts/catalog/parse-acn-annex.mjs 2   # Allegato 2 – soggetti essenziali
//
// Every requirement keeps the official text verbatim; nothing is paraphrased.
// The link to art. 24, comma 2, D.Lgs. 138/2024 comes from Appendice A of the
// ACN "Guida alla lettura" (see ART24_MAPPING below), not from our judgement.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const annex = process.argv[2];
if (annex !== "1" && annex !== "2") {
  console.error("Usage: parse-acn-annex.mjs <1|2>");
  process.exit(1);
}

const SOURCES = {
  1: {
    txt: "docs/fonti/acn/allegato-1-v2.txt",
    pdf: "docs/fonti/acn/allegato-1-v2.pdf",
    url: "https://www.acn.gov.it/portale/documents/d/guest/allegato-1-v2",
    subject: "soggetti importanti",
    expected: { measures: 37, requirements: 87 },
  },
  2: {
    txt: "docs/fonti/acn/allegato-2-v2.txt",
    pdf: "docs/fonti/acn/allegato-2-v2.pdf",
    url: "https://www.acn.gov.it/portale/documents/d/guest/allegato-2-v2",
    subject: "soggetti essenziali",
    expected: { measures: 43, requirements: 116 },
  },
}[annex];

/**
 * Appendice A – "corrispondenza elementi misure" of the ACN Guida alla lettura
 * (docs/fonti/acn/guida-alla-lettura-specifiche-di-base.txt, page 21):
 * mapping between basic measures and the elements of art. 24, comma 2,
 * D.Lgs. 138/2024. Transcribed as published; checked by tests against the text.
 */
export const ART24_MAPPING = {
  a: ["GV.OC-04", "GV.RM-03", "GV.RR-02", "GV.PO-01", "GV.PO-02", "ID.RA-05", "ID.RA-06"],
  b: ["PR.PS-04", "DE.CM-01", "DE.CM-09", "RS.MA-01", "RS.CO-02", "RC.RP-01", "RC.CO-03"],
  c: ["ID.IM-04", "PR.DS-11"],
  d: ["GV.SC-01", "GV.SC-02", "GV.SC-04", "GV.SC-05", "GV.SC-07"],
  e: ["GV.SC-05", "ID.RA-01", "ID.RA-08", "PR.PS-01", "PR.PS-02", "PR.PS-03", "PR.PS-06"],
  f: ["ID.IM-01"],
  g: ["PR.AT-01", "PR.AT-02"],
  h: ["PR.DS-01", "PR.DS-02"],
  i: ["GV.RR-04", "ID.AM-01", "ID.AM-02", "ID.AM-03", "ID.AM-04", "PR.AA-01", "PR.AA-03", "PR.AA-05", "PR.AA-06", "PR.IR-01"],
  l: ["PR.AA-03", "PR.DS-02", "PR.IR-03"],
};

const fail = (msg) => {
  console.error(`✖ ${msg}`);
  process.exit(1);
};

// -----------------------------------------------------------------------------
// 1. Clean the extracted text: page markers, running headers/footers, the
//    footnote on page 1 and its superscript marker. Stop at the appendix.
// -----------------------------------------------------------------------------
const raw = readFileSync(SOURCES.txt, "utf8").split("\n");
const lines = [];
let inFootnote = false;
for (const original of raw) {
  const line = original.trim();
  if (!line) continue;
  if (line === "Appendice") break;
  if (line.startsWith("=== PAGINA")) continue;
  if (/^Allegato [12] – Misure di sicurezza di base per i soggetti/.test(line)) continue;
  if (/^\d+ di \d+$/.test(line)) continue;
  if (/^\d{1,2}$/.test(line)) continue; // footnote marker
  if (line.startsWith("Per ragioni di coerenza con i titoli")) inFootnote = true;
  if (inFootnote) {
    if (line.endsWith("“soggetto NIS”.")) inFootnote = false;
    continue;
  }
  lines.push(line);
}
if (lines[0] !== `ALLEGATO ${annex}`) fail(`unexpected first line: ${lines[0]}`);
const annexTitle = lines[1];
const body = lines.slice(2);

// -----------------------------------------------------------------------------
// 2. Parse functions → categories → measures → numbered requirements.
// -----------------------------------------------------------------------------
const FUNCTION_RE = /^(\d)\. ([A-ZÀ-Ù ]+) \(([A-Z]+)\)$/;
const CATEGORY_RE = /^(\d\.\d+)\. (.+?) \(([A-Z]{2}\.[A-Z]{2})\): (.*)$/;
// The official text uses "ID.RA-01." and "PR.AT-02." (dot) instead of ":".
const MEASURE_RE = /^(\d\.\d+\.\d+)\. ([A-Z]{2}\.[A-Z]{2}-\d{2})[:.] (.*)$/;
const REQUIREMENT_RE = /^(\d+)\. (.*)$/;

const functions = [];
let fn = null;
let category = null;
let measure = null;
let requirement = null;
let target = null; // object whose `text` receives continuation lines

const append = (obj, line) => {
  // Keep list items (a), b), …) on their own line for readability.
  obj.text = obj.text ? `${obj.text}${/^[a-z]\) /.test(line) ? "\n" : " "}${line}` : line;
};

for (const line of body) {
  let m;
  if ((m = FUNCTION_RE.exec(line))) {
    fn = { number: m[1], name: m[2].trim(), code: m[3], categories: [] };
    functions.push(fn);
    category = measure = requirement = null;
    target = null;
  } else if ((m = CATEGORY_RE.exec(line))) {
    if (!fn) fail(`category outside a function: ${line}`);
    category = { number: m[1], name: m[2].trim(), code: m[3], text: m[4], measures: [] };
    fn.categories.push(category);
    measure = requirement = null;
    target = category;
  } else if ((m = MEASURE_RE.exec(line))) {
    if (!category) fail(`measure outside a category: ${line}`);
    measure = { number: m[1], code: m[2], text: m[3], requirements: [] };
    category.measures.push(measure);
    requirement = null;
    target = measure;
  } else if (measure && (m = REQUIREMENT_RE.exec(line)) && Number(m[1]) === measure.requirements.length + 1) {
    requirement = { number: Number(m[1]), text: m[2] };
    measure.requirements.push(requirement);
    target = requirement;
  } else if (target) {
    append(target, line);
  } else {
    fail(`unparsed line: ${line}`);
  }
}

// -----------------------------------------------------------------------------
// 3. Checks against the official counts (ACN Guida alla lettura).
// -----------------------------------------------------------------------------
const measures = functions.flatMap((f) => f.categories.flatMap((c) => c.measures.map((mm) => ({ f, c, m: mm }))));
const requirementCount = measures.reduce((n, x) => n + x.m.requirements.length, 0);
if (measures.length !== SOURCES.expected.measures) fail(`measures: ${measures.length} ≠ ${SOURCES.expected.measures}`);
if (requirementCount !== SOURCES.expected.requirements) {
  fail(`requirements: ${requirementCount} ≠ ${SOURCES.expected.requirements}`);
}
for (const { m: mm } of measures) {
  if (mm.requirements.length === 0) fail(`${mm.code} has no requirements`);
}

const lettersFor = (code) =>
  Object.entries(ART24_MAPPING)
    .filter(([, codes]) => codes.includes(code))
    .map(([letter]) => letter);

const FUNCTION_LABELS = {
  GOVERN: "Governo",
  IDENTIFY: "Identificazione",
  PROTECT: "Protezione",
  DETECT: "Rilevamento",
  RESPOND: "Risposta",
  RECOVER: "Ripristino",
};

const FUNCTION_CODES = { GOVERN: "GV", IDENTIFY: "ID", PROTECT: "PR", DETECT: "DE", RESPOND: "RS", RECOVER: "RC" };

const truncate = (text, max) => {
  const flat = text.replace(/\s+/g, " ");
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
};

let order = 0;
const requirements = measures.flatMap(({ f, c, m: mm }) => {
  const letters = lettersFor(mm.code);
  if (letters.length === 0) fail(`${mm.code} is not in Appendice A (art. 24 mapping)`);
  const law = `D.Lgs. 138/2024, art. 24, c. 2, lett. ${letters.map((l) => `${l})`).join(" e ")}`;
  return mm.requirements.map((r) => {
    order += 10;
    return {
      code: `${mm.code}.${r.number}`,
      category_code: FUNCTION_CODES[f.code],
      category_name: `${FUNCTION_LABELS[f.code] ?? f.name} (${f.code})`,
      // Title = start of the official requirement text (truncated, never reworded).
      title: truncate(r.text, 180),
      description: `Misura ${mm.code} – ${mm.text}\n\nRequisito ${r.number}. ${r.text}`,
      source_reference: `Det. ACN 379907/2025, All. ${annex}, misura ${mm.code}, requisito ${r.number} · ${law}`,
      sort_order: order,
      // Extra structure kept in the dataset for traceability (not stored in DB).
      measure: { code: mm.code, statement: mm.text, category: `${c.name} (${c.code})` },
      requirement_text: r.text,
      art24_letters: letters,
    };
  });
});

const pdfHash = createHash("sha256").update(readFileSync(SOURCES.pdf)).digest("hex");

const dataset = {
  framework: {
    code: "NIS2-ACN",
    name: "Misure di sicurezza di base ACN (D.Lgs. 138/2024)",
    issuing_authority: "Agenzia per la cybersicurezza nazionale",
  },
  version: {
    version_label: `ACN-379907-2025-all${annex}`,
    source_title: `Determinazione ACN n. 379907 del 19 dicembre 2025, ${annexTitle.replace(/^Misure/, "Allegato " + annex + " – Misure")}`,
    source_url: SOURCES.url,
    source_published_at: "2025-12-19",
    scope_note:
      `Misure di sicurezza di base per i ${SOURCES.subject} (Allegato ${annex}), specifiche degli obblighi di cui agli articoli 23 e 24 del D.Lgs. 138/2024. ` +
      "La determinazione aggiorna e sostituisce la n. 164179 del 14 aprile 2025 e si applica dal 15 gennaio 2026; " +
      "termine di adozione: diciotto mesi dalla comunicazione di inserimento nell'elenco dei soggetti NIS (art. 3). " +
      "Testo dei requisiti riportato integralmente; il riferimento all'art. 24, c. 2, segue l'Appendice A della Guida alla lettura ACN. " +
      "Non sono incluse le tabelle in appendice all'allegato né gli incidenti significativi di base (allegati 3 e 4).",
    retrieved_from: SOURCES.url,
    retrieved_at: "2026-11-19",
    source_pdf_sha256: pdfHash,
  },
  requirements,
};

const out = `data/catalogs/acn-379907-2025-allegato-${annex}.json`;
writeFileSync(out, `${JSON.stringify(dataset, null, 2)}\n`);
console.log(`✔ Allegato ${annex}: ${measures.length} misure, ${requirementCount} requisiti → ${out}`);
