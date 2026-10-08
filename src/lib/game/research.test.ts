import { describe, expect, it } from "vitest";
import * as E from "./engine";
import { BANK, CITY_RANKS, LEVERAGE, RENOVATE_RATE, WEAR_PER_DAY } from "./config";
import { RESEARCH, RESEARCH_BY_ID, RESEARCH_FX, type ResearchFx } from "./research";
import { pack, unpack } from "./pack";

const T0 = 1_700_000_000_000;
const base = (): E.GameState => ({ ...E.newGame(T0), population: CITY_RANKS[2].pop, cash: 1_000_000 });
const withR = (g: E.GameState, ...ids: ResearchFx[]): E.GameState => ({ ...g, research: [...g.research, ...ids] });

describe("arbre de recherche", () => {
  it("est cohérent : identifiants uniques, prérequis existants et placés plus haut, pas deux nœuds au même endroit", () => {
    expect(new Set(RESEARCH.map((n) => n.id)).size).toBe(RESEARCH.length);
    for (const n of RESEARCH) for (const r of n.requires) {
      expect(RESEARCH_BY_ID[r], `${n.id} → ${r}`).toBeDefined();
      expect(RESEARCH_BY_ID[r].row).toBeLessThan(n.row);
    }
    expect(new Set(RESEARCH.map((n) => `${n.col}:${n.row}`)).size).toBe(RESEARCH.length);
    for (const id of Object.keys(RESEARCH_FX)) expect(RESEARCH_BY_ID[id], id).toBeDefined();
  });

  it("une recherche à effet s'achète après son prérequis et survit à la sauvegarde", () => {
    let g = base();
    expect(E.doResearch(g, "bank_fees", T0).ok).toBe(false); // demande « Négociation des taux »
    const r1 = E.doResearch(g, "bank_rates", T0); if (!r1.ok) throw new Error(r1.error); g = r1.state;
    const r2 = E.doResearch(g, "bank_fees", T0); if (!r2.ok) throw new Error(r2.error); g = r2.state;
    expect(g.cash).toBe(1_000_000 - RESEARCH_BY_ID.bank_rates.cost - RESEARCH_BY_ID.bank_fees.cost);
    expect(unpack(pack(g))!.research).toEqual(g.research);
  });
});

describe("effets des recherches", () => {
  it("Banque : intérêts, frais et mise maximale", () => {
    const g = base();
    expect(E.interestRate(g)).toBe(LEVERAGE.dayRate);
    expect(E.interestRate(withR(g, "bank_rates"))).toBeCloseTo(LEVERAGE.dayRate * 0.75, 10);
    expect(E.feeFactor(withR(g, "bank_fees"), "AAPL")).toBeCloseTo(E.feeFactor(g, "AAPL") * 0.8, 10);
    expect(E.investCap(withR(g, "bank_cap"))).toBeCloseTo(E.investCap(g) * 1.25, 6);
    expect(E.investCap(withR({ ...g, bank: BANK.length - 1 }, "bank_cap"))).toBe(Infinity);
  });

  it("Ville : rénovation, vétusté, arrivées, capital et sites d'entreprise", () => {
    const g = { ...base(), wear: 0.5 };
    expect(E.renovateCost(withR(g, "city_works"))).toBe(Math.round(0.5 * E.computeCity(g).cityValue * RENOVATE_RATE * 0.75));
    const c0 = E.computeCity(g).effects, c1 = E.computeCity(withR(g, "city_materials", "city_welcome", "bank_capital")).effects;
    expect(c1.wearCut - c0.wearCut).toBeCloseTo(RESEARCH_FX.city_materials, 10);
    expect(c1.growthBoost - c0.growthBoost).toBeCloseTo(RESEARCH_FX.city_welcome, 10);
    expect(c1.capitalBoost - c0.capitalBoost).toBeCloseTo(RESEARCH_FX.bank_capital, 10);
    const d0 = E.tickDay(g, {}, T0).wear! - g.wear, d1 = E.tickDay(withR(g, "city_materials"), {}, T0).wear! - g.wear;
    expect(d0).toBeCloseTo(WEAR_PER_DAY, 10);
    expect(d1).toBeCloseTo(WEAR_PER_DAY * (1 - RESEARCH_FX.city_materials), 10);
    expect(E.branchLimit(withR(g, "firm_slot"))).toBe(E.branchLimit(g) + 1);
  });

  it("Commerce : exports, imports et blocus", () => {
    const g = base();
    const e0 = E.computeCity(g).effects.exportRatio;
    expect(E.computeCity(withR(g, "trade_customs")).effects.exportRatio).toBeCloseTo(e0 + RESEARCH_FX.trade_customs, 10);
    const blocked = { ...g, alliance: { ...(g.alliance ?? {}), blockadedBy: { tag: "X", until: T0 + 1e9 } } } as E.GameState;
    const lost = e0 - E.computeCity(blocked).effects.exportRatio;
    expect(e0 - E.computeCity(withR(blocked, "trade_defense")).effects.exportRatio).toBeCloseTo(lost / 2, 10);
    // Une ville sans production importe tout : la Centrale d'achat réduit la facture de 10 %
    const bare = { ...g, buildings: { house_s: 30 } } as E.GameState;
    const i0 = E.computeCity(bare).expenses.imports, i1 = E.computeCity(withR(bare, "trade_imports")).expenses.imports;
    expect(i0).toBeGreaterThan(0);
    expect(i1).toBeCloseTo(i0 * 0.9, 6);
  });
});
