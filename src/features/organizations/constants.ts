import type { Nis2Classification, OrgRole, SizeClass } from "@/types/database";

/**
 * Sectors listed in Annexes I and II of Directive (EU) 2022/2555.
 * Informational only: picking a sector never determines whether NIS2 applies
 * (that depends on sub-sector, entity type, size and national rules, including
 * the additional categories in the annexes of D.Lgs. 138/2024).
 */
export const SECTORS = [
  { value: "energy", label: "Energia", annex: "I" },
  { value: "transport", label: "Trasporti", annex: "I" },
  { value: "banking", label: "Settore bancario", annex: "I" },
  { value: "financial_market_infrastructures", label: "Infrastrutture dei mercati finanziari", annex: "I" },
  { value: "health", label: "Sanità", annex: "I" },
  { value: "drinking_water", label: "Acqua potabile", annex: "I" },
  { value: "waste_water", label: "Acque reflue", annex: "I" },
  { value: "digital_infrastructure", label: "Infrastrutture digitali", annex: "I" },
  { value: "ict_service_management", label: "Gestione dei servizi TIC (B2B)", annex: "I" },
  { value: "public_administration", label: "Pubblica amministrazione", annex: "I" },
  { value: "space", label: "Spazio", annex: "I" },
  { value: "postal_courier", label: "Servizi postali e di corriere", annex: "II" },
  { value: "waste_management", label: "Gestione dei rifiuti", annex: "II" },
  { value: "chemicals", label: "Sostanze chimiche", annex: "II" },
  { value: "food", label: "Prodotti alimentari", annex: "II" },
  { value: "manufacturing", label: "Fabbricazione", annex: "II" },
  { value: "digital_providers", label: "Fornitori di servizi digitali", annex: "II" },
  { value: "research", label: "Ricerca", annex: "II" },
  { value: "other", label: "Altro", annex: null },
  { value: "not_specified", label: "Non specificato", annex: null },
] as const;

export type SectorValue = (typeof SECTORS)[number]["value"];
export const SECTOR_VALUES = SECTORS.map((s) => s.value) as [SectorValue, ...SectorValue[]];

/** Size classes as defined by Commission Recommendation 2003/361/EC. */
export const SIZE_CLASSES: { value: SizeClass; label: string }[] = [
  { value: "micro", label: "Microimpresa" },
  { value: "small", label: "Piccola impresa" },
  { value: "medium", label: "Media impresa" },
  { value: "large", label: "Grande impresa" },
  { value: "not_specified", label: "Non specificata" },
];
export const SIZE_CLASS_VALUES = SIZE_CLASSES.map((s) => s.value) as [SizeClass, ...SizeClass[]];

export const NIS2_CLASSIFICATIONS: { value: Nis2Classification; label: string; description: string }[] = [
  {
    value: "not_determined",
    label: "Non determinata",
    description: "Nessuna classificazione dichiarata.",
  },
  {
    value: "essential",
    label: "Soggetto essenziale",
    description: "Dichiarata dall'organizzazione, con motivazione.",
  },
  {
    value: "important",
    label: "Soggetto importante",
    description: "Dichiarata dall'organizzazione, con motivazione.",
  },
  {
    value: "not_in_scope",
    label: "Fuori ambito",
    description: "L'organizzazione dichiara di non rientrare nell'ambito di applicazione.",
  },
];
export const NIS2_CLASSIFICATION_VALUES = NIS2_CLASSIFICATIONS.map((c) => c.value) as [
  Nis2Classification,
  ...Nis2Classification[],
];

export const ROLES: { value: OrgRole; label: string; description: string }[] = [
  {
    value: "org_admin",
    label: "Amministratore",
    description: "Gestisce dati aziendali, membri, inviti e tutti i moduli.",
  },
  {
    value: "security_manager",
    label: "Security manager",
    description: "Gestisce assessment, attività correttive ed evidenze.",
  },
  {
    value: "auditor",
    label: "Auditor",
    description: "Consulta tutto, incluso l'audit log, senza modificare.",
  },
  { value: "viewer", label: "Lettore", description: "Consulta dashboard, assessment e attività." },
];
export const ROLE_VALUES = ROLES.map((r) => r.value) as [OrgRole, ...OrgRole[]];

export function labelOf<T extends string>(
  list: readonly { value: T; label: string }[],
  value: T | string,
): string {
  return list.find((item) => item.value === value)?.label ?? value;
}
