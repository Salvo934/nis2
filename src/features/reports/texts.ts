/**
 * Texts of the PDF report.
 *
 * They explain CONCEPTS (areas, statuses, indicators, limits). They never
 * paraphrase legal obligations: requirements are always quoted with their
 * official text and source reference.
 */

/** Simplified description of each catalogue area (category_code). */
export const AREA_EXPLANATIONS: Record<string, string> = {
  // Framework nazionale functions (ACN basic measures)
  GV: "Come l'organizzazione decide, assegna le responsabilità e stabilisce le regole (politiche) per gestire il rischio informatico, compresi i rapporti con i fornitori.",
  ID: "Sapere che cosa va protetto (sistemi, software, dati, servizi dei fornitori) e quali sono i rischi e le vulnerabilità.",
  PR: "Le misure che impediscono o limitano i danni: controllo degli accessi, autenticazione, formazione, protezione dei dati, backup, aggiornamenti.",
  DE: "La capacità di accorgersi in tempo di attività anomale o di attacchi, grazie al monitoraggio e ai registri (log).",
  RS: "Che cosa si fa quando si verifica un incidente: gestione, coordinamento e comunicazione, comprese le notifiche previste.",
  RC: "Come si torna alla normalità dopo un incidente, ripristinando sistemi e servizi.",
  // Directive (EU) 2022/2555 catalogue
  GOV: "Il ruolo dei vertici aziendali: approvare le misure di sicurezza, sorvegliarne l'attuazione e formarsi sui rischi informatici.",
  RM: "Le misure tecniche e organizzative per gestire i rischi informatici, nelle aree indicate dalla Direttiva.",
  INC: "Gli obblighi di segnalare gli incidenti significativi alle autorità e, quando serve, ai destinatari dei servizi.",
};

/** Implementation status as declared by the organisation. */
export const IMPLEMENTATION_STATUS_LABELS = {
  implemented: "Implementato",
  partial: "Parzialmente implementato",
  not_implemented: "Non implementato",
  not_applicable: "Non applicabile",
  not_assessed: "Non valutato",
} as const;

export const IMPLEMENTATION_STATUS_TEXT: { label: string; text: string }[] = [
  {
    label: "Implementato",
    text: "l'organizzazione dichiara che la misura è in atto. È un'autodichiarazione: non significa che sia stata verificata.",
  },
  {
    label: "Parzialmente implementato",
    text: "la misura esiste solo in parte o non copre tutto ciò che il requisito chiede.",
  },
  { label: "Non implementato", text: "la misura non è presente." },
  {
    label: "Non applicabile",
    text: "l'organizzazione dichiara che il requisito non la riguarda; la motivazione è riportata nel registro.",
  },
  {
    label: "Non valutato",
    text: "il requisito non è ancora stato esaminato. Non è mai contato come implementato.",
  },
];

/** Verification status. The platform does not yet manage verification. */
export const VERIFICATION_STATUS_TEXT: { label: string; text: string }[] = [
  { label: "Non verificato", text: "nessuna verifica delle evidenze è registrata per il requisito." },
  { label: "In verifica", text: "la verifica è in corso." },
  { label: "Verificato", text: "un verificatore ha esaminato le evidenze con esito positivo." },
  { label: "Evidenze insufficienti", text: "la verifica ha avuto esito negativo per mancanza di evidenze." },
  { label: "Non applicabile alla verifica", text: "il requisito è dichiarato non applicabile." },
];

export const COLOR_LEGEND: { color: "declared" | "verified" | "partial" | "gap" | "muted"; text: string }[] =
  [
    { color: "declared", text: "Blu: implementato secondo l'autodichiarazione, non verificato." },
    { color: "verified", text: "Verde: verificato con evidenze (riservato alle verifiche registrate)." },
    { color: "partial", text: "Ambra: parzialmente implementato o in attesa." },
    { color: "gap", text: "Rosso: lacuna o criticità (non implementato, in ritardo)." },
    { color: "muted", text: "Grigio: non valutato, non applicabile o dato non disponibile." },
  ];

export const NOT_AVAILABLE = "Dato non disponibile";

/** Capabilities the platform does not offer yet: stated, never simulated. */
export const EVIDENCE_UNAVAILABLE =
  "Non risultano evidenze documentali associate ai requisiti esaminati nel presente report. La piattaforma, alla data del report, non dispone di un registro delle evidenze né di un processo di verifica: per questo nessun requisito risulta verificato e gli indicatori di copertura documentale e delle verifiche sono riportati come «non disponibili» invece che con una percentuale.";

export const RISKS_UNAVAILABLE =
  "L'analisi dei rischi non è inclusa nel report: la piattaforma non gestisce un registro dei rischi con probabilità, impatto e trattamento. La gravità attribuita alle lacune (sezione 5) è una priorità dichiarata dall'organizzazione e non è una valutazione del rischio; il report non ricava livelli di rischio dagli esiti «Parzialmente implementato» o «Non implementato».";

export const GLOSSARY: { term: string; text: string }[] = [
  {
    term: "Assessment",
    text: "Valutazione, requisito per requisito, di quanto l'organizzazione dichiara di aver messo in atto rispetto a un catalogo normativo.",
  },
  {
    term: "Requisito",
    text: "Singola richiesta del catalogo. Nel report è riportato con il testo ufficiale e il riferimento preciso alla fonte.",
  },
  {
    term: "Autodichiarazione",
    text: "Esito indicato dall'organizzazione senza una verifica indipendente delle evidenze.",
  },
  {
    term: "Evidenza",
    text: "Documento o registrazione (procedura, verbale, log, contratto) che dimostra quanto dichiarato.",
  },
  {
    term: "Verifica",
    text: "Esame delle evidenze da parte di un verificatore, con data ed esito. È un passaggio distinto dalla dichiarazione.",
  },
  {
    term: "Lacuna (gap)",
    text: "Requisito valutato «Parzialmente implementato» o «Non implementato».",
  },
  {
    term: "Gravità",
    text: "Priorità attribuita dall'organizzazione a una lacuna (bassa, media, alta, critica). Non è una valutazione del rischio.",
  },
  {
    term: "Attività correttiva",
    text: "Azione pianificata per colmare una lacuna, con un responsabile e una scadenza. Completarla non equivale a verificarne l'efficacia.",
  },
  {
    term: "Requisito applicabile",
    text: "Requisito che riguarda l'organizzazione: tutti tranne quelli dichiarati «Non applicabile».",
  },
  {
    term: "Soggetto essenziale / importante",
    text: "Categorie previste dalla normativa NIS2. Il report riporta la classificazione dichiarata dall'organizzazione; il software non la calcola.",
  },
  {
    term: "ACN",
    text: "Agenzia per la cybersicurezza nazionale: l'autorità italiana che ha adottato le misure di sicurezza di base per i soggetti NIS2.",
  },
];

/** Mandatory disclaimer (verbatim). */
export const DISCLAIMER =
  "Il presente documento rappresenta una valutazione dello stato di attuazione dei requisiti inclusi nel catalogo normativo indicato, sulla base delle informazioni e delle evidenze disponibili alla data di generazione. Le dichiarazioni non sottoposte a verifica indipendente sono riportate come autodichiarazioni. Il report non costituisce certificazione di conformità NIS2 né sostituisce le verifiche previste dalle autorità competenti.";
