import type { Nis2Classification } from "@/types/database";

type VersionLike = { id: string; version_label: string; source_title: string };

const ACN_ANNEX = /Allegato (\d) – Misure di sicurezza di base per i (soggetti \w+)/;
const EU_DIRECTIVE = /^Direttiva \(UE\) (\d{4}\/\d+)/;

/** Short, unambiguous name for a catalogue version (derived from its official title). */
export function catalogueLabel(version: Pick<VersionLike, "source_title" | "version_label">): string {
  const acn = ACN_ANNEX.exec(version.source_title);
  if (acn) return `Misure di base ACN – ${acn[2]} (Allegato ${acn[1]})`;
  const directive = EU_DIRECTIVE.exec(version.source_title);
  if (directive?.[1] === "2022/2555") return "Direttiva (UE) 2022/2555 (NIS2)";
  return version.source_title.split(",")[0] ?? version.version_label;
}

/**
 * Catalogue matching the classification the organisation DECLARED.
 * The software never infers the classification; with "not determined" there
 * is no suggestion.
 */
export function suggestedVersionId(
  versions: VersionLike[],
  classification: Nis2Classification | null,
): string | null {
  const subject =
    classification === "essential"
      ? "soggetti essenziali"
      : classification === "important"
        ? "soggetti importanti"
        : null;
  if (!subject) return null;
  return versions.find((v) => v.source_title.includes(`per i ${subject}`))?.id ?? null;
}
