#!/usr/bin/env node
/**
 * Builds the migration that defines the demo dataset from
 * data/demo/rossi-logistica.json, so the database and the sample PDF on the
 * home page use exactly the same fictitious data.
 *
 *   node scripts/demo/build-migration.mjs <output.sql>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const out = process.argv[2];
if (!out) {
  console.error("usage: build-migration.mjs <output.sql>");
  process.exit(1);
}
const data = JSON.parse(readFileSync(resolve("data/demo/rossi-logistica.json"), "utf8"));
delete data.$comment;
const json = JSON.stringify(data);
const TAG = "$demo$";
if (json.includes(TAG)) throw new Error("dataset must not contain the dollar-quote tag");

// Every requirement code must exist in the catalogue the demo uses.
const catalogue = JSON.parse(readFileSync(resolve("data/catalogs/acn-379907-2025-allegato-1.json"), "utf8"));
if (catalogue.version.version_label !== data.assessment.catalogue_version)
  throw new Error("catalogue version mismatch");
const codes = new Set(catalogue.requirements.map((r) => r.code));
for (const a of data.answers) if (!codes.has(a.code)) throw new Error(`unknown requirement ${a.code}`);
for (const t of data.tasks) if (!codes.has(t.code)) throw new Error(`unknown requirement ${t.code}`);

const template = readFileSync(resolve("scripts/demo/migration.template.sql"), "utf8");
writeFileSync(out, template.replace("__DEMO_DATASET__", `${TAG}${json}${TAG}`));
console.log(`wrote ${out} (${data.answers.length} answers, ${data.tasks.length} tasks)`);
