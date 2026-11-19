# Changelog normativo

Ogni modifica ai cataloghi normativi crea una **nuova versione**: le versioni pubblicate sono immutabili nel database.

## 2026-11-19 — Misure di sicurezza di base ACN

- **Aggiunte** le versioni `ACN-379907-2025-all1` (soggetti importanti: 37 misure, 87 requisiti) e
  `ACN-379907-2025-all2` (soggetti essenziali: 43 misure, 116 requisiti) del framework `NIS2-ACN`.
- **Atto**: Determinazione ACN n. 379907 del 19 dicembre 2025, applicabile dal 15 gennaio 2026, che aggiorna e
  sostituisce la Determinazione n. 164179 del 14 aprile 2025. Gli allegati della 164179 non sono stati importati.
- **Granularità**: un requisito del catalogo = un requisito numerato di una misura (es. `GV.RR-02.3`). Raggruppamento per
  funzione del Framework nazionale (Governo, Identificazione, Protezione, Rilevamento, Risposta, Ripristino).
- **Riferimento normativo**: ogni requisito cita la misura ACN e l'elemento dell'art. 24, c. 2, D.Lgs. 138/2024
  secondo l'Appendice A della Guida alla lettura ACN.
- **Verifiche automatiche** (`src/features/assessment/acn-catalogue.test.ts`): conteggi uguali a quelli dichiarati dalla
  guida ACN; testo di ogni requisito e di ogni misura presente parola per parola nell'allegato ufficiale; ogni misura
  presente nell'Appendice A.
- **Impatto sugli assessment esistenti**: nessuno. Gli assessment già creati restano legati alla versione
  `2022/2555-v1` (Direttiva); il nuovo catalogo si sceglie creando un nuovo assessment.

## 2026-11-18 — Direttiva (UE) 2022/2555

- **Aggiunta** la versione `2022/2555-v1` (17 requisiti, artt. 20, 21 e 23), testo ufficiale italiano GU L 333 del
  27.12.2022.
