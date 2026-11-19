/**
 * Plain-language texts for readers who are not compliance experts.
 *
 * These explain CONCEPTS (areas, statuses, numbers, what to do next). They never
 * paraphrase legal obligations: requirements are always quoted with their
 * official text in the report.
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

export const STATUS_EXPLANATIONS: { label: string; text: string }[] = [
  { label: "Implementato", text: "la misura è in atto ed è possibile dimostrarlo." },
  { label: "Parziale", text: "la misura esiste solo in parte o non copre tutto ciò che è richiesto." },
  { label: "Non implementato", text: "la misura non è presente." },
  {
    label: "Non applicabile",
    text: "il requisito non riguarda l'organizzazione; la motivazione è documentata.",
  },
  { label: "Non valutato", text: "il requisito non è ancora stato esaminato." },
];

export const GLOSSARY: { term: string; text: string }[] = [
  {
    term: "Assessment",
    text: "Valutazione, requisito per requisito, di quanto l'organizzazione ha già messo in atto rispetto a una normativa.",
  },
  {
    term: "Requisito",
    text: "Singola richiesta della normativa. Nel report è sempre riportato con il suo testo ufficiale e il riferimento preciso.",
  },
  {
    term: "Lacuna (gap)",
    text: "Requisito valutato «Parziale» o «Non implementato»: indica qualcosa che manca e va completato.",
  },
  {
    term: "Criticità",
    text: "Gravità attribuita dall'organizzazione a una lacuna (bassa, media, alta, critica) per decidere le priorità.",
  },
  {
    term: "Attività correttiva",
    text: "Azione pianificata per colmare una lacuna, con un responsabile e una scadenza.",
  },
  {
    term: "Requisito applicabile",
    text: "Requisito che riguarda l'organizzazione: tutti tranne quelli dichiarati «Non applicabile».",
  },
  {
    term: "Soggetto essenziale / importante",
    text: "Categorie previste dalla normativa NIS2. In questo report la classificazione è quella dichiarata dall'organizzazione, non calcolata dal software.",
  },
  {
    term: "ACN",
    text: "Agenzia per la cybersicurezza nazionale: l'autorità italiana che stabilisce le misure di sicurezza di base per i soggetti NIS2.",
  },
];

export const DISCLAIMER =
  "Questo report riassume valutazioni dichiarate dall'organizzazione stessa. Non è una certificazione di conformità e non sostituisce il parere di professionisti qualificati o le verifiche delle autorità competenti.";
