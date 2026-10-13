import { describe, expect, it } from "vitest";
import * as E from "./engine";
import { BRANCH_PERK_CAPS, SECTOR_PERKS } from "./config";
import { ASSETS } from "../market/universe";

const bySector = (sector: string) => ASSETS.find((a) => a.kind === "stock" && a.sector === sector)!;
/** Partie avec des sites d'entreprises de ces secteurs, participations détenues (sites actifs). */
function withSites(sectors: string[], held = true) {
  const g = E.newGame(Date.UTC(2026, 9, 1));
  const assets = sectors.map(bySector);
  g.branches = assets.map((a) => ({ symbol: a.symbol, minQty: 10 }));
  g.holdings = Object.fromEntries(assets.map((a) => [a.symbol, { qty: held ? 10 : 1, avgCost: 100 }]));
  return g;
}

describe("bonus de secteur des entreprises implantées", () => {
  it("chaque secteur d'action du jeu a un bonus", () => {
    const sectors = new Set(ASSETS.filter((a) => a.kind === "stock").map((a) => a.sector));
    for (const s of sectors) expect(SECTOR_PERKS[s], s).toBeDefined();
  });
  it("logiciels : recherches moins chères ; paiements : frais réduits ; semi-conducteurs : moins d'énergie", () => {
    const g = withSites(["Logiciels", "Paiements", "Semi-conducteurs"]);
    expect(E.researchPrice(g, 100_000)).toBe(90_000);
    const sym = ASSETS.find((a) => a.kind === "etf")!.symbol;
    expect(E.feeFactor(g, sym)).toBeCloseTo(E.feeFactor({ ...g, branches: [] }, sym) * 0.8);
    // Même famille (Tech), seul le secteur change : la ville avec les puces consomme 5 % de moins
    const chips = E.computeCity(withSites(["Semi-conducteurs"])).energy.use, soft = E.computeCity(withSites(["Logiciels"])).energy.use;
    expect(chips).toBeCloseTo(soft * 0.95);
  });
  it("site en sommeil (participation vendue) : aucun bonus", () => {
    const g = withSites(["Logiciels"], false);
    expect(E.researchPrice(g, 100_000)).toBe(100_000);
  });
  it("les bonus propres sont plafonnés", () => {
    const g = withSites(["Paiements", "Paiements", "Paiements"]);
    // Trois fois la même entreprise n'est pas possible en jeu, mais le plafond tient quand même
    g.branches = [0, 1, 2].map(() => g.branches![0]);
    expect(E.branchPerks(g).feeCut).toBeLessThanOrEqual(BRANCH_PERK_CAPS.feeCut);
  });
  it("Défense : la sécurité couvre des habitants en plus", () => {
    const g = withSites(["Défense"]);
    const without = E.computeCity({ ...g, branches: [] }).services.safety.capacity;
    expect(E.computeCity(g).services.safety.capacity).toBe(without + 3_000);
  });
});
