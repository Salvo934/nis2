#!/usr/bin/env node
// Initialises a local checkout: creates .env.local from .env.example and
// checks that the required public Supabase variables are filled in.
// Does not contact any external service.
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const envLocal = resolve(root, ".env.local");
const envExample = resolve(root, ".env.example");

if (!existsSync(envLocal)) {
  copyFileSync(envExample, envLocal);
  console.log("✔ Creato .env.local da .env.example");
} else {
  console.log("• .env.local esiste già: non modificato");
}

const env = Object.fromEntries(
  readFileSync(envLocal, "utf8")
    .split("\n")
    .filter((line) => line.trim() && !line.trim().startsWith("#") && line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
);

const problems = [];
if (!env.NEXT_PUBLIC_SUPABASE_URL) problems.push("NEXT_PUBLIC_SUPABASE_URL è vuota");
if (!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.includes("xxxx")) {
  problems.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY non è stata impostata");
}
for (const key of Object.keys(env)) {
  if (key.startsWith("NEXT_PUBLIC_") && /SECRET|SERVICE_ROLE/i.test(key)) {
    problems.push(`${key}: una chiave segreta non deve mai avere il prefisso NEXT_PUBLIC_`);
  }
}

if (problems.length) {
  console.log("\n⚠ Da completare in .env.local:");
  for (const p of problems) console.log(`  - ${p}`);
  console.log("\nVedi README.md → «Configurazione di Supabase».");
  process.exitCode = 1;
} else {
  console.log("✔ Variabili Supabase presenti. Avvia con: npm run dev");
}
