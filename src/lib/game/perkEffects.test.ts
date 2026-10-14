import { describe, expect, it } from "vitest";
import { SECTOR_PERKS, perkEffects } from "./config";

describe("perkEffects (effet chiffré des bonus d'entreprise, affiché dans le wiki)", () => {
  it("chiffre chaque bonus de secteur", () => {
    for (const [sector, { perk }] of Object.entries(SECTOR_PERKS)) {
      const keys = Object.keys(perk).filter((k) => k !== "service" && k !== "serves");
      const lines = perkEffects(perk);
      // Un texte par effet (service + nombre d'habitants = un seul texte)
      expect(lines.length, sector).toBe(keys.length + (perk.service ? 1 : 0));
      for (const l of lines) expect(l, sector).toMatch(/\d/);
    }
  });
  it("donne les bonnes valeurs", () => {
    expect(perkEffects({ visitors: 0.05 })).toEqual(["+5 % de visiteurs"]);
    expect(perkEffects({ joy: 0.015 })).toEqual(["+1,5 pt de satisfaction"]);
    expect(perkEffects({ researchCut: 0.1 })).toEqual(["recherches −10 %"]);
    expect(perkEffects({ service: "safety", serves: 3000 })).toEqual(["sécurité pour 3 000 habitants"]);
    expect(perkEffects({ foodProd: 120, pollution: 15 })).toEqual(["+120 de nourriture / jour", "pollution +15"]);
  });
});
