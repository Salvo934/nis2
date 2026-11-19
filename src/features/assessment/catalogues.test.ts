import { describe, expect, it } from "vitest";

import { catalogueLabel, suggestedVersionId } from "./catalogues";

const versions = [
  {
    id: "dir",
    version_label: "2022/2555-v1",
    source_title: "Direttiva (UE) 2022/2555 del Parlamento europeo e del Consiglio, del 14 dicembre 2022",
  },
  {
    id: "imp",
    version_label: "ACN-379907-2025-all1",
    source_title:
      "Determinazione ACN n. 379907 del 19 dicembre 2025, Allegato 1 – Misure di sicurezza di base per i soggetti importanti",
  },
  {
    id: "ess",
    version_label: "ACN-379907-2025-all2",
    source_title:
      "Determinazione ACN n. 379907 del 19 dicembre 2025, Allegato 2 – Misure di sicurezza di base per i soggetti essenziali",
  },
];

describe("catalogueLabel", () => {
  it("distinguishes the ACN annexes", () => {
    expect(catalogueLabel(versions[1]!)).toBe("Misure di base ACN – soggetti importanti (Allegato 1)");
    expect(catalogueLabel(versions[2]!)).toBe("Misure di base ACN – soggetti essenziali (Allegato 2)");
    expect(catalogueLabel(versions[0]!)).toBe("Direttiva (UE) 2022/2555 (NIS2)");
  });
});

describe("suggestedVersionId", () => {
  it("follows only the classification declared by the organisation", () => {
    expect(suggestedVersionId(versions, "essential")).toBe("ess");
    expect(suggestedVersionId(versions, "important")).toBe("imp");
    expect(suggestedVersionId(versions, "not_determined")).toBeNull();
    expect(suggestedVersionId(versions, "not_in_scope")).toBeNull();
    expect(suggestedVersionId(versions, null)).toBeNull();
  });
});
