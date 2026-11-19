# Fonti normative

Testi ufficiali da cui sono costruiti i cataloghi in `data/catalogs/`. Ogni requisito del catalogo riporta il testo
di queste fonti senza parafrasi. I file `.txt` sono estratti dai PDF con `scripts/catalog/extract-pdf-text.mjs` e
sono quelli che parser e test confrontano.

Scaricati il 19/11/2026 da `www.acn.gov.it` (percorso `/portale/documents/d/guest/<nome file senza estensione>`).

| File | Atto | Stato | SHA-256 del PDF |
|---|---|---|---|
| `acn/detacn_obblighi_2511-v3_signed.pdf` | Determinazione del Direttore generale ACN sulle specifiche di base (artt. 23, 24, 25, 29 e 32 del D.Lgs. 138/2024). Numero **379907 del 19 dicembre 2025**: il numero non è stampato nel PDF ("data del protocollo") ed è riportato nelle FAQ ufficiali ACN (`/portale/faq/nis/misure-di-sicurezza-e-notifica-di-incidenti`). Il testo dichiara che aggiorna e sostituisce la n. 164179 del 14 aprile 2025 e si applica dal 15 gennaio 2026. | **In vigore** — usata | `dfb9d02bb11de75bc14f913d768eeece1e4f5ca7ef9d72ff939bf445c3979127` |
| `acn/allegato-1-v2.pdf` | Allegato 1 – Misure di sicurezza di base per i soggetti importanti (37 misure, 87 requisiti) | **In vigore** — catalogo `ACN-379907-2025-all1` | `260acba9d8f948bb97e977ee71b7dd77cdac93ba2b74d0d42e5da81ceb8f3afb` |
| `acn/allegato-2-v2.pdf` | Allegato 2 – Misure di sicurezza di base per i soggetti essenziali (43 misure, 116 requisiti) | **In vigore** — catalogo `ACN-379907-2025-all2` | `c8466e38fe5347bb0a6f612b6f15c9b4dbdb4ee4a8ee56a8652ab0134ac3fb2b` |
| `acn/allegato-3-v2.pdf`, `acn/allegato-4-v2.pdf` | Allegati 3 e 4 – Incidenti significativi di base (importanti / essenziali) | In vigore — **non ancora nel catalogo** | `d05b0038…a8ca`, `0ab43835…939c` |
| `acn/guida-alla-lettura-specifiche-di-base.pdf` | Linee guida NIS – Specifiche di base, Guida alla lettura (aggiornata con i riferimenti alla Determinazione 127434/2026). Usata per i conteggi ufficiali e per l'Appendice A (corrispondenza misure ↔ art. 24, c. 2, D.Lgs. 138/2024) | Riferimento | `5f901f10b02ef1821fe2c0330d1ea8ed5824379fb03d6c24981177906117aae5` |
| `acn/detacn_nis_specifiche_2025_164179_*.pdf` | Determinazione n. 164179 del 14 aprile 2025 e allegati 1–2 | **Sostituita** — conservata solo per storico | vedi `shasum -a 256` |
| `acn/detacn_categorizzazione_260409-v8_signed.pdf`, `acn/modello-di-categorizzazione-nis-guida-alla-lettura.pdf` | Modello di categorizzazione NIS (aprile 2026) | Non ancora utilizzato nel prodotto | vedi `shasum -a 256` |

## Da verificare / non coperto

- **Testo del D.Lgs. 138/2024**: non è ancora in `docs/fonti/`. Nel catalogo ACN il riferimento all'art. 24, c. 2
  deriva dall'Appendice A della guida ACN, non dalla lettura diretta del decreto. Prima di aggiungere obblighi presi
  dal decreto (es. art. 23 organi di amministrazione, art. 25 notifiche, art. 7 registrazione) va scaricato il testo
  vigente da Normattiva (multivigenza) o dalla Gazzetta Ufficiale (GU n. 230 del 1° ottobre 2024).
- **Determinazione 127434/2026** (termini per i soggetti inseriti per la prima volta nel 2026): citata dalla guida,
  non ancora scaricata. I cataloghi usano solo termini relativi ("diciotto mesi dalla comunicazione di inserimento").
- **Tabelle in appendice agli allegati 1 e 2** (politiche richieste da GV.PO-01 punto 2 e requisiti di ID.RA-06
  punto 2): non trasformate in requisiti autonomi; i requisiti che le richiamano sono riportati integralmente.
