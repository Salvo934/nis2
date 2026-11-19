#!/usr/bin/env node
// Extracts the text of an official PDF (docs/fonti/**) into a .txt next to it,
// rebuilding lines from glyph positions. The .txt is what the catalogue
// parsers read and what the verification step compares against.
//
//   node scripts/catalog/extract-pdf-text.mjs docs/fonti/acn/allegato-1-v2.pdf
import { readFileSync, writeFileSync } from "node:fs";

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Usage: extract-pdf-text.mjs <file.pdf> [...]");
  process.exit(1);
}

for (const input of files) {
  const doc = await getDocument({
    data: new Uint8Array(readFileSync(input)),
    isEvalSupported: false,
    disableFontFace: true,
    verbosity: 0,
  }).promise;

  let text = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    /** @type {Map<number, {x: number, s: string}[]>} */
    const lines = new Map();
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const y = Math.round(item.transform[5]);
      const key = [...lines.keys()].find((k) => Math.abs(k - y) <= 2) ?? y;
      if (!lines.has(key)) lines.set(key, []);
      lines.get(key).push({ x: item.transform[4], s: item.str });
    }
    const ordered = [...lines.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, items]) =>
        items
          .sort((a, b) => a.x - b.x)
          .map((i) => i.s)
          .join("")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter(Boolean);
    text += `\n=== PAGINA ${p} ===\n${ordered.join("\n")}\n`;
  }

  const output = input.replace(/\.pdf$/i, ".txt");
  writeFileSync(output, text);
  console.log(`✔ ${input} → ${output} (${doc.numPages} pagine)`);
}
