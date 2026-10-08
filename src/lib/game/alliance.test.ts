import { describe, expect, it } from "vitest";
import * as E from "./engine";
import { ALLIANCE, CONTRACT_RATIO, EXPORT_RATIO, RESOURCE_PRICES } from "./config";
import { pack, unpack } from "./pack";

const T0 = 1_700_000_000_000;
const alliance = (treasury: number, members = ["me", "ami"]): E.AllianceState => ({ id: "a1", name: "Les Titans", tag: "TIT", treasury, leader: "me", members, gift: 0 });

describe("alliances", () => {
  it("le niveau suit la caisse commune", () => {
    expect(E.allianceLevel(0)).toBe(0);
    expect(E.allianceLevel(ALLIANCE.levels[1] - 1)).toBe(0);
    expect(E.allianceLevel(ALLIANCE.levels[1])).toBe(1);
    expect(E.allianceLevel(ALLIANCE.levels[3] + 5)).toBe(3);
    expect(E.allianceLevel(1e15)).toBe(ALLIANCE.levels.length - 1);
  });

  it("chaque niveau augmente les revenus des bâtiments, sans toucher aux impôts", () => {
    const g = E.newGame(T0), base = E.computeCity(g);
    const boosted = E.computeCity({ ...g, alliance: alliance(ALLIANCE.levels[2]) });
    expect(boosted.income.buildings).toBeCloseTo(base.income.buildings * (1 + 2 * ALLIANCE.bonusPerLevel), 6);
    expect(boosted.income.taxes).toBeCloseTo(base.income.taxes, 6);
    expect(E.computeCity({ ...g, alliance: alliance(0) }).income.buildings).toBeCloseTo(base.income.buildings, 6); // niveau 0 : pas de bonus
  });

  it("un contrat entre alliés se fait à un meilleur prix des deux côtés", () => {
    const g = E.newGame(T0), surplus = E.computeCity(g).energy.balance;
    expect(surplus).toBeGreaterThan(10);
    const sell = (partner: string, a?: E.AllianceState) => E.computeCity({ ...g, alliance: a, contracts: [{ id: "c", resource: "energy", qty: 10, side: "sell", partner }] }).exportsValue;
    const gainOf = (ratio: number) => 10 * (ratio - EXPORT_RATIO) * RESOURCE_PRICES.energy;
    expect(sell("ami", alliance(0)) - sell("ami")).toBeCloseTo(gainOf(ALLIANCE.contract.sell) - gainOf(CONTRACT_RATIO), 6);
    expect(sell("inconnu", alliance(0))).toBeCloseTo(sell("inconnu"), 6); // hors alliance : prix habituel
    // Côté acheteur : une ville qui manque d'énergie paie moins cher à un allié
    const short = { ...g, buildings: { ...g.buildings, power_s: 0 } };
    const buy = (a?: E.AllianceState) => E.computeCity({ ...short, alliance: a, contracts: [{ id: "c", resource: "energy", qty: 10, side: "buy", partner: "ami" }] }).importsValue;
    expect(buy() - buy(alliance(0))).toBeCloseTo(10 * (CONTRACT_RATIO - ALLIANCE.contract.buy) * RESOURCE_PRICES.energy, 6);
  });

  it("fonder ou verser à la caisse coûte de l'argent qui ne revient pas", () => {
    const g = E.payAlliance({ ...E.newGame(T0), cash: 500_000 }, ALLIANCE.cost, "Alliance fondée : Les Titans", T0);
    expect(g.cash).toBe(500_000 - ALLIANCE.cost);
    expect(g.today?.extra).toBe(-ALLIANCE.cost);
    expect(g.transactions[0].amount).toBe(-ALLIANCE.cost);
  });

  it("reprend l'alliance du serveur, et l'oublie quand le joueur la quitte", () => {
    const g = E.newGame(T0), joined = E.setAlliance(g, alliance(5));
    expect(joined.alliance?.tag).toBe("TIT");
    expect(E.setAlliance(joined, alliance(5))).toBe(joined);
    expect(E.featureOpen(joined, "alliances")).toBe(true);
    expect(E.featureOpen(g, "alliances")).toBe(false);
    const left = E.setAlliance(joined, null);
    expect("alliance" in left).toBe(false);
    expect(E.setAlliance(g, null)).toBe(g);
  });

  it("survit à la sauvegarde en ligne", () => {
    const g = { ...E.newGame(T0), alliance: alliance(1_500_000) };
    expect(E.normalize(unpack(JSON.parse(JSON.stringify(pack(g))))).alliance).toEqual(g.alliance);
  });
});
