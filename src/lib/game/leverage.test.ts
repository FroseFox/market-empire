import { describe, expect, it } from "vitest";
import * as E from "./engine";
import { LEVERAGE, CITY_RANKS } from "./config";
import { pack, unpack } from "./pack";

const T0 = 1_700_000_000_000;
const ok = (r: E.ActionResult) => { if (!r.ok) throw new Error(r.error); return r.state; };
/** Partie au rang voulu, avec de quoi miser. */
const game = (rank: number, cash = 100_000): E.GameState => ({ ...E.newGame(T0), population: CITY_RANKS[rank].pop, cash });

describe("effet de levier", () => {
  it("multiplie les gains et les pertes par le levier", () => {
    const g = ok(E.openLeverage(game(2), "AAPL", 10_000, 5, 200, T0));
    const p = g.positions![0];
    expect(p.qty).toBeCloseTo(250, 6);                 // 50 000 € d'exposition à 200 €
    expect(E.levValue(p, 204)).toBeCloseTo(11_000, 2); // +2 % du cours = +10 % de la mise
    expect(E.levValue(p, 196)).toBeCloseTo(9_000, 2);
    expect(g.cash).toBeCloseTo(100_000 - 10_000 - 50, 2); // mise + frais de 0,1 % sur l'exposition
  });

  it("rend la mise et le gain à la clôture, frais déduits", () => {
    const g = ok(E.openLeverage(game(2), "AAPL", 10_000, 5, 200, T0));
    const closed = ok(E.closeLeverage(g, g.positions![0].id, 204, T0 + 1000));
    expect(closed.positions).toHaveLength(0);
    expect(closed.cash).toBeCloseTo(g.cash + 11_000 - 51, 2);
    expect(closed.realized).toBeCloseTo(1_000 - 51, 2);
  });

  it("ne fait jamais perdre plus que la mise", () => {
    const g = ok(E.openLeverage(game(2), "AAPL", 10_000, 5, 200, T0));
    expect(E.levValue(g.positions![0], 100)).toBe(0);
    const closed = ok(E.closeLeverage(g, g.positions![0].id, 100, T0 + 1000));
    expect(closed.cash).toBeCloseTo(g.cash, 2);
  });

  it("ferme d'office la position quand il ne reste que 10 % de la mise", () => {
    const g = ok(E.openLeverage(game(2), "AAPL", 10_000, 5, 200, T0));
    const liq = E.levLiquidationPrice(g.positions![0]);
    expect(liq).toBeCloseTo(200 * (1 - (1 - LEVERAGE.liquidation) / 5), 6); // −18 % avec un levier ×5
    expect(E.settleLeverage(g, { AAPL: liq + 1 }, T0).closed).toHaveLength(0);
    const r = E.settleLeverage(g, { AAPL: liq - 0.5 }, T0);
    expect(r.closed).toHaveLength(1);
    expect(r.state.positions).toHaveLength(0);
    expect(r.state.cash).toBeGreaterThan(g.cash);        // il reste un petit quelque chose
    expect(r.state.cash).toBeLessThan(g.cash + 1_000);
    // Cours inconnu : on ne ferme rien
    expect(E.settleLeverage(g, {}, T0).closed).toHaveLength(0);
  });

  it("fait payer des intérêts sur la somme empruntée à chaque jour de ville", () => {
    let g = ok(E.openLeverage(game(2), "AAPL", 10_000, 5, 200, T0));
    g = E.tickDay(g, { AAPL: 200 }, T0 + E.DAY_MS);
    expect(g.positions![0].interest).toBeCloseTo(40_000 * LEVERAGE.dayRate, 2);
    expect(E.levValue(g.positions![0], 200)).toBeCloseTo(10_000 - 8, 2);
  });

  it("compte les positions dans le patrimoine", () => {
    const g = ok(E.openLeverage(game(2), "AAPL", 10_000, 5, 200, T0));
    expect(E.leverageValue(g, { AAPL: 204 })).toBeCloseTo(11_000, 2);
    expect(E.snapshot(g, { AAPL: 204 }, T0).portfolio).toBeCloseTo(11_000, 2);
  });

  it("ouvre les leviers avec le rang de la ville et les limite selon l'actif", () => {
    expect(E.maxLeverage(game(0))).toBe(1);
    expect(E.maxLeverage(game(1))).toBe(2);
    expect(E.maxLeverage(game(2))).toBe(5);
    expect(E.maxLeverage(game(3))).toBe(10);
    expect(E.maxLeverage(game(3), "AAPL")).toBe(5);  // action
    expect(E.maxLeverage(game(3), "BTC")).toBe(2);   // crypto
    expect(E.openLeverage(game(0), "AAPL", 10_000, 2, 200, T0).ok).toBe(false);
    expect(E.openLeverage(game(1), "AAPL", 10_000, 5, 200, T0).ok).toBe(false);
    expect(E.openLeverage(game(3), "AAPL", 10_000, 10, 200, T0).ok).toBe(false);
    expect(E.openLeverage(game(2), "AAPL", 100, 2, 200, T0).ok).toBe(false);          // mise trop faible
    expect(E.openLeverage(game(2, 5_000), "AAPL", 5_000, 2, 200, T0).ok).toBe(false); // pas de quoi payer les frais
    expect(E.featureOpen(game(0), "leverage")).toBe(false);
    expect(E.featureOpen(game(1), "leverage")).toBe(true);
  });

  it("survit à la sauvegarde en ligne", () => {
    const g = ok(E.openLeverage(game(2), "AAPL", 10_000, 5, 200, T0));
    const back = E.normalize(unpack(JSON.parse(JSON.stringify(pack(g)))));
    expect(back.positions).toEqual(g.positions);
    expect(back.transactions[0].label).toBe(g.transactions[0].label);
  });
});
