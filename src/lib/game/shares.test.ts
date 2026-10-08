import { describe, expect, it } from "vitest";
import * as E from "./engine";
import { SHARES } from "./config";
import { pack, unpack } from "./pack";

const T0 = 1_700_000_000_000;
const EMPTY: E.ShareState = { credit: 0, float: 0, sold: 0, held: [], holders: [] };
const stake = (qty: number, netWorth: number, income: number): E.CityStake => ({ city: "c1", name: "Lutèce", qty, cost: 200_000, netWorth, income });

describe("bourse des villes", () => {
  it("le prix d'une part suit le patrimoine publié de la ville", () => {
    expect(E.sharePrice(2_000_000)).toBe(2_000);
    expect(E.sharePrice(10_000)).toBe(SHARES.minValue / SHARES.total); // jamais sous le patrimoine de départ
    expect(E.sharesValue({ shares: { ...EMPTY, held: [stake(100, 2_000_000, 0)] } })).toBe(200_000);
    expect(E.sharesValue({})).toBe(0);
  });

  it("les parts détenues comptent dans le patrimoine", () => {
    const g = { ...E.newGame(T0), shares: { ...EMPTY, held: [stake(100, 3_000_000, 0)] } };
    expect(E.snapshot(g, {}, T0).netWorth).toBe(g.cash + 300_000);
  });

  it("une part verse sa fraction du flux net de la ville, jamais moins que zéro", () => {
    const base = E.computeCity(E.newGame(T0));
    const investor = E.computeCity({ ...E.newGame(T0), shares: { ...EMPTY, held: [stake(100, 2_000_000, 25_000), stake(50, 500_000, -4_000)] } });
    expect(investor.income.dividends).toBeCloseTo(2_500, 6);      // 10 % de 25 000 €, rien de la ville en perte
    expect(investor.net).toBeCloseTo(base.net + 2_500, 6);
    expect(investor.operating).toBeCloseTo(base.net, 6);          // le flux publié ne compte pas les dividendes reçus
  });

  it("le propriétaire verse à ses actionnaires la même fraction de son flux", () => {
    const base = E.computeCity(E.newGame(T0));
    const owner = E.computeCity({ ...E.newGame(T0), shares: { ...EMPTY, float: 300, sold: 250 } });
    expect(owner.expenses.dividends).toBeCloseTo(base.net * 0.25, 6);
    expect(owner.net).toBeCloseTo(base.net * 0.75, 6);
    expect(owner.operating).toBeCloseTo(base.net, 6);
    // Ce que l'actionnaire touche = ce que le propriétaire verse, quand le flux publié est à jour
    const holder = E.computeCity({ ...E.newGame(T0), shares: { ...EMPTY, held: [stake(250, 1, owner.operating)] } });
    expect(holder.income.dividends).toBeCloseTo(owner.expenses.dividends, 6);
  });

  it("l'argent payé par un autre joueur est versé une seule fois", () => {
    let g = E.setShares(E.newGame(T0), EMPTY, T0);                  // premier passage : rien à verser
    expect(g.cash).toBe(100_000);
    g = E.setShares(g, { ...EMPTY, credit: 300_000, float: 300, sold: 150 }, T0 + 1);
    expect(g.cash).toBe(400_000);
    expect(g.transactions[0].amount).toBe(300_000);
    const again = E.setShares(g, { ...EMPTY, credit: 300_000, float: 300, sold: 150 }, T0 + 2);
    expect(again).toBe(g);                                          // même état : rien ne bouge
    g = E.setShares(g, { ...EMPTY, credit: 450_000, float: 300, sold: 200 }, T0 + 3);
    expect(g.cash).toBe(550_000);
  });

  it("une partie recommencée ne touche pas les anciens paiements", () => {
    const g = E.setShares(E.newGame(T0), { ...EMPTY, credit: 900_000 }, T0);
    expect(g.cash).toBe(100_000);
    expect(g.shares?.credit).toBe(900_000);
  });

  it("acheter des parts échange des liquidités contre un actif de même valeur", () => {
    const before = E.newGame(T0);
    let g = E.setShares(before, EMPTY, T0);
    g = E.payShares(g, 20_000, "Bourse des villes : 100 parts de Lutèce", T0);
    g = E.setShares(g, { ...EMPTY, held: [{ ...stake(100, 200_000, 0), cost: 20_000 }] }, T0);
    expect(g.cash).toBe(80_000);
    expect(E.snapshot(g, {}, T0).netWorth).toBe(E.snapshot(before, {}, T0).netWorth);
  });

  it("s'ouvre au rang Petite ville, ou dès qu'on a des parts", () => {
    const g = E.newGame(T0);
    expect(E.featureOpen(g, "shares")).toBe(false);
    expect(E.featureOpen({ ...g, population: SHARES.minPop }, "shares")).toBe(true);
    expect(E.featureOpen({ ...g, shares: { ...EMPTY, sold: 10 } }, "shares")).toBe(true);
  });

  it("survit à la sauvegarde en ligne", () => {
    const g = { ...E.newGame(T0), shares: { ...EMPTY, credit: 5, float: 100, sold: 10, held: [stake(10, 1_000_000, 500)], holders: [{ holder: "h", name: "Beta", qty: 10 }] } };
    expect(E.normalize(unpack(JSON.parse(JSON.stringify(pack(g))))).shares).toEqual(g.shares);
  });
});
