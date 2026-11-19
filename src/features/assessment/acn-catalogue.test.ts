import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Verifies the ACN catalogue datasets against the official texts saved in
 * docs/fonti/acn (extracted with scripts/catalog/extract-pdf-text.mjs).
 */
const root = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const flat = (s: string) => s.replace(/\s+/g, " ").trim();

type Req = {
  code: string;
  title: string;
  description: string;
  requirement_text: string;
  art24_letters: string[];
  measure: { code: string; statement: string };
};

function officialBody(txt: string) {
  // Same cleaning as the parser: no page markers, running headers/footers,
  // footnote markers or the page-1 footnote; appendix excluded.
  const kept: string[] = [];
  let footnote = false;
  for (const line of txt.split("\n").map((l) => l.trim())) {
    if (line === "Appendice") break;
    if (!line || line.startsWith("=== PAGINA") || /^\d+ di \d+$/.test(line) || /^\d{1,2}$/.test(line))
      continue;
    if (/^Allegato [12] – Misure di sicurezza di base/.test(line)) continue;
    if (line.startsWith("Per ragioni di coerenza con i titoli")) footnote = true;
    if (footnote) {
      if (line.endsWith("“soggetto NIS”.")) footnote = false;
      continue;
    }
    kept.push(line);
  }
  return flat(kept.join(" "));
}

const guide = flat(read("docs/fonti/acn/guida-alla-lettura-specifiche-di-base.txt"));

describe.each([
  { annex: 1, subject: "soggetti importanti" },
  { annex: 2, subject: "soggetti essenziali" },
])("ACN Allegato $annex", ({ annex, subject }) => {
  const dataset = JSON.parse(read(`data/catalogs/acn-379907-2025-allegato-${annex}.json`)) as {
    requirements: Req[];
    version: { source_title: string };
  };
  const body = officialBody(read(`docs/fonti/acn/allegato-${annex}-v2.txt`));
  const measures = new Set(dataset.requirements.map((r) => r.measure.code));

  it("matches the counts published in the ACN reading guide", () => {
    const m = new RegExp(`(\\d+) misure(?: di sicurezza)? con (\\d+) requisiti per i ${subject}`).exec(guide);
    expect(m, "count sentence not found in the guide").not.toBeNull();
    expect(measures.size).toBe(Number(m![1]));
    expect(dataset.requirements).toHaveLength(Number(m![2]));
  });

  it("reports every requirement and measure statement verbatim", () => {
    for (const r of dataset.requirements) {
      expect(body, r.code).toContain(flat(r.requirement_text));
      expect(body, r.code).toContain(flat(r.measure.statement));
      expect(flat(r.description)).toContain(flat(r.requirement_text));
    }
  });

  it("never glues a following measure or category into a requirement", () => {
    for (const r of dataset.requirements) {
      expect(r.requirement_text, r.code).not.toMatch(/\d+\.\d+\.\d+\. [A-Z]{2}\.[A-Z]{2}-\d{2}/);
      expect(r.requirement_text, r.code).not.toMatch(/\(([A-Z]{2}\.[A-Z]{2})\):/);
    }
  });

  it("has unique codes and titles taken from the official text", () => {
    const codes = dataset.requirements.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const r of dataset.requirements) {
      expect(flat(r.requirement_text).startsWith(r.title.replace(/…$/, ""))).toBe(true);
    }
  });

  it("links every measure to art. 24, c. 2, D.Lgs. 138/2024 as in Appendice A of the guide", () => {
    // The table of contents also mentions the appendices: search after the heading.
    const start = guide.lastIndexOf("Appendice A – corrispondenza elementi misure");
    const appendix = guide.slice(start, guide.indexOf("Appendice B", start));
    expect(appendix.length).toBeGreaterThan(100);
    for (const r of dataset.requirements) {
      expect(r.art24_letters.length, r.code).toBeGreaterThan(0);
      expect(appendix, r.measure.code).toContain(r.measure.code);
    }
  });
});

describe("ACN determination", () => {
  const det = flat(read("docs/fonti/acn/detacn_obblighi_2511-v3_signed.txt"));
  it("is the one that replaces determination 164179 and applies from 15 January 2026", () => {
    expect(det).toContain("aggiorna e sostituisce la determinazione ACN n. 164179 del 14 aprile 2025");
    expect(det).toContain("si applica a decorrere dal 15 gennaio 2026");
    expect(det).toContain("diciotto mesi dalla ricezione");
  });
});
