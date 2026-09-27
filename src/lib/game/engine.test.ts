import { describe, expect, it } from "vitest";
import { build, buy, catchUp, computeCity, DAY_MS, demolish, newGame, sell, tickDay } from "./engine";
import { STARTING_CASH } from "./config";

const T0 = Date.UTC(2026, 8, 27, 12);

describe("ville de départ (doc Équilibrage §2)", () => {
  const g = newGame(T0);
  const c = computeCity(g);
  it("250 habitants, 250 logements, 150 emplois", () => {
    expect(g.population).toBe(250);
    expect(c.housing).toBe(250);
    expect(c.jobs).toBe(150);
  });
  it("≈ 500 €/jour de revenus locaux", () => {
    expect(c.income.total).toBeGreaterThan(420);
    expect(c.income.total).toBeLessThan(620);
  });
  it("énergie et nourriture suffisantes", () => {
    expect(c.energy.balance).toBeGreaterThanOrEqual(0);
    expect(c.food.balance).toBeGreaterThanOrEqual(0);
  });
  it("flux net positif", () => expect(c.net).toBeGreaterThan(0));
  it("patrimoine initial = 100 000 € (la ville offerte ne compte pas)", () => {
    expect(g.history[0].netWorth).toBe(STARTING_CASH);
  });
});

describe("bourse", () => {
  it("achat puis vente avec frais", () => {
    let g = newGame(T0);
    const r = buy(g, "AAPL", 10, 200, T0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    g = r.state;
    expect(g.cash).toBe(STARTING_CASH - 2000 - 2); // 0,1 % de frais
    expect(g.holdings.AAPL.qty).toBe(10);
    const s = sell(g, "AAPL", 10, 220, T0);
    expect(s.ok).toBe(true);
    if (s.ok) {
      expect(s.state.holdings.AAPL).toBeUndefined();
      expect(s.state.cash).toBeCloseTo(STARTING_CASH - 2002 + 2200 - 2.2, 2);
    }
  });
  it("refuse un achat au-delà des liquidités", () => {
    expect(buy(newGame(T0), "NVDA", 10_000, 200, T0).ok).toBe(false);
  });
  it("refuse de vendre plus que détenu", () => {
    const r = buy(newGame(T0), "KO", 5, 60, T0);
    if (r.ok) expect(sell(r.state, "KO", 6, 60, T0).ok).toBe(false);
  });
});

describe("ville", () => {
  it("construire des logements + emplois fait croître la population", () => {
    let g = newGame(T0);
    for (const id of ["house_s", "house_s", "shop", "shop"]) {
      const r = build(g, id, T0); expect(r.ok).toBe(true); if (r.ok) g = r.state;
    }
    const before = g.population;
    for (let i = 0; i < 10; i++) g = tickDay(g, {}, T0 + i * DAY_MS);
    expect(g.population).toBeGreaterThan(before);
    expect(g.population).toBeLessThanOrEqual(computeCity(g).housing);
  });
  it("bâtiment verrouillé tant que la population est trop faible", () => {
    expect(build(newGame(T0), "house_m", T0).ok).toBe(false);
  });
  it("démolition rembourse 50 %", () => {
    const r = build(newGame(T0), "shop", T0);
    if (!r.ok) throw new Error();
    const d = demolish(r.state, "shop", T0);
    expect(d.ok && d.state.cash).toBe(STARTING_CASH - 15_000 + 7_500);
  });
  it("trop de logements sans emplois → chômage", () => {
    let g = newGame(T0);
    for (let i = 0; i < 4; i++) { const r = build(g, "house_s", T0); if (r.ok) g = r.state; }
    for (let i = 0; i < 40; i++) g = tickDay(g, {}, T0 + i * DAY_MS);
    expect(computeCity(g).unemploymentRate).toBeGreaterThan(0.2);
  });
});

describe("temps", () => {
  it("rattrape les jours écoulés, plafonné", () => {
    const g = newGame(T0);
    const { state, days } = catchUp(g, T0 + 3.5 * DAY_MS, {});
    expect(days).toBe(3);
    expect(state.day).toBe(4);
    expect(state.lastTick).toBe(T0 + 3 * DAY_MS);
    const far = catchUp(g, T0 + 1000 * DAY_MS, {});
    expect(far.days).toBe(24);
  });
});
